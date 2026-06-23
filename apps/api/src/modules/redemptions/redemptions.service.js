import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Recipient } from '../campaigns/recipient.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Shop } from '../shops/shop.model.js';
import { Collection } from '../collections/collection.model.js';
import { collectionsForShopFilter } from '../collections/collectionQueries.js';
import { Kit } from '../kits/kit.model.js';
import {
  effectiveProductGroup,
  isDrinkwareProduct,
  kitProductImageUrl,
  resolveKitItemOptions,
} from '../kits/kitProductOptions.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { Order, sanitizeOrderItems } from '../orders/order.model.js';
import { Contact } from '../contacts/contact.model.js';
import { transitionRedemption } from '../campaigns/campaigns.service.js';
import { computeAmountBreakdown } from '../../services/pricing.service.js';
import { env } from '../../config/env.js';
import { sendOtpSms } from '../../services/msg91.service.js';
import { sendOtpEmail } from '../../services/email.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL = '30m';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function isKitFulfillment(campaign) {
  return ['kit', 'items'].includes(campaign.type) && !!campaign.kitId;
}

const KIT_PRODUCT_SELECT =
  'name brand group category description basePriceInr primaryImageUrl imageUrls maskImageUrl baseImageUrl variants printAreas';

/** Active catalog rows for a kit — same list shown to recipients and validated on submit. */
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

function mapKitEntryToItem({ ref, product }, kit) {
  const options = resolveKitItemOptions(product, ref);
  const drinkware = isDrinkwareProduct(product, ref);
  const imageUrl = kitProductImageUrl(product, ref);
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
    primaryImageUrl: product.primaryImageUrl || '',
    imageUrls: product.imageUrls || [],
    requiresSize: options.requiresSize,
    requiresColor: options.requiresColor,
    sizes: options.sizes,
    colors: options.colors,
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

export async function getRedemptionPortal(token) {
  const recipient = await findRecipientByToken(token);

  if (['redeemed', 'order_created'].includes(recipient.redemptionStatus)) {
    const order = await Order.findOne({ recipientId: recipient._id, tenantId: recipient.tenantId });
    throw new ApiError(409, 'Already redeemed', 'ALREADY_REDEEMED', {
      orderNumber: order?.orderNumber,
      trackUrl: order ? `/api/v1/redemptions/${token}/track` : null,
    });
  }

  const { campaign, shop } = await loadCampaignContext(recipient);

  if (recipient.redemptionStatus === 'invited') {
    transitionRedemption(recipient, 'opened');
    await recipient.save();
  }

  const shopPayload = shop
    ? {
        name: shop.name,
        currencyMode: shop.currencyMode,
        logoUrl: shop.logoUrl || '',
        bannerTheme: shop.bannerConfig?.theme || 'light',
      }
    : null;

  const campaignPayload = {
    name: campaign.name,
    type: campaign.type,
    message: campaign.message,
    shop: shopPayload,
  };

  if (recipient.redemptionStatus === 'verified') {
    return {
      alreadyVerified: true,
      sessionToken: signRedemptionSession(recipient),
      campaign: campaignPayload,
      recipient: { name: recipient.name, creditAmount: recipient.creditAmount },
    };
  }

  return {
    campaign: campaignPayload,
    recipient: { name: recipient.name, creditAmount: recipient.creditAmount },
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
    { expiresIn: SESSION_TTL },
  );
}

export function verifyRedemptionSession(token) {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
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

  const artworkByProductId = new Map();
  const mockupByProductId = new Map();
  const preferredColorsByProductId = new Map();
  let shopCollections = [];
  if (campaign.shopId) {
    shopCollections = await Collection.find({
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
        if (col.preferredColors?.length && !preferredColorsByProductId.has(pid)) {
          preferredColorsByProductId.set(pid, col.preferredColors);
        }
      }
    }
  }

  const filter = { status: 'active' };
  if (campaign.catalogMode === 'selected_products' && campaign.selectedProductIds.length) {
    // Campaign explicitly hand-picked products — those win over the shop.
    filter._id = { $in: campaign.selectedProductIds };
  } else if (campaign.shopId) {
    // Curated store: limit the catalog to products in the shop's collections so
    // recipients see the branded store's selection, not the whole platform catalog.
    const ids = shopCollections
      .flatMap((c) => (c.productRefs || []).map((r) => r.catalogProductId))
      .filter(Boolean);
    // Fall back to the full active catalog when the shop has no curated products yet,
    // so recipients are never stranded with an empty store.
    if (ids.length) filter._id = { $in: ids };
  }
  const products = await CatalogProduct.find(filter)
    .select('name brand group category description basePriceInr primaryImageUrl imageUrls maskImageUrl baseImageUrl variants printAreas')
    .sort({ name: 1 })
    .lean()
    .then((rows) =>
      rows.map((p) => ({
        ...p,
        artworkUrl: artworkByProductId.get(String(p._id)) || '',
        mockupUrl: mockupByProductId.get(String(p._id)) || '',
        preferredColors: preferredColorsByProductId.get(String(p._id)) || [],
      })),
    );
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
  const items = entries.map((entry) => mapKitEntryToItem(entry, kit));

  return {
    kit: { name: kit.name, artworkUrl: kit.artworkUrl || '', packaging: kit.packaging || 'none' },
    items,
  };
}

async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const count = await Order.countDocuments({}).setOptions({ skipTenantGuard: true });
  return `SM-${year}-${String(count + 1).padStart(6, '0')}`;
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
  if (!kitEntries.length) throw new ApiError(422, 'Kit has no active products', 'KIT_EMPTY');

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
    const lineItems = [];
    for (const { ref, product: entryProduct } of kitEntries) {
      const product = await CatalogProduct.findById(entryProduct._id).select('+costPriceInr');
      if (!product) throw new NotFoundError(`Product ${entryProduct._id} not found`);
      const options = resolveKitItemOptions(product, ref);
      const variant = { size: options.sizes[0] || '', color: options.colors[0] || '' };
      const selectedVariant = (product.variants || []).find(
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

    const order = await Order.create({
      tenantId,
      campaignId: campaign._id,
      recipientId: recipient._id,
      orderNumber: await nextOrderNumber(),
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
      amountBreakdown: computeAmountBreakdown(lineItems),
      status: 'created',
      statusHistory: [
        { status: 'created', at: new Date(), actorUserId: null, note: 'Surprise gift auto-fulfillment' },
      ],
    });

    transitionRedemption(recipient, 'order_created');
    await recipient.save();
    await applyOrderInventory(order, campaign);
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
  if (!kitEntries.length) throw new ApiError(422, 'Kit has no active products', 'KIT_EMPTY');

  const quantity = recipients.length;
  const lineItems = [];
  for (const { ref, product: entryProduct } of kitEntries) {
    const product = await CatalogProduct.findById(entryProduct._id).select('+costPriceInr');
    if (!product) throw new NotFoundError(`Product ${entryProduct._id} not found`);
    const options = resolveKitItemOptions(product, ref);
    const variant = { size: options.sizes[0] || '', color: options.colors[0] || '' };
    const selectedVariant = (product.variants || []).find(
      (v) =>
        (!variant.size || v.size === variant.size) &&
        (!variant.color || v.color === variant.color),
    );
    lineItems.push({
      catalogProductId: product._id,
      name: product.name,
      sku: selectedVariant?.sku || product.sku,
      variant,
      qty: quantity,
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

  const order = await Order.create({
    tenantId,
    campaignId: campaign._id,
    recipientId: recipients[0]._id,
    orderNumber: await nextOrderNumber(),
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
    amountBreakdown: computeAmountBreakdown(lineItems),
    status: 'created',
    statusHistory: [
      { status: 'created', at: new Date(), actorUserId: null, note: 'Single-location auto-fulfillment' },
    ],
  });

  for (const recipient of recipients) {
    transitionRedemption(recipient, 'order_created');
    await recipient.save();
  }
  await applyOrderInventory(order, campaign);
  return order;
}

/** §7.9 /submit — idempotent order creation from redemption. */
export async function submitRedemption(token, { items, shippingAddress }) {
  const recipient = await Recipient.findOne({ redemptionToken: token }).setOptions({ skipTenantGuard: true });
  if (!recipient) throw new NotFoundError('Invalid redemption link');
  const { campaign } = await loadCampaignContext(recipient);

  if (recipient.redemptionStatus === 'order_created') {
    const existing = await Order.findOne({ recipientId: recipient._id, tenantId: recipient.tenantId });
    return {
      orderNumber: existing.orderNumber,
      estimatedDelivery: '7-10 business days',
      idempotentReplay: true,
    };
  }
  if (recipient.redemptionStatus !== 'verified') {
    throw new ApiError(403, 'Verify OTP before submitting your order', 'NOT_VERIFIED');
  }

  const kitFulfillment = isKitFulfillment(campaign);
  let kit = null;
  let kitEntries = [];
  if (kitFulfillment) {
    kit = await Kit.findOne({ _id: campaign.kitId, tenantId: recipient.tenantId });
    if (!kit) throw new NotFoundError('Kit not found');
    kitEntries = await loadActiveKitEntries(kit);
    const expectedIds = new Set(kitEntries.map((e) => String(e.product._id)));
    const submittedIds = new Set(items.map((i) => String(i.productId)));
    if (expectedIds.size !== submittedIds.size || [...expectedIds].some((id) => !submittedIds.has(id))) {
      throw new ApiError(422, 'Order items must match the kit contents exactly', 'KIT_ITEMS_MISMATCH');
    }
  }

  // Baked design mockups for this shop's products, so the order item image is
  // the composited mockup (what production should print against), not the bare
  // mask. Only relevant for store (non-kit) redemptions.
  const mockupByProductId = new Map();
  if (!kitFulfillment && campaign.shopId) {
    const cols = await Collection.find({
      ...collectionsForShopFilter(campaign.shopId),
      tenantId: recipient.tenantId,
      status: { $ne: 'archived' },
    })
      .select('productRefs')
      .lean();
    for (const col of cols) {
      for (const ref of col.productRefs || []) {
        const pid = ref.catalogProductId ? String(ref.catalogProductId) : '';
        if (pid && ref.mockupUrl && !mockupByProductId.has(pid)) mockupByProductId.set(pid, ref.mockupUrl);
      }
    }
  }

  // Non-negotiable #4: every order item carries a full product snapshot
  // (price, cost, GST, HSN, image) frozen at order time.
  const lineItems = [];
  for (const item of items) {
    const product = await CatalogProduct.findById(item.productId).select('+costPriceInr');
    if (!product) throw new NotFoundError(`Product ${item.productId} not found`);
    const kitRef = kitFulfillment
      ? kitEntries.find((e) => String(e.product._id) === String(item.productId))?.ref ?? null
      : null;

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
      name: product.name,
      sku: product.sku,
      variant: item.variant ?? {},
      qty: item.qty,
      unitPriceInr: product.basePriceInr,
      costPriceInr: product.costPriceInr ?? 0,
      gstRate: product.gstRate ?? 18,
      hsnCode: product.hsnCode ?? '',
      imageUrl: mockupByProductId.get(String(product._id)) || kitProductImageUrl(product, kitRef || {}) || product.maskImageUrl || product.primaryImageUrl || product.imageUrls?.[0] || '',
    });
  }

  const breakdown = computeAmountBreakdown(lineItems);
  if (!kitFulfillment && breakdown.total > recipient.creditAmount) {
    throw new ApiError(
      422,
      `Order total ₹${breakdown.total} exceeds your credit of ₹${recipient.creditAmount}`,
      'CREDIT_EXCEEDED',
    );
  }

  const orderNumber = await nextOrderNumber();
  const order = await Order.create({
    tenantId: recipient.tenantId,
    campaignId: campaign._id,
    recipientId: recipient._id,
    orderNumber,
    items: lineItems,
    shippingAddress,
    amountBreakdown: breakdown,
    status: 'created',
    statusHistory: [{ status: 'created', at: new Date(), actorUserId: null, note: 'Redemption submit' }],
  });

  transitionRedemption(recipient, 'redeemed');
  transitionRedemption(recipient, 'order_created');
  await recipient.save();

  // §3.2 reservation hook — redemption consumes stock. Best-effort: an
  // inventory bookkeeping error must never block a recipient's order.
  await applyOrderInventory(order, campaign);

  return { orderNumber: order.orderNumber, estimatedDelivery: '7-10 business days', orderId: String(order._id) };
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
