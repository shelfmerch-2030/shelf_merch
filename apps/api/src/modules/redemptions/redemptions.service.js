import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Recipient } from '../campaigns/recipient.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Shop } from '../shops/shop.model.js';
import { Collection } from '../collections/collection.model.js';
import { collectionsForShopFilter } from '../collections/collectionQueries.js';
import {
  buildBrandedProductListings,
  loadShopCollections,
  mockupUrlFromCollections,
  parseBrandedListingProductId,
  resolveBrandedListingSnapshot,
} from '../storefront/brandedShopProducts.js';
import { Kit } from '../kits/kit.model.js';
import {
  effectiveProductGroup,
  isDrinkwareProduct,
  kitProductImageUrl,
  resolveKitItemOptions,
} from '../kits/kitProductOptions.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { filterEnabledVariants } from '../catalog/catalogFilters.js';
import { Order, sanitizeOrderItems } from '../orders/order.model.js';
import { scheduleOrderInvoiceGeneration } from '../orderInvoices/orderInvoice.hooks.js';
import { Contact } from '../contacts/contact.model.js';
import { transitionRedemption, finalizeRecipientRedemption } from '../campaigns/campaigns.service.js';
import { computeAmountBreakdown, amountBreakdownForKitCampaign } from '../../services/pricing.service.js';
import { recordUsage } from '../../services/usage.service.js';
import { sumKitProductPrices } from '../kits/kitPricing.js';
import {
  isCuratedKitMeta,
  parseCuratedKitMeta,
  resolveCuratedApproxValueInr,
} from '../kits/curatedKitMeta.js';
import { PlatformKit } from '../kits/platformKit.model.js';
import {
  normalizeVariantImages,
  variantImageUrls,
  variantLabelForUrl,
} from '../kits/kitVariantImages.js';
import { env } from '../../config/env.js';
import { redemptionSignOptions, redemptionVerifyOptions } from '../../config/jwt.js';
import { sendOtpSms } from '../../services/msg91.service.js';
import { sendOtpEmail } from '../../services/email.service.js';
import {
  createCampaignCheckoutOrder,
  verifyCampaignCheckoutPayment,
} from '../payments/payments.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL = '30m';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const POOLED_REDEMPTION_STATUSES = ['opened', 'verified'];

function isKitFulfillment(campaign) {
  return ['kit', 'items'].includes(campaign.type) && !!campaign.kitId;
}

const KIT_PRODUCT_SELECT =
  'name brand group category description keyFeatures sizeGuide basePriceInr primaryImageUrl imageUrls maskImageUrl baseImageUrl maskBackImageUrl baseBackImageUrl maskLeftImageUrl baseLeftImageUrl maskRightImageUrl baseRightImageUrl variants printAreas physicalDimensions dpi'

/** Active catalog rows for a kit — same list shown to recipients and validated on submit. */
function isCuratedBundle(kitEntries, curatedMeta) {
  return isCuratedKitMeta(curatedMeta);
}

async function curatedKitUnitPriceInr(kit, meta) {
  return resolveCuratedApproxValueInr(kit, meta);
}

/** Sentinel key on recipient.variants for curated kit appearance picks. */
export const CURATED_VARIANT_KEY = '__curated__';

function resolveCuratedVariantImages(meta) {
  return variantImageUrls(meta?.variantImages);
}

function curatedVariantLabel(meta, chosenUrl) {
  return variantLabelForUrl(meta?.variantImages, chosenUrl);
}

function resolveChosenCuratedVariantImage(meta, chosen) {
  const variantUrls = resolveCuratedVariantImages(meta);
  if (!variantUrls.length) return { url: '', label: '' };
  const fromRecipient =
    (chosen?.variantImage && String(chosen.variantImage).trim()) ||
    (chosen?.color && variantUrls.includes(String(chosen.color).trim()) ? String(chosen.color).trim() : '');
  const url = fromRecipient && variantUrls.includes(fromRecipient) ? fromRecipient : variantUrls[0];
  return { url, label: curatedVariantLabel(meta, url) };
}

function curatedItemLabel(entry, index) {
  const label = String(entry?.label || '').trim();
  return label || `Item ${index + 1}`;
}

/** Display rows for curated kits that have no tenant catalog productRefs. */
function buildCuratedRedemptionItems(kit, meta) {
  const kitId = String(kit._id);
  const itemImages = Array.isArray(meta?.itemImages) ? meta.itemImages : [];
  if (itemImages.length) {
    return itemImages.map((entry, index) => ({
      productId: `curated:${kitId}:${index}`,
      name: curatedItemLabel(entry, index),
      brand: '',
      group: '',
      category: '',
      isDrinkware: false,
      imageUrl: entry.imageUrl || '',
      // Never pass kit artwork — recipients should see plain item photos.
      artworkUrl: '',
      printAreas: [],
      maskImageUrl: '',
      baseImageUrl: '',
      maskBackImageUrl: '',
      baseBackImageUrl: '',
      primaryImageUrl: entry.imageUrl || '',
      imageUrls: entry.imageUrl ? [entry.imageUrl] : [],
      requiresSize: false,
      requiresColor: false,
      sizes: [],
      colors: [],
      qty: 1,
    }));
  }

  const hero = meta?.heroImage || kit.artworkUrl || meta?.imageUrls?.[0] || '';
  return [
    {
      productId: `curated:${kitId}:0`,
      name: 'Kit contents',
      brand: '',
      group: '',
      category: '',
      isDrinkware: false,
      imageUrl: hero,
      artworkUrl: '',
      printAreas: [],
      maskImageUrl: '',
      baseImageUrl: '',
      maskBackImageUrl: '',
      baseBackImageUrl: '',
      primaryImageUrl: hero,
      imageUrls: hero ? [hero] : [],
      requiresSize: false,
      requiresColor: false,
      sizes: [],
      colors: [],
      qty: 1,
    },
  ];
}

async function buildCuratedOrderLineItem(kit, meta, chosenVariant = null) {
  const pricePerKit = await curatedKitUnitPriceInr(kit, meta);
  const hero = meta?.heroImage || kit.artworkUrl || meta?.imageUrls?.[0] || '';
  const { url, label } = resolveChosenCuratedVariantImage(meta, chosenVariant);
  const brandLogo =
    (meta?.brandLogoUploaded && (kit.artworkUrl || meta?.brandLogoUrl)) ||
    (kit.artworkUrl && kit.artworkUrl !== hero ? kit.artworkUrl : '') ||
    meta?.brandLogoUrl ||
    '';
  return {
    name: kit.name || 'Kit',
    sku: '',
    variant: label ? { color: label } : {},
    qty: 1,
    unitPriceInr: pricePerKit,
    costPriceInr: 0,
    gstRate: 18,
    hsnCode: '',
    imageUrl: url || hero,
    artworkUrl: brandLogo || kit.artworkUrl || '',
  };
}

/** Enrich curated designNotes with live platform kit gallery roles when stale. */
async function enrichCuratedMetaFromPlatform(meta) {
  if (!meta?.originalId) return meta;
  const platformKit = await PlatformKit.findById(meta.originalId)
    .select('heroImage imageUrls itemImages variantImages approxValueInr description')
    .lean();
  if (!platformKit) return meta;
  return {
    ...meta,
    description: meta.description || platformKit.description || '',
    approxValueInr:
      Number(meta.approxValueInr) > 0
        ? meta.approxValueInr
        : Math.round(Number(platformKit.approxValueInr) || 0),
    heroImage: meta.heroImage || platformKit.heroImage || platformKit.imageUrls?.[0] || '',
    imageUrls: meta.imageUrls?.length ? meta.imageUrls : platformKit.imageUrls || [],
    itemImages: meta.itemImages?.length
      ? meta.itemImages
      : (platformKit.itemImages || []).map((it) => ({
          imageUrl: it.imageUrl,
          label: it.label || '',
        })),
    variantImages: meta.variantImages?.length
      ? normalizeVariantImages(meta.variantImages)
      : normalizeVariantImages(platformKit.variantImages),
  };
}

async function loadActiveKitEntries(kit) {
  const productIds = kit.productRefs.map((r) => r.catalogProductId).filter(Boolean);
  if (!productIds.length) return [];
  const products = await CatalogProduct.find({ _id: { $in: productIds }, status: 'active' })
    .select(KIT_PRODUCT_SELECT)
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const entries = [];
  const seen = new Set();
  for (const ref of kit.productRefs) {
    const id = String(ref.catalogProductId || '');
    if (!id || seen.has(id)) continue;
    const product = byId.get(id);
    if (!product) continue;
    seen.add(id);
    entries.push({ ref, product });
  }
  return entries;
}

function colorHexByNameFromVariants(variants) {
  const map = {};
  for (const v of filterEnabledVariants(variants)) {
    const name = String(v?.color || '').trim();
    const hex = String(v?.colorHex || '').trim();
    if (!name || !hex || map[name]) continue;
    map[name] = hex;
  }
  return map;
}

function mapKitEntryToItem({ ref, product }, kit) {
  const options = resolveKitItemOptions(product, ref);
  const drinkware = isDrinkwareProduct(product, ref);
  const imageUrl = ref.mockupUrl || kitProductImageUrl(product, ref);
  return {
    productId: String(product._id),
    name: ref.name || product.name,
    brand: ref.brand || product.brand || '',
    group: effectiveProductGroup(product, ref),
    category: product.category || '',
    isDrinkware: drinkware,
    imageUrl,
    artworkUrl: kit.artworkUrl || '',
    printAreas: product.printAreas || [],
    maskImageUrl: drinkware ? '' : product.maskImageUrl || '',
    baseImageUrl: product.baseImageUrl || '',
    maskBackImageUrl: drinkware ? '' : product.maskBackImageUrl || '',
    baseBackImageUrl: product.baseBackImageUrl || '',
    maskLeftImageUrl: drinkware ? '' : product.maskLeftImageUrl || '',
    baseLeftImageUrl: product.baseLeftImageUrl || '',
    maskRightImageUrl: drinkware ? '' : product.maskRightImageUrl || '',
    baseRightImageUrl: product.baseRightImageUrl || '',
    primaryImageUrl: product.primaryImageUrl || '',
    imageUrls: product.imageUrls || [],
    mockupUrl: ref.mockupUrl || '',
    placement: ref.placement || null,
    requiresSize: options.requiresSize,
    requiresColor: options.requiresColor,
    sizes: options.sizes,
    colors: options.colors,
    colorHexByName: colorHexByNameFromVariants(product.variants),
    qty: 1,
  };
}

async function findRecipientByToken(token) {
  // Token is globally unique — the only public identifier on redemption routes.
  const recipient = await Recipient.findOne({ redemptionToken: token }).setOptions({ skipTenantGuard: true });
  if (!recipient) throw new NotFoundError('Invalid redemption link');
  return recipient;
}

async function loadCampaignContext(recipient) {
  const campaign = await Campaign.findOne({ _id: recipient.campaignId, tenantId: recipient.tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!['launched', 'redemption_open'].includes(campaign.status)) {
    throw new ApiError(410, 'This redemption campaign is no longer active', 'CAMPAIGN_INACTIVE');
  }
  let shop = null;
  if (campaign.shopId) {
    shop = await Shop.findOne({ _id: campaign.shopId, tenantId: recipient.tenantId });
  }
  return { campaign, shop };
}

/**
 * Prefill shipping from the Contacts collection (admin-entered address).
 * Read-only for redemption — checkout edits never write back to Contact.
 */
async function resolveContactShippingAddress(recipient) {
  const contact = recipient.contactId
    ? await Contact.findOne({ _id: recipient.contactId, tenantId: recipient.tenantId }).lean()
    : await Contact.findOne({
        email: recipient.email,
        tenantId: recipient.tenantId,
      }).lean();
  if (!contact) return null;

  const addr = contact.address || {};
  return {
    name: contact.name || recipient.name || '',
    phone: contact.phone || recipient.phone || '',
    line1: addr.line1 || '',
    line2: addr.line2 || '',
    city: addr.city || '',
    state: addr.state || '',
    pincode: addr.pincode || '',
    country: addr.country || 'IN',
  };
}

/** Points sends to the same employee accumulate — sum open credits per shop (or tenant-wide for stadium). */
async function findActivePointsRecipients({ tenantId, email, shopId, pointsScope = 'shop' }) {
  const campaignFilter = {
    tenantId,
    type: 'points',
    status: { $in: ['launched', 'redemption_open'] },
  };
  if (pointsScope === 'shop' && shopId) {
    campaignFilter.shopId = shopId;
  }

  const campaigns = await Campaign.find(campaignFilter).select('_id');
  if (!campaigns.length) return [];

  return Recipient.find({
    tenantId,
    campaignId: { $in: campaigns.map((c) => c._id) },
    email: email.toLowerCase(),
    creditAmount: { $gt: 0 },
    redemptionStatus: { $in: POOLED_REDEMPTION_STATUSES },
  })
    .sort({ invitedAt: 1, createdAt: 1 })
    .setOptions({ skipTenantGuard: true });
}

async function aggregatedPointsCredit({ tenantId, email, shopId, pointsScope = 'shop' }) {
  const rows = await findActivePointsRecipients({ tenantId, email, shopId, pointsScope });
  return rows.reduce((sum, r) => sum + Number(r.creditAmount || 0), 0);
}

async function resolveRecipientCreditAmount(recipient, campaign) {
  if (campaign.type !== 'points') return recipient.creditAmount;
  const scope = campaign.pointsScope ?? 'shop';
  if (scope === 'stadium') {
    return aggregatedPointsCredit({
      tenantId: recipient.tenantId,
      email: recipient.email,
      pointsScope: 'stadium',
    });
  }
  if (campaign.shopId) {
    return aggregatedPointsCredit({
      tenantId: recipient.tenantId,
      email: recipient.email,
      shopId: campaign.shopId,
      pointsScope: 'shop',
    });
  }
  return recipient.creditAmount;
}

/** Debit a checkout total across the employee's open point credits (oldest send first). */
async function debitPointsCreditPool({
  tenantId,
  email,
  shopId,
  pointsScope,
  spendAmount,
  allowPartial = false,
}) {
  const recipients = await findActivePointsRecipients({ tenantId, email, shopId, pointsScope });
  const available = recipients.reduce((sum, r) => sum + Number(r.creditAmount || 0), 0);
  const targetDebit = allowPartial ? Math.min(spendAmount, available) : spendAmount;

  if (!allowPartial && spendAmount > available) {
    throw new ApiError(
      422,
      `Order total ₹${spendAmount} exceeds your available credit of ₹${available}`,
      'CREDIT_EXCEEDED',
    );
  }
  if (targetDebit <= 0) {
    return { debited: 0, remainingDue: spendAmount };
  }

  let remaining = targetDebit;
  for (const row of recipients) {
    if (remaining <= 0) break;
    const debit = Math.min(Number(row.creditAmount || 0), remaining);
    row.creditAmount = Number(row.creditAmount || 0) - debit;
    remaining -= debit;

    if (row.creditAmount <= 0) {
      finalizeRecipientRedemption(row);
    }
    await row.save();
  }

  return { debited: targetDebit, remainingDue: Math.max(0, spendAmount - targetDebit) };
}

export async function createRedemptionRazorpayOrder(token, { amountInr }) {
  const recipient = await Recipient.findOne({ redemptionToken: token }).setOptions({ skipTenantGuard: true });
  if (!recipient) throw new NotFoundError('Invalid redemption link');
  if (recipient.redemptionStatus !== 'verified') {
    throw new ApiError(403, 'Verify OTP before paying', 'NOT_VERIFIED');
  }
  return createCampaignCheckoutOrder({
    tenantId: recipient.tenantId,
    recipientId: recipient._id,
    amountInr,
  });
}

export async function getRedemptionPortal(token) {
  const recipient = await findRecipientByToken(token);
  const { campaign, shop } = await loadCampaignContext(recipient);

  if (recipient.redemptionStatus === 'invited') {
    transitionRedemption(recipient, 'opened');
    await recipient.save();
  }

  const availableCredit = await resolveRecipientCreditAmount(recipient, campaign);

  // Terminal states: never try to re-verify (order_created -> verified is illegal).
  // Non-points shop/kit orders keep creditAmount > 0 after checkout, so status alone
  // must gate this — not remaining credit.
  if (['redeemed', 'order_created'].includes(recipient.redemptionStatus)) {
    const order = await Order.findOne({ recipientId: recipient._id, tenantId: recipient.tenantId });
    throw new ApiError(409, 'Already redeemed', 'ALREADY_REDEEMED', {
      orderNumber: order?.orderNumber,
      trackUrl: order ? `/api/v1/redemptions/${token}/track` : null,
    });
  }

  // Bypass OTP verification: the unique redemption link in the email is itself the
  // identity proof. Auto-verify only from statuses that can legally reach verified.
  if (recipient.redemptionStatus === 'invited' || recipient.redemptionStatus === 'opened') {
    if (recipient.redemptionStatus === 'invited') {
      transitionRedemption(recipient, 'opened');
    }
    transitionRedemption(recipient, 'verified');
    await recipient.save();
  }

  const shopPayload = shop
    ? {
        name: shop.name,
        currencyMode: shop.currencyMode,
        logoUrl: shop.logoUrl || '',
        bannerTheme: shop.bannerConfig?.theme || 'light',
        bannerPreset: shop.bannerConfig?.preset || '',
        bannerImageUrl: shop.bannerConfig?.imageUrl || '',
        featuredCatalogProductIds: (shop.featuredCatalogProductIds || []).map(String),
      }
    : null;

  const campaignPayload = {
    name: campaign.name,
    type: campaign.type,
    message: campaign.message,
    shop: shopPayload,
  };

  const shippingAddress = await resolveContactShippingAddress(recipient);
  const recipientPayload = {
    name: recipient.name,
    email: recipient.email,
    creditAmount: availableCredit,
    ...(shippingAddress ? { shippingAddress } : {}),
  };

  if (recipient.redemptionStatus === 'verified') {
    return {
      alreadyVerified: true,
      sessionToken: signRedemptionSession(recipient),
      campaign: campaignPayload,
      recipient: recipientPayload,
    };
  }

  return {
    campaign: campaignPayload,
    recipient: recipientPayload,
  };
}

export async function sendOtp(token, { contact }) {
  const recipient = await findRecipientByToken(token);
  await loadCampaignContext(recipient);

  const trimmed = contact.trim();
  const normalizedEmail = trimmed.toLowerCase();
  const normalizedPhone = trimmed.replace(/\s/g, '');
  const recipientPhone = recipient.phone?.replace(/\s/g, '') ?? '';

  const isEmail = normalizedEmail.includes('@');
  const matches =
    normalizedEmail === recipient.email.toLowerCase() ||
    (recipientPhone && normalizedPhone === recipientPhone);

  if (!matches) {
    throw new ApiError(400, 'Contact does not match the recipient on file', 'CONTACT_MISMATCH');
  }

  const code = String(crypto.randomInt(100_000, 999_999));
  recipient.otpHash = sha256(code);
  recipient.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  recipient.otpAttempts = 0;
  if (recipient.redemptionStatus === 'invited') {
    transitionRedemption(recipient, 'opened');
  }
  await recipient.save();

  if (isEmail) {
    await sendOtpEmail(recipient.email, code);
  } else {
    await sendOtpSms(trimmed, code);
  }

  return { success: true, expiresInSec: OTP_TTL_MS / 1000, channel: isEmail ? 'email' : 'sms' };
}

export function signRedemptionSession(recipient) {
  return jwt.sign(
    { sub: String(recipient._id), type: 'redemption', tenantId: String(recipient.tenantId) },
    env.JWT_ACCESS_SECRET,
    redemptionSignOptions({ expiresIn: SESSION_TTL }),
  );
}

export function verifyRedemptionSession(token) {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, redemptionVerifyOptions());
    if (payload.type !== 'redemption') throw new Error('wrong type');
    return payload;
  } catch {
    throw new ApiError(401, 'Invalid or expired redemption session', 'INVALID_SESSION');
  }
}

export async function verifyOtp(token, { code }) {
  const recipient = await Recipient.findOne({ redemptionToken: token })
    .setOptions({ skipTenantGuard: true })
    .select('+otpHash');
  if (!recipient) throw new NotFoundError('Invalid redemption link');
  await loadCampaignContext(recipient);

  if (recipient.redemptionStatus === 'verified') {
    return { sessionToken: signRedemptionSession(recipient) };
  }

  if (['redeemed', 'order_created'].includes(recipient.redemptionStatus)) {
    const order = await Order.findOne({ recipientId: recipient._id, tenantId: recipient.tenantId });
    throw new ApiError(409, 'Already redeemed', 'ALREADY_REDEEMED', {
      orderNumber: order?.orderNumber,
      trackUrl: order ? `/api/v1/redemptions/${token}/track` : null,
    });
  }

  if (!recipient.otpHash || !recipient.otpExpiresAt || recipient.otpExpiresAt < new Date()) {
    throw new ApiError(400, 'OTP expired — request a new code', 'OTP_EXPIRED');
  }
  if (recipient.otpAttempts >= 5) {
    throw new ApiError(429, 'Too many attempts — request a new code', 'OTP_LOCKED');
  }

  recipient.otpAttempts += 1;
  if (sha256(code) !== recipient.otpHash) {
    await recipient.save();
    throw new ApiError(400, 'Invalid OTP', 'OTP_INVALID');
  }

  recipient.otpHash = null;
  recipient.otpExpiresAt = null;
  if (recipient.redemptionStatus === 'verified') {
    await recipient.save();
    return { sessionToken: signRedemptionSession(recipient) };
  }
  if (recipient.redemptionStatus === 'invited') {
    transitionRedemption(recipient, 'opened');
  }
  transitionRedemption(recipient, 'verified');
  await recipient.save();

  return { sessionToken: signRedemptionSession(recipient) };
}

export async function getCatalog(token) {
  const recipient = await findRecipientByToken(token);
  const { campaign } = await loadCampaignContext(recipient);

  if (campaign.catalogMode === 'selected_products' && campaign.selectedProductIds.length) {
    const artworkByProductId = new Map();
    const mockupByProductId = new Map();
    const mockupBackByProductId = new Map();
    const placementByProductId = new Map();
    const preferredColorsByProductId = new Map();
    if (campaign.shopId) {
      const shopCollections = await Collection.find({
        ...collectionsForShopFilter(campaign.shopId),
        tenantId: recipient.tenantId,
        status: { $ne: 'archived' },
      })
        .select('productRefs artworkUrl preferredColors')
        .lean();
      for (const col of shopCollections) {
        for (const ref of col.productRefs || []) {
          const pid = ref.catalogProductId ? String(ref.catalogProductId) : '';
          if (!pid) continue;
          if (col.artworkUrl && !artworkByProductId.has(pid)) artworkByProductId.set(pid, col.artworkUrl);
          if (ref.mockupUrl && !mockupByProductId.has(pid)) mockupByProductId.set(pid, ref.mockupUrl);
          if (ref.mockupBackUrl && !mockupBackByProductId.has(pid)) {
            mockupBackByProductId.set(pid, ref.mockupBackUrl);
          }
          if (ref.placement && !placementByProductId.has(pid)) placementByProductId.set(pid, ref.placement);
          if (col.preferredColors?.length && !preferredColorsByProductId.has(pid)) {
            preferredColorsByProductId.set(pid, col.preferredColors);
          }
        }
      }
    }

    const products = await CatalogProduct.find({
      status: 'active',
      _id: { $in: campaign.selectedProductIds },
    })
      .select('name brand group category description keyFeatures sizeGuide basePriceInr primaryImageUrl imageUrls maskImageUrl baseImageUrl maskBackImageUrl baseBackImageUrl maskLeftImageUrl baseLeftImageUrl maskRightImageUrl baseRightImageUrl variants printAreas physicalDimensions dpi')
      .sort({ name: 1 })
      .lean()
      .then((rows) =>
        rows.map((p) => ({
          ...p,
          artworkUrl: artworkByProductId.get(String(p._id)) || '',
          mockupUrl: mockupByProductId.get(String(p._id)) || '',
          mockupBackUrl: mockupBackByProductId.get(String(p._id)) || '',
          placement: placementByProductId.get(String(p._id)) || null,
          preferredColors: preferredColorsByProductId.get(String(p._id)) || [],
        })),
      );
    return { products };
  }

  if (campaign.shopId) {
    const shop = await Shop.findOne({ _id: campaign.shopId, tenantId: recipient.tenantId });
    if (!shop) return { products: [] };
    const products = await buildBrandedProductListings(shop, { skipTenantGuard: false });
    return { products };
  }

  const products = await CatalogProduct.find({ status: 'active' })
    .select('name brand group category description keyFeatures sizeGuide basePriceInr primaryImageUrl imageUrls maskImageUrl baseImageUrl maskBackImageUrl baseBackImageUrl maskLeftImageUrl baseLeftImageUrl maskRightImageUrl baseRightImageUrl variants printAreas physicalDimensions dpi')
    .sort({ name: 1 })
    .lean();
  return { products };
}

/** Fixed kit contents for kit/items campaigns — recipient confirms sizes, not a store browse. */
export async function getKitContents(token) {
  const recipient = await findRecipientByToken(token);
  const { campaign } = await loadCampaignContext(recipient);
  if (!isKitFulfillment(campaign)) {
    throw new ApiError(404, 'This redemption is not a kit send', 'NOT_KIT_CAMPAIGN');
  }

  const kit = await Kit.findOne({ _id: campaign.kitId, tenantId: recipient.tenantId });
  if (!kit) throw new NotFoundError('Kit not found');

  const entries = await loadActiveKitEntries(kit);
  let curatedMeta = parseCuratedKitMeta(kit.designNotes);
  if (isCuratedKitMeta(curatedMeta)) {
    curatedMeta = await enrichCuratedMetaFromPlatform(curatedMeta);
  }
  const curatedBundle = isCuratedBundle(entries, curatedMeta);
  const items = curatedBundle
    ? buildCuratedRedemptionItems(kit, curatedMeta)
    : entries.map((entry) => mapKitEntryToItem(entry, kit));

  const variantImages = curatedBundle ? resolveCuratedVariantImages(curatedMeta) : [];
  const kitVariants = curatedBundle ? normalizeVariantImages(curatedMeta?.variantImages) : [];

  return {
    kit: { name: kit.name, artworkUrl: kit.artworkUrl || curatedMeta?.heroImage || '', packaging: kit.packaging || 'none' },
    items,
    curatedBundle,
    variantImages,
    kitVariants,
    requiresKitVariant: curatedBundle && variantImages.length > 0,
  };
}

async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `SM-${year}-`;
  // Must use max sequence, not count — gaps / deleted rows make count+1 collide
  // with an existing unique orderNumber (Mongo 409 DUPLICATE).
  const latest = await Order.findOne({ orderNumber: { $regex: `^${prefix}` } })
    .sort({ orderNumber: -1 })
    .select('orderNumber')
    .setOptions({ skipTenantGuard: true, includeDeleted: true })
    .lean();
  let seq = 1;
  if (latest?.orderNumber) {
    const parsed = Number.parseInt(String(latest.orderNumber).slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

async function createOrderWithNumber(doc, { attempts = 5 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await Order.create({
        ...doc,
        orderNumber: doc.orderNumber || (await nextOrderNumber()),
      });
    } catch (err) {
      lastErr = err;
      if (err?.code !== 11000) throw err;
      // Retry only orderNumber collisions (keyPattern or keyValue, message may vary by driver).
      const isOrderNumberClash =
        Boolean(err?.keyPattern?.orderNumber) ||
        Boolean(err?.keyValue && Object.prototype.hasOwnProperty.call(err.keyValue, 'orderNumber')) ||
        String(err?.message || '').includes('orderNumber');
      if (!isOrderNumberClash) throw err;
      doc = { ...doc, orderNumber: undefined };
    }
  }
  throw lastErr;
}

async function applyOrderInventory(order, campaign) {
  try {
    const { applyInventoryTransaction } = await import('../catalog/inventory.service.js');
    for (const line of order.items) {
      const product = await CatalogProduct.findById(line.catalogProductId);
      if (product?.inventory?.mode !== 'physical') continue;
      await applyInventoryTransaction({
        productId: line.catalogProductId,
        variantSku: line.sku,
        type: 'reduce',
        qty: line.qty,
        reason: `Redemption order ${order.orderNumber}`,
        relatedOrderId: order._id,
        relatedCampaignId: campaign._id,
        consumeReserved: product.inventory.reserved >= line.qty,
      });
    }
  } catch {
    // Stock drift is reconciled by catalog admins via /platform/inventory.
  }
}

export async function createSurpriseOrdersForCampaign({ tenantId, campaign }) {
  if (campaign.fulfillmentMode !== 'surprise' || !isKitFulfillment(campaign)) {
    throw new ApiError(422, 'Campaign is not a surprise kit send', 'NOT_SURPRISE_CAMPAIGN');
  }

  const kit = await Kit.findOne({ _id: campaign.kitId, tenantId });
  if (!kit) throw new NotFoundError('Kit not found');
  const kitEntries = await loadActiveKitEntries(kit);
  let curatedMeta = parseCuratedKitMeta(kit.designNotes);
  if (isCuratedKitMeta(curatedMeta)) {
    curatedMeta = await enrichCuratedMetaFromPlatform(curatedMeta);
  }
  const curatedBundle = isCuratedBundle(kitEntries, curatedMeta);
  if (!kitEntries.length && !curatedBundle) {
    throw new ApiError(422, 'Kit has no active products', 'KIT_EMPTY');
  }

  const recipients = await Recipient.find({ tenantId, campaignId: campaign._id });
  const recipientContacts = [];
  for (const recipient of recipients) {
    const contact = recipient.contactId
      ? await Contact.findOne({ _id: recipient.contactId, tenantId })
      : await Contact.findOne({ email: recipient.email, tenantId });
    const address = contact?.address;
    if (!address?.line1 || !address.city || !address.state || !address.pincode) {
      throw new ApiError(
        422,
        `Complete shipping address required for ${recipient.email}`,
        'SURPRISE_ADDRESS_REQUIRED',
      );
    }
    recipientContacts.push({ recipient, contact, address });
  }

  for (const { recipient, contact, address } of recipientContacts) {
    const existing = await Order.findOne({ tenantId, recipientId: recipient._id });
    if (existing) continue;

    let lineItems;
    let amountBreakdown;
    if (curatedBundle) {
      const chosen = recipient.variants?.[CURATED_VARIANT_KEY] || null;
      lineItems = [await buildCuratedOrderLineItem(kit, curatedMeta, chosen)];
      amountBreakdown = amountBreakdownForKitCampaign(campaign, {
        kitUnitPriceInr: await curatedKitUnitPriceInr(kit, curatedMeta),
        packaging: campaign.packaging,
        orderKitCount: 1,
      });
    } else {
      lineItems = [];
      for (const { ref, product: entryProduct } of kitEntries) {
        const product = await CatalogProduct.findById(entryProduct._id).select('+costPriceInr');
        if (!product) throw new NotFoundError(`Product ${entryProduct._id} not found`);
        const options = resolveKitItemOptions(product, ref);
        const chosen = recipient.variants?.[String(entryProduct._id)];
        const variant = {
          size: chosen?.size ?? options.sizes[0] ?? '',
          color: chosen?.color ?? options.colors[0] ?? '',
        };
        const selectedVariant = filterEnabledVariants(product.variants).find(
          (v) =>
            (!variant.size || v.size === variant.size) &&
            (!variant.color || v.color === variant.color),
        );
        lineItems.push({
          catalogProductId: product._id,
          name: product.name,
          sku: selectedVariant?.sku || product.sku,
          variant,
          qty: 1,
          unitPriceInr: product.basePriceInr,
          costPriceInr: product.costPriceInr ?? 0,
          gstRate: product.gstRate ?? 18,
          hsnCode: product.hsnCode ?? '',
          imageUrl:
            kitProductImageUrl(product, ref) ||
            product.maskImageUrl ||
            product.primaryImageUrl ||
            product.imageUrls?.[0] ||
            '',
        });
      }
      amountBreakdown = amountBreakdownForKitCampaign(campaign, {
        kitUnitPriceInr: sumKitProductPrices(kitEntries.map((e) => e.product)),
        packaging: campaign.packaging,
        orderKitCount: 1,
        products: kitEntries.map((e) => e.product),
      });
    }

    const order = await createOrderWithNumber({
      tenantId,
      campaignId: campaign._id,
      recipientId: recipient._id,
      items: lineItems,
      shippingAddress: {
        name: recipient.name,
        phone: recipient.phone || contact.phone || '',
        line1: address.line1,
        line2: address.line2 || '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country || 'IN',
      },
      amountBreakdown,
      status: 'created',
      statusHistory: [
        { status: 'created', at: new Date(), actorUserId: null, note: 'Surprise gift auto-fulfillment' },
      ],
    });

    scheduleOrderInvoiceGeneration(order);
    transitionRedemption(recipient, 'order_created');
    await recipient.save();
    if (!curatedBundle) {
      await applyOrderInventory(order, campaign);
    }
  }
}

export async function createSingleLocationOrderForCampaign({ tenantId, campaign }) {
  if (campaign.fulfillmentMode !== 'single' || !isKitFulfillment(campaign)) {
    throw new ApiError(422, 'Campaign is not a single-location kit send', 'NOT_SINGLE_LOCATION_CAMPAIGN');
  }

  const location = campaign.singleLocation;
  if (
    !location?.name ||
    !location.email ||
    !location.line1 ||
    !location.city ||
    !location.state ||
    !location.pincode
  ) {
    throw new ApiError(422, 'Complete single-location delivery details are required', 'SINGLE_LOCATION_REQUIRED');
  }

  const recipients = await Recipient.find({ tenantId, campaignId: campaign._id });
  if (!recipients.length) throw new ApiError(422, 'Select at least one recipient', 'NO_RECIPIENTS');

  const existing = await Order.findOne({ tenantId, campaignId: campaign._id });
  if (existing) return existing;

  const kit = await Kit.findOne({ _id: campaign.kitId, tenantId });
  if (!kit) throw new NotFoundError('Kit not found');
  const kitEntries = await loadActiveKitEntries(kit);
  let curatedMeta = parseCuratedKitMeta(kit.designNotes);
  if (isCuratedKitMeta(curatedMeta)) {
    curatedMeta = await enrichCuratedMetaFromPlatform(curatedMeta);
  }
  const curatedBundle = isCuratedBundle(kitEntries, curatedMeta);
  if (!kitEntries.length && !curatedBundle) {
    throw new ApiError(422, 'Kit has no active products', 'KIT_EMPTY');
  }

  let lineItems;
  let amountBreakdown;
  if (curatedBundle) {
    const variantGroups = {}; // key: variantUrl|label -> { chosen, qty }
    for (const recipient of recipients) {
      const chosen = recipient.variants?.[CURATED_VARIANT_KEY] || null;
      const resolved = resolveChosenCuratedVariantImage(curatedMeta, chosen);
      const key = `${resolved.url}|${resolved.label}`;
      if (!variantGroups[key]) {
        variantGroups[key] = { chosen: resolved.url ? { variantImage: resolved.url } : null, qty: 0 };
      }
      variantGroups[key].qty += 1;
    }
    lineItems = [];
    for (const group of Object.values(variantGroups)) {
      const unit = await buildCuratedOrderLineItem(kit, curatedMeta, group.chosen);
      lineItems.push({ ...unit, qty: group.qty });
    }
    amountBreakdown = amountBreakdownForKitCampaign(campaign, {
      kitUnitPriceInr: await curatedKitUnitPriceInr(kit, curatedMeta),
      packaging: campaign.packaging,
      orderKitCount: recipients.length,
    });
  } else {
    lineItems = [];
    for (const { ref, product: entryProduct } of kitEntries) {
      const product = await CatalogProduct.findById(entryProduct._id).select('+costPriceInr');
      if (!product) throw new NotFoundError(`Product ${entryProduct._id} not found`);
      const options = resolveKitItemOptions(product, ref);

      const variantGroups = {}; // key: "size|color" -> { variant, qty }
      for (const recipient of recipients) {
        const chosen = recipient.variants?.[String(entryProduct._id)];
        const size = chosen?.size ?? options.sizes[0] ?? '';
        const color = chosen?.color ?? options.colors[0] ?? '';
        const key = `${size}|${color}`;
        if (!variantGroups[key]) {
          variantGroups[key] = {
            variant: { size, color },
            qty: 0,
          };
        }
        variantGroups[key].qty += 1;
      }

      for (const key of Object.keys(variantGroups)) {
        const { variant, qty } = variantGroups[key];
        const selectedVariant = filterEnabledVariants(product.variants).find(
          (v) =>
            (!variant.size || v.size === variant.size) &&
            (!variant.color || v.color === variant.color),
        );
        lineItems.push({
          catalogProductId: product._id,
          name: product.name,
          sku: selectedVariant?.sku || product.sku,
          variant,
          qty,
          unitPriceInr: product.basePriceInr,
          costPriceInr: product.costPriceInr ?? 0,
          gstRate: product.gstRate ?? 18,
          hsnCode: product.hsnCode ?? '',
          imageUrl:
            kitProductImageUrl(product, ref) ||
            product.maskImageUrl ||
            product.primaryImageUrl ||
            product.imageUrls?.[0] ||
            '',
        });
      }
    }
    amountBreakdown = amountBreakdownForKitCampaign(campaign, {
      kitUnitPriceInr: sumKitProductPrices(kitEntries.map((e) => e.product)),
      packaging: campaign.packaging,
      orderKitCount: recipients.length,
      products: kitEntries.map((e) => e.product),
    });
  }

  const order = await createOrderWithNumber({
    tenantId,
    campaignId: campaign._id,
    recipientId: recipients[0]._id,
    items: lineItems,
    shippingAddress: {
      name: location.name,
      phone: location.phone || '',
      line1: location.line1,
      line2: location.line2 || '',
      city: location.city,
      state: location.state,
      pincode: location.pincode,
      country: location.country || 'IN',
    },
    amountBreakdown,
    status: 'created',
    statusHistory: [
      { status: 'created', at: new Date(), actorUserId: null, note: 'Single-location auto-fulfillment' },
    ],
  });

  scheduleOrderInvoiceGeneration(order);
  for (const recipient of recipients) {
    transitionRedemption(recipient, 'order_created');
    await recipient.save();
  }
  if (!curatedBundle) {
    await applyOrderInventory(order, campaign);
  }
  return order;
}

/**
 * Create Orders for surprise/single kit campaigns that launched without them
 * (historical curated KIT_EMPTY failures). Idempotent per recipient.
 */
export async function repairMissingKitFulfillmentOrders({ tenantId = null } = {}) {
  const filter = {
    type: { $in: ['kit', 'items'] },
    fulfillmentMode: { $in: ['surprise', 'single'] },
    status: { $in: ['launched', 'redemption_open'] },
  };
  if (tenantId) filter.tenantId = tenantId;

  const campaigns = await Campaign.find(filter)
    .select('_id tenantId fulfillmentMode')
    .setOptions(tenantId ? {} : { skipTenantGuard: true })
    .lean();
  if (!campaigns.length) return { repaired: 0 };

  let repaired = 0;
  for (const row of campaigns) {
    const tid = row.tenantId;
    const existing = await Order.exists({ tenantId: tid, campaignId: row._id });
    if (existing) continue;

    const campaign = await Campaign.findOne({ _id: row._id, tenantId: tid });
    if (!campaign) continue;
    try {
      if (campaign.fulfillmentMode === 'surprise') {
        await createSurpriseOrdersForCampaign({ tenantId: tid, campaign });
      } else if (campaign.fulfillmentMode === 'single') {
        await createSingleLocationOrderForCampaign({ tenantId: tid, campaign });
      }
      repaired += 1;
    } catch (err) {
      console.error(
        `repairMissingKitFulfillmentOrders failed for campaign ${campaign._id}:`,
        err?.message || err,
      );
    }
  }
  return { repaired };
}

/** §7.9 /submit — idempotent order creation from redemption. */
export async function submitRedemption(
  token,
  { items, shippingAddress, paymentMode = 'points', razorpayPayment, kitVariantImage },
) {
  const recipient = await Recipient.findOne({ redemptionToken: token }).setOptions({ skipTenantGuard: true });
  if (!recipient) throw new NotFoundError('Invalid redemption link');
  const { campaign } = await loadCampaignContext(recipient);

  if (recipient.redemptionStatus === 'order_created') {
    const existing = await Order.findOne({ recipientId: recipient._id, tenantId: recipient.tenantId });
    if (existing) {
      return {
        orderNumber: existing.orderNumber,
        estimatedDelivery: '7-10 business days',
        idempotentReplay: true,
      };
    }
  }

  // Heal: order may exist from a prior attempt that failed after create (e.g. later unique collision).
  if (campaign.type !== 'points') {
    const prior = await Order.findOne({ recipientId: recipient._id, tenantId: recipient.tenantId });
    if (prior) {
      try {
        transitionRedemption(recipient, 'redeemed');
        transitionRedemption(recipient, 'order_created');
        await recipient.save();
      } catch {
        recipient.redemptionStatus = 'order_created';
        await recipient.save();
      }
      return {
        orderNumber: prior.orderNumber,
        estimatedDelivery: '7-10 business days',
        orderId: String(prior._id),
        idempotentReplay: true,
      };
    }
  }

  if (recipient.redemptionStatus !== 'verified') {
    throw new ApiError(403, 'Verify OTP before submitting your order', 'NOT_VERIFIED');
  }

  const kitFulfillment = isKitFulfillment(campaign);
  let kit = null;
  let kitEntries = [];
  let curatedMeta = null;
  if (kitFulfillment) {
    kit = await Kit.findOne({ _id: campaign.kitId, tenantId: recipient.tenantId });
    if (!kit) throw new NotFoundError('Kit not found');
    kitEntries = await loadActiveKitEntries(kit);
    curatedMeta = parseCuratedKitMeta(kit.designNotes);
    if (isCuratedKitMeta(curatedMeta)) {
      curatedMeta = await enrichCuratedMetaFromPlatform(curatedMeta);
    }
    const curatedBundle = isCuratedBundle(kitEntries, curatedMeta);

    if (!curatedBundle) {
      if (!kitEntries.length) {
        throw new ApiError(422, 'Kit has no active products', 'KIT_EMPTY');
      }
      const expectedIds = new Set(kitEntries.map((e) => String(e.product._id)));
      const submittedIds = new Set(items.map((i) => String(i.productId)));
      if (expectedIds.size !== submittedIds.size || [...expectedIds].some((id) => !submittedIds.has(id))) {
        throw new ApiError(422, 'Order items must match the kit contents exactly', 'KIT_ITEMS_MISMATCH');
      }
      if (!items.length) {
        throw new ApiError(422, 'Kit order must include at least one item', 'KIT_ITEMS_REQUIRED');
      }
    } else if (items.length > 0) {
      throw new ApiError(422, 'This curated kit does not require item selection', 'KIT_ITEMS_NOT_ALLOWED');
    }
  }

  const lineItems = [];
  let breakdown;

  if (kitFulfillment && isCuratedBundle(kitEntries, curatedMeta)) {
    const variantImages = resolveCuratedVariantImages(curatedMeta);
    let chosen = null;
    if (variantImages.length) {
      const selected = String(kitVariantImage || '').trim();
      if (!selected || !variantImages.includes(selected)) {
        throw new ApiError(422, 'Please choose a kit variant', 'KIT_VARIANT_REQUIRED');
      }
      chosen = { variantImage: selected };
    }
    lineItems.push(await buildCuratedOrderLineItem(kit, curatedMeta, chosen));
    breakdown = amountBreakdownForKitCampaign(campaign, {
      kitUnitPriceInr: await curatedKitUnitPriceInr(kit, curatedMeta),
      packaging: campaign.packaging,
      orderKitCount: 1,
    });
  } else {
    if (!kitFulfillment && !items.length) {
      throw new ApiError(422, 'Order must include at least one item', 'ITEMS_REQUIRED');
    }

    // Baked design mockups for this shop's products, so the frozen order item
    // image is the composited mockup that production should print against, not
    // the bare mask. Store (non-kit) redemptions only.
    let shopCollections = [];
    const mockupByProductId = new Map();
    if (!kitFulfillment && campaign.shopId) {
      const shop = await Shop.findOne({ _id: campaign.shopId, tenantId: recipient.tenantId });
      if (shop) {
        shopCollections = await loadShopCollections(shop, { skipTenantGuard: false });
        for (const col of shopCollections) {
          for (const ref of col.productRefs || []) {
            const pid = ref.catalogProductId ? String(ref.catalogProductId) : '';
            if (pid && ref.mockupUrl && !mockupByProductId.has(pid)) mockupByProductId.set(pid, ref.mockupUrl);
          }
        }
      }
    }

    // Non-negotiable #4: every order item carries a full product snapshot
    // (price, cost, GST, HSN, image) frozen at order time.
    for (const item of items) {
      const listing = parseBrandedListingProductId(item.productId);
      if (!listing) throw new ApiError(422, `Invalid product ${item.productId}`, 'INVALID_PRODUCT');
      const product = await CatalogProduct.findById(listing.catalogProductId).select('+costPriceInr');
      if (!product) throw new NotFoundError(`Product ${listing.catalogProductId} not found`);
      const kitRef = kitFulfillment
        ? kitEntries.find((e) => String(e.product._id) === String(listing.catalogProductId))?.ref ?? null
        : null;
      const listingSnap = resolveBrandedListingSnapshot(shopCollections, listing);

      if (kitFulfillment) {
        const options = resolveKitItemOptions(product, kitRef || {});
        if (item.qty !== 1) {
          throw new ApiError(422, `Quantity must be 1 for kit item ${product.name}`, 'KIT_QTY_INVALID');
        }
        if (options.requiresSize && !item.variant?.size) {
          throw new ApiError(422, `Size is required for ${product.name}`, 'SIZE_REQUIRED');
        }
        if (options.requiresColor && !item.variant?.color) {
          throw new ApiError(422, `Colour is required for ${product.name}`, 'COLOR_REQUIRED');
        }
        if (item.variant?.size && options.sizes.length && !options.sizes.includes(item.variant.size)) {
          throw new ApiError(422, `Invalid size for ${product.name}`, 'SIZE_INVALID');
        }
        if (item.variant?.color && options.colors.length && !options.colors.includes(item.variant.color)) {
          throw new ApiError(422, `Invalid colour for ${product.name}`, 'COLOR_INVALID');
        }
      }

      lineItems.push({
        catalogProductId: product._id,
        collectionId: listingSnap.collectionId || null,
        name: listingSnap.name || product.name,
        sku: product.sku,
        variant: item.variant ?? {},
        qty: item.qty,
        unitPriceInr: product.basePriceInr,
        costPriceInr: product.costPriceInr ?? 0,
        gstRate: product.gstRate ?? 18,
        hsnCode: product.hsnCode ?? '',
        imageUrl:
          listingSnap.mockupUrl ||
          mockupUrlFromCollections(shopCollections, listing.collectionId, listing.catalogProductId) ||
          mockupByProductId.get(String(product._id)) ||
          kitProductImageUrl(product, kitRef || {}) ||
          product.maskImageUrl ||
          product.primaryImageUrl ||
          product.imageUrls?.[0] ||
          '',
      });
    }

    breakdown = kitFulfillment
      ? amountBreakdownForKitCampaign(campaign, {
          kitUnitPriceInr: sumKitProductPrices(kitEntries.map((e) => e.product)),
          packaging: campaign.packaging,
          orderKitCount: 1,
          products: kitEntries.map((e) => e.product),
        })
      : computeAmountBreakdown(lineItems);
  }

  if (!kitFulfillment) {
    if (campaign.type === 'points') {
      if (paymentMode === 'upi') {
        if (!razorpayPayment?.orderId || !razorpayPayment?.paymentId || !razorpayPayment?.signature) {
          throw new ApiError(422, 'UPI payment is required to complete this order', 'PAYMENT_REQUIRED');
        }
        await verifyCampaignCheckoutPayment({
          tenantId: recipient.tenantId,
          recipientId: recipient._id,
          expectedAmountInr: breakdown.total,
          razorpayPayment,
        });
      } else if (paymentMode === 'points_upi') {
        const { remainingDue } = await debitPointsCreditPool({
          tenantId: recipient.tenantId,
          email: recipient.email,
          shopId: campaign.shopId,
          pointsScope: campaign.pointsScope ?? 'shop',
          spendAmount: breakdown.total,
          allowPartial: true,
        });
        if (remainingDue > 0) {
          if (!razorpayPayment?.orderId || !razorpayPayment?.paymentId || !razorpayPayment?.signature) {
            throw new ApiError(422, 'UPI payment is required for the remaining balance', 'PAYMENT_REQUIRED');
          }
          await verifyCampaignCheckoutPayment({
            tenantId: recipient.tenantId,
            recipientId: recipient._id,
            expectedAmountInr: remainingDue,
            razorpayPayment,
          });
        }
      } else {
        await debitPointsCreditPool({
          tenantId: recipient.tenantId,
          email: recipient.email,
          shopId: campaign.shopId,
          pointsScope: campaign.pointsScope ?? 'shop',
          spendAmount: breakdown.total,
        });
      }
    } else if (breakdown.total > recipient.creditAmount) {
      throw new ApiError(
        422,
        `Order total ₹${breakdown.total} exceeds your credit of ₹${recipient.creditAmount}`,
        'CREDIT_EXCEEDED',
      );
    }
  }

  const order = await createOrderWithNumber({
    tenantId: recipient.tenantId,
    campaignId: campaign._id,
    recipientId: recipient._id,
    items: lineItems,
    shippingAddress,
    amountBreakdown: breakdown,
    status: 'created',
    statusHistory: [{ status: 'created', at: new Date(), actorUserId: null, note: 'Redemption submit' }],
  });
  recordUsage(recipient.tenantId, 'orders.created'); // §Gap E metering
  scheduleOrderInvoiceGeneration(order);

  // Points campaigns stay open (pooled credits — the recipient can keep
  // ordering against remaining credit). Everything else, including one-shot
  // kit sends, transitions to order_created so the replay guard above stops
  // duplicate orders.
  if (campaign.type !== 'points') {
    transitionRedemption(recipient, 'redeemed');
    transitionRedemption(recipient, 'order_created');
    await recipient.save();
  }

  // §3.2 reservation hook — redemption consumes stock. Best-effort: an
  // inventory bookkeeping error must never block a recipient's order.
  await applyOrderInventory(order, campaign);

  let remainingCredit = null;
  if (campaign.type === 'points') {
    remainingCredit = await resolveRecipientCreditAmount(recipient, campaign);
  }

  return {
    orderNumber: order.orderNumber,
    estimatedDelivery: '7-10 business days',
    orderId: String(order._id),
    remainingCredit,
  };
}

/** Orders placed by this recipient (all shop sends for pooled points). */
export async function listRedemptionOrders(token) {
  const recipient = await findRecipientByToken(token);
  const { campaign } = await loadCampaignContext(recipient);

  let recipientIds = [recipient._id];
  if (campaign.type === 'points' && campaign.shopId) {
    const shopCampaigns = await Campaign.find({
      tenantId: recipient.tenantId,
      shopId: campaign.shopId,
      type: 'points',
    })
      .select('_id')
      .lean();
    const ids = await Recipient.find({
      tenantId: recipient.tenantId,
      email: recipient.email,
      campaignId: { $in: shopCampaigns.map((c) => c._id) },
    })
      .distinct('_id')
      .setOptions({ skipTenantGuard: true });
    if (ids.length) recipientIds = ids;
  }

  const orders = await Order.find({
    tenantId: recipient.tenantId,
    recipientId: { $in: recipientIds },
  })
    .sort({ createdAt: -1 })
    .setOptions({ skipTenantGuard: true })
    .lean();

  return {
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.amountBreakdown?.total ?? 0,
      itemCount: o.items?.length ?? 0,
      createdAt: o.createdAt,
      items: sanitizeOrderItems(o.items),
      shippingAddress: o.shippingAddress ?? null,
      amountBreakdown: o.amountBreakdown ?? null,
      statusHistory: (o.statusHistory ?? []).map((h) => ({
        status: h.status,
        at: h.at,
        note: h.note ?? '',
      })),
    })),
    creditAmount: await resolveRecipientCreditAmount(recipient, campaign),
  };
}

export async function trackRedemption(token) {
  const recipient = await findRecipientByToken(token);
  const order = await Order.findOne({ recipientId: recipient._id, tenantId: recipient.tenantId });
  if (!order) throw new NotFoundError('No order found for this redemption');

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    amountBreakdown: order.amountBreakdown,
    items: sanitizeOrderItems(order.items),
    shippingAddress: order.shippingAddress,
    redemptionStatus: recipient.redemptionStatus,
  };
}
