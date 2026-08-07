import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { shopSignOptions } from '../../config/jwt.js';
import { sendSignupVerificationEmail, sendPasswordResetEmail } from '../../services/email.service.js';
import { ApiError, ConflictError, NotFoundError, UnauthorizedError } from '../../utils/errors.js';
import { getEmailAllowlist, normalizeEmail } from '../auth/workEmail.js';
import { hashPassword } from '../auth/auth.service.js';
import { PasswordResetToken } from '../auth/passwordResetToken.model.js';
import { Shop } from '../shops/shop.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { ShopCustomer } from './shopCustomer.model.js';
import { ShopSignupPending } from './shopSignupPending.model.js';
import { shopPublicPayload } from './storefront.service.js';

const BCRYPT_ROUNDS = 12;
const OTP_TTL_MS = 2 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const PENDING_TTL_MS = 30 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL = '7d';
const POOLED = ['opened', 'verified'];

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function hashOtp(email, otp) {
  return sha256(`${normalizeEmail(email)}:${otp}`);
}

function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function publicCustomer(customer) {
  return {
    id: String(customer._id),
    shopId: String(customer.shopId),
    email: customer.email,
    name: customer.name,
    claimedViaRedeem: Boolean(customer.claimedViaRedeem),
  };
}

export function signShopCustomerToken(customer) {
  return jwt.sign(
    {
      sub: String(customer._id),
      type: 'shop_customer',
      shopId: String(customer.shopId),
      tenantId: String(customer.tenantId),
      email: customer.email,
    },
    env.JWT_ACCESS_SECRET,
    shopSignOptions({ expiresIn: SESSION_TTL, jwtid: crypto.randomUUID() }),
  );
}

async function loadLiveShop(shopId) {
  const shop = await Shop.findById(shopId).setOptions({ skipTenantGuard: true });
  if (!shop || shop.status !== 'live') throw new NotFoundError('Shop not found');
  return shop;
}

/**
 * Public signup email rules for a shop:
 * - Platform allowlisted emails always OK for any shop
 * - Else must match shop.companyEmailDomain
 */
export async function assertShopSignupEmail(shop, email) {
  const normalized = normalizeEmail(email);
  const allowlist = await getEmailAllowlist();
  if (allowlist.includes(normalized)) return normalized;

  const domain = normalized.split('@')[1] || '';
  const required = String(shop.companyEmailDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!required) {
    throw new ApiError(
      400,
      'This store is not accepting public signups yet. Use your invite link or contact your admin.',
      'SHOP_DOMAIN_NOT_CONFIGURED',
    );
  }
  if (domain !== required) {
    throw new ApiError(
      400,
      `Use your @${required} work email to create an account for this store.`,
      'SHOP_EMAIL_DOMAIN_REQUIRED',
    );
  }
  return normalized;
}

async function findShopCredits({ tenantId, shopId, email }) {
  const campaigns = await Campaign.find({
    tenantId,
    shopId,
    type: 'points',
    status: { $in: ['launched', 'redemption_open'] },
    name: { $ne: '__storefront_self_serve__' },
  })
    .select('_id')
    .setOptions({ skipTenantGuard: true });
  if (!campaigns.length) return { creditAmount: 0, redemptionToken: null };

  const recipients = await Recipient.find({
    tenantId,
    campaignId: { $in: campaigns.map((c) => c._id) },
    email: normalizeEmail(email),
    creditAmount: { $gt: 0 },
    redemptionStatus: { $in: POOLED },
  })
    .sort({ updatedAt: -1 })
    .setOptions({ skipTenantGuard: true });

  const creditAmount = recipients.reduce((sum, r) => sum + (Number(r.creditAmount) || 0), 0);
  return {
    creditAmount,
    redemptionToken: recipients[0]?.redemptionToken || null,
  };
}

/**
 * Self-serve checkout campaigns require an Entity (schema FK). Tenants that
 * published a shop before sending points/kits may have a wallet but no entity
 * yet — bootstrap one so external shoppers can still log in and pay.
 */
async function ensureTenantEntity(tenantId) {
  const { Entity } = await import('../entities/entity.model.js');
  const { Wallet } = await import('../wallets/wallet.model.js');

  let entity = await Entity.findOne({ tenantId })
    .sort({ createdAt: 1 })
    .setOptions({ skipTenantGuard: true });
  if (entity) return entity;

  let wallet = await Wallet.findOne({ tenantId })
    .sort({ createdAt: 1 })
    .setOptions({ skipTenantGuard: true });
  if (!wallet) {
    wallet = await Wallet.create({
      tenantId,
      name: 'Storefront',
      currency: 'INR',
      status: 'wallet_created',
    });
  }

  // Race: another login may have created the entity between the find and now.
  entity = await Entity.findOne({ tenantId })
    .sort({ createdAt: 1 })
    .setOptions({ skipTenantGuard: true });
  if (entity) return entity;

  entity = await Entity.create({
    tenantId,
    walletId: wallet._id,
    name: wallet.name?.trim() || 'General',
    description: 'Default department for storefront self-serve checkout',
  });
  return entity;
}

/**
 * Always return a redemption token shop customers can use with existing
 * redeem checkout / Razorpay APIs. Invited users keep their credit token;
 * public (0-credit) shoppers get a hidden self-serve recipient.
 */
async function ensureCheckoutAccess({ shop, customer }) {
  const credits = await findShopCredits({
    tenantId: shop.tenantId,
    shopId: shop._id,
    email: customer.email,
  });
  if (credits.redemptionToken) return credits;

  let campaign = await Campaign.findOne({
    tenantId: shop.tenantId,
    shopId: shop._id,
    type: 'points',
    name: '__storefront_self_serve__',
  }).setOptions({ skipTenantGuard: true });

  if (!campaign) {
    const entity = await ensureTenantEntity(shop.tenantId);
    try {
      campaign = await Campaign.create({
        tenantId: shop.tenantId,
        entityId: entity._id,
        shopId: shop._id,
        name: '__storefront_self_serve__',
        type: 'points',
        status: 'redemption_open',
        fulfillmentMode: 'redeem',
        pointsScope: 'shop',
        creditsPerRecipient: 0,
        createdBy: null,
      });
    } catch (err) {
      // Concurrent signup/login may create the same hidden campaign.
      campaign = await Campaign.findOne({
        tenantId: shop.tenantId,
        shopId: shop._id,
        type: 'points',
        name: '__storefront_self_serve__',
      }).setOptions({ skipTenantGuard: true });
      if (!campaign) throw err;
    }
  } else if (campaign.status !== 'redemption_open' && campaign.status !== 'launched') {
    campaign.status = 'redemption_open';
    await campaign.save();
  }

  let recipient = await Recipient.findOne({
    tenantId: shop.tenantId,
    campaignId: campaign._id,
    email: customer.email,
  }).setOptions({ skipTenantGuard: true });

  if (!recipient) {
    const { nanoid } = await import('nanoid');
    recipient = await Recipient.create({
      tenantId: shop.tenantId,
      campaignId: campaign._id,
      name: customer.name || customer.email.split('@')[0],
      email: customer.email,
      creditAmount: 0,
      redemptionToken: nanoid(32),
      redemptionStatus: 'verified',
      invitedAt: new Date(),
      openedAt: new Date(),
      verifiedAt: new Date(),
    });
  } else if (recipient.redemptionStatus !== 'verified') {
    recipient.redemptionStatus = 'verified';
    recipient.verifiedAt = recipient.verifiedAt || new Date();
    recipient.openedAt = recipient.openedAt || new Date();
    if (!recipient.redemptionToken) {
      const { nanoid } = await import('nanoid');
      recipient.redemptionToken = nanoid(32);
    }
    await recipient.save();
  }

  return {
    creditAmount: 0,
    redemptionToken: recipient.redemptionToken,
  };
}

async function sessionPayload({ shop, customer }) {
  const credits = await ensureCheckoutAccess({ shop, customer });
  return {
    accessToken: signShopCustomerToken(customer),
    customer: publicCustomer(customer),
    shop: shopPublicPayload(shop),
    creditAmount: credits.creditAmount,
    redemptionToken: credits.redemptionToken,
  };
}

export async function startShopSignup({ shopId, name, email, password, ip = '' }) {
  const shop = await loadLiveShop(shopId);
  const normalized = await assertShopSignupEmail(shop, email);

  const existing = await ShopCustomer.findOne({ shopId: shop._id, email: normalized });
  if (existing) {
    throw new ApiError(409, 'Account already exists. Please sign in.', 'EMAIL_EXISTS');
  }

  await ShopSignupPending.deleteMany({ shopId: shop._id, email: normalized });

  const otp = generateOtp();
  const now = Date.now();
  const pending = await ShopSignupPending.create({
    shopId: shop._id,
    tenantId: shop.tenantId,
    email: normalized,
    name: String(name).trim(),
    passwordHash: await hashPassword(password),
    otpHash: hashOtp(normalized, otp),
    otpExpiresAt: new Date(now + OTP_TTL_MS),
    resendAvailableAt: new Date(now + RESEND_COOLDOWN_MS),
    createdIp: ip || '',
    expiresAt: new Date(now + PENDING_TTL_MS),
  });

  await sendSignupVerificationEmail(normalized, otp);

  return {
    pendingId: pending.pendingId,
    email: normalized,
    emailMasked: maskEmail(normalized),
    otpExpiresInSec: Math.ceil(OTP_TTL_MS / 1000),
    resendAvailableInSec: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    shop: shopPublicPayload(shop),
  };
}

export async function resendShopSignupOtp({ shopId, pendingId }) {
  const pending = await ShopSignupPending.findOne({
    pendingId,
    shopId,
  }).select('+otpHash +passwordHash');
  if (!pending || pending.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'Signup session expired. Please sign up again.', 'SIGNUP_SESSION_EXPIRED');
  }
  const waitMs = pending.resendAvailableAt.getTime() - Date.now();
  if (waitMs > 0) {
    throw new ApiError(429, 'Please wait before requesting a new code.', 'RESEND_COOLDOWN', {
      retryAfterSec: Math.ceil(waitMs / 1000),
    });
  }

  const otp = generateOtp();
  const now = Date.now();
  pending.otpHash = hashOtp(pending.email, otp);
  pending.otpExpiresAt = new Date(now + OTP_TTL_MS);
  pending.resendAvailableAt = new Date(now + RESEND_COOLDOWN_MS);
  await pending.save();
  await sendSignupVerificationEmail(pending.email, otp);

  return {
    pendingId: pending.pendingId,
    email: pending.email,
    emailMasked: maskEmail(pending.email),
    otpExpiresInSec: Math.ceil(OTP_TTL_MS / 1000),
    resendAvailableInSec: Math.ceil(RESEND_COOLDOWN_MS / 1000),
  };
}

export async function verifyShopSignupOtp({ shopId, pendingId, otp }) {
  const pending = await ShopSignupPending.findOne({ pendingId, shopId }).select('+otpHash +passwordHash');
  if (!pending || pending.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'Signup session expired. Please sign up again.', 'SIGNUP_SESSION_EXPIRED');
  }
  if (pending.otpExpiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'Verification code has expired. Please request a new code.', 'OTP_EXPIRED');
  }
  if (hashOtp(pending.email, String(otp || '').trim()) !== pending.otpHash) {
    throw new ApiError(400, 'Incorrect verification code. Please try again.', 'OTP_INVALID');
  }

  const shop = await loadLiveShop(shopId);
  const existing = await ShopCustomer.findOne({ shopId: shop._id, email: pending.email });
  if (existing) {
    await ShopSignupPending.deleteOne({ _id: pending._id });
    throw new ApiError(409, 'Account already exists. Please sign in.', 'EMAIL_EXISTS');
  }

  const customer = await ShopCustomer.create({
    tenantId: shop.tenantId,
    shopId: shop._id,
    email: pending.email,
    name: pending.name,
    passwordHash: pending.passwordHash,
    emailVerifiedAt: new Date(),
    claimedViaRedeem: false,
    lastLoginAt: new Date(),
  });

  await ShopSignupPending.deleteMany({ shopId: shop._id, email: pending.email });

  return sessionPayload({ shop, customer });
}

export async function loginShopCustomer({ shopId, email, password }) {
  const shop = await loadLiveShop(shopId);
  const normalized = normalizeEmail(email);
  const customer = await ShopCustomer.findOne({ shopId: shop._id, email: normalized }).select(
    '+passwordHash',
  );
  if (!customer) {
    throw new ApiError(
      401,
      'No account exists with this email. Sign up to create one.',
      'NO_ACCOUNT',
    );
  }
  if (!customer.passwordHash) {
    throw new UnauthorizedError('Incorrect email or password.');
  }
  const ok = await bcrypt.compare(password, customer.passwordHash);
  if (!ok) throw new UnauthorizedError('Incorrect email or password.');

  customer.lastLoginAt = new Date();
  await customer.save();

  return sessionPayload({ shop, customer });
}

export async function getShopCustomerSession({ shopId, customerId }) {
  const shop = await loadLiveShop(shopId);
  const customer = await ShopCustomer.findOne({ _id: customerId, shopId: shop._id });
  if (!customer) throw new UnauthorizedError('Session expired');
  const { accessToken: _token, ...rest } = await sessionPayload({ shop, customer });
  return rest;
}

/**
 * Redeem-link claim: create shop account (or attach to existing) without OTP.
 * Possession of the redeem token is verification.
 */
export async function claimRedeemShopAccount({ token, password }) {
  const recipient = await Recipient.findOne({ redemptionToken: token }).setOptions({
    skipTenantGuard: true,
  });
  if (!recipient) throw new NotFoundError('Invalid redemption link');

  const campaign = await Campaign.findById(recipient.campaignId).setOptions({ skipTenantGuard: true });
  if (!campaign?.shopId) {
    throw new ApiError(422, 'This invite is not linked to a shop storefront', 'NO_SHOP');
  }
  const shop = await loadLiveShop(campaign.shopId);
  const email = normalizeEmail(recipient.email);

  let customer = await ShopCustomer.findOne({ shopId: shop._id, email }).select('+passwordHash');
  let created = false;

  if (!customer) {
    if (!password || String(password).length < 8) {
      return {
        needsPassword: true,
        email,
        emailMasked: maskEmail(email),
        shop: shopPublicPayload(shop),
        name: recipient.name || email.split('@')[0],
      };
    }
    customer = await ShopCustomer.create({
      tenantId: shop.tenantId,
      shopId: shop._id,
      email,
      name: recipient.name || email.split('@')[0],
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      claimedViaRedeem: true,
      lastLoginAt: new Date(),
    });
    created = true;
  } else {
    customer.lastLoginAt = new Date();
    if (!customer.claimedViaRedeem) {
      customer.claimedViaRedeem = true;
    }
    await customer.save();
  }

  const session = await sessionPayload({ shop, customer });

  return {
    needsPassword: false,
    created,
    ...session,
    // Prefer the invite token so credits attach to the campaign the link came from.
    redemptionToken: token || session.redemptionToken,
  };
}

export async function forgotShopPassword({ shopId, email }) {
  const shop = await loadLiveShop(shopId);
  const normalized = normalizeEmail(email);
  const customer = await ShopCustomer.findOne({ shopId: shop._id, email: normalized });
  // Always identical response.
  if (!customer) return { success: true };

  const raw = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.updateMany(
    { userId: customer._id, usedAt: null },
    { usedAt: new Date() },
  );
  // Reuse PasswordResetToken with shopCustomer id stored in userId field —
  // reset handler for shop uses a separate verify path keyed by pending token type.
  // Prefer dedicated token storage on the customer for clarity:
  customer.passwordResetTokenHash = sha256(raw);
  customer.passwordResetExpiresAt = new Date(Date.now() + RESET_TTL_MS);
  // Fields may not exist — use update with $set via raw collection if needed.
  await ShopCustomer.collection.updateOne(
    { _id: customer._id },
    {
      $set: {
        passwordResetTokenHash: sha256(raw),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    },
  );

  // Encode shopId in reset link so FE can route to shop reset page.
  const linkToken = `${raw}.${String(shop._id)}`;
  await sendPasswordResetEmail(normalized, linkToken);
  return { success: true };
}

export async function resetShopPassword({ token, newPassword }) {
  const [raw, shopId] = String(token).split('.');
  if (!raw || !shopId) {
    throw new ApiError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
  }
  const hash = sha256(raw);
  const customer = await ShopCustomer.findOne({
    shopId,
    passwordResetTokenHash: hash,
    passwordResetExpiresAt: { $gt: new Date() },
  })
    .select('+passwordHash')
    .setOptions({ skipTenantGuard: true });

  // Fallback: field may be select:false on schema — query via collection
  let doc = customer;
  if (!doc) {
    const row = await ShopCustomer.collection.findOne({
      shopId: new (await import('mongoose')).default.Types.ObjectId(shopId),
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: { $gt: new Date() },
    });
    if (!row) throw new ApiError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
    doc = await ShopCustomer.findById(row._id).select('+passwordHash');
  }

  if (doc.passwordHash) {
    const same = await bcrypt.compare(newPassword, doc.passwordHash);
    if (same) {
      throw new ApiError(400, 'New password must be different from your current password', 'PASSWORD_REUSED');
    }
  }

  doc.passwordHash = await hashPassword(newPassword);
  await doc.save();
  await ShopCustomer.collection.updateOne(
    { _id: doc._id },
    { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } },
  );

  return { success: true, shopId: String(doc.shopId) };
}

void ConflictError;
void BCRYPT_ROUNDS;
void PasswordResetToken;
