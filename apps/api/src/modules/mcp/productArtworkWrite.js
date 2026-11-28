import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Shop } from '../shops/shop.model.js';
import { Collection } from '../collections/collection.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { isCollectionLinkedToShop } from '../collections/collectionQueries.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, loadMcpActor, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpCollectionClaim } from './mcpCollectionClaim.model.js';
import { McpShopAssetTicket } from './mcpShopAssetTicket.model.js';
import {
  createPendingAssetTicket,
  getShopAssetUpload,
  resolveShopAssetUrl,
} from './shopsAssetUpload.js';

const ROLES = new Set(rolesForTenantArea('shops', 'write'));

const placementSchema = z.object({
  centerXPercent: z.number().finite(),
  centerYPercent: z.number().finite(),
  widthPercent: z.number().finite(),
  rotationDeg: z.number().finite().min(-180).max(180).optional(),
}).strict();

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(80).optional(),
  color: z.string().trim().min(1).max(80).optional(),
  size: z.string().trim().min(1).max(40).optional(),
}).strict().refine((value) => Boolean(value.sku || value.color || value.size), {
  message: 'Name the variant by sku, color, or size',
});

const designSchema = z.object({
  shopId: objectId.optional(),
  shopName: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(160),
  catalogProductId: objectId,
  artworkTicketId: z.string().trim().min(8).max(80),
  decorationArea: z.string().trim().min(1).max(80),
  placement: placementSchema,
  variant: variantSchema.optional(),
}).strict().refine((value) => Boolean(value.shopId || value.shopName), {
  message: 'Provide a store id or an exact store name',
});

export const PRODUCT_ARTWORK_PREPARE_UPLOAD_DESCRIPTION = [
  'Start a secure browser upload for product artwork.',
  'ChatGPT and other MCP clients cannot pass an attached file into ShelfMerch. Do not treat a chat attachment as uploaded.',
  'Show uploadPageUrl as a clickable link. The token stays in the URL fragment.',
  'PNG only, at least 300 DPI on both axes, maximum 5 MB.',
  'After the browser page succeeds, call products_get_artwork_upload. Nothing is applied to a product by this tool.',
  'Company admins only.',
].join(' ');

export const PRODUCT_ARTWORK_GET_UPLOAD_DESCRIPTION = [
  'Check a product artwork upload started by products_prepare_artwork_upload.',
  'status=ready means the file is stored for this workspace. A pending ticket has no artwork URL.',
  'Then call products_prepare_design. Do not invent an artwork URL.',
].join(' ');

export const PRODUCT_ARTWORK_PREPARE_DESIGN_DESCRIPTION = [
  'Preview applying an uploaded product artwork to one catalog product and decoration area.',
  'Requires a ready artworkTicketId from products_get_artwork_upload. An arbitrary image URL is not accepted.',
  'Checks the product, optional variant, decoration area, and placement. The artwork must stay inside the decoration area.',
  'Returns a placement preview. This tool does not bake a mockup image and does not save or publish a collection.',
  'Saving requires products_execute_design with the confirmation id.',
].join(' ');

export const PRODUCT_ARTWORK_EXECUTE_DESIGN_DESCRIPTION = [
  'Save the product artwork design from products_prepare_design onto a draft collection.',
  'Requires the confirmation id and an idempotency key.',
  'The collection stays a draft and is not published to the store.',
  'A repeat of the same key returns the original draft.',
].join(' ');

const uploadInputSchema = z.object({
  originalName: z.string().trim().min(1).max(200).optional(),
}).strict();

export const productArtworkPrepareUploadInputSchema = uploadInputSchema;
export const productArtworkPrepareUploadOutputSchema = z.object({
  ticketId: z.string(),
  kind: z.literal('product_artwork'),
  uploadUrl: z.string(),
  uploadPageUrl: z.string(),
  uploadToken: z.string(),
  expiresAt: z.string(),
  instructions: z.string(),
});
export const productArtworkGetUploadInputSchema = z.object({
  ticketId: z.string().trim().min(8).max(80),
}).strict();
export const productArtworkGetUploadOutputSchema = z.object({
  ticketId: z.string(),
  kind: z.literal('product_artwork'),
  status: z.enum(['pending', 'ready', 'expired', 'consumed']),
  assetUrl: z.string().optional(),
  mimeType: z.string().optional(),
  originalName: z.string().optional(),
  expiresAt: z.string(),
});

const placementOut = z.object({
  printCxPct: z.number(),
  printCyPct: z.number(),
  printWPct: z.number(),
  xPct: z.number(),
  yPct: z.number(),
  wPct: z.number(),
  rot: z.number(),
});
const previewOut = z.object({
  artworkUrl: z.string(),
  productImageUrl: z.string(),
  decorationArea: z.object({ key: z.string(), label: z.string() }),
  placement: placementOut,
  variant: z.object({ sku: z.string(), color: z.string(), size: z.string() }).nullable(),
  bakedMockup: z.literal(false),
});

export const productArtworkPrepareDesignInputSchema = designSchema;
export const productArtworkExecuteDesignInputSchema = designSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const productArtworkPrepareDesignOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: previewOut.extend({
    action: z.enum(['create', 'reuse']),
    name: z.string(),
    shopId: z.string(),
    catalogProductId: z.string(),
    status: z.literal('draft'),
    published: z.literal(false),
  }),
});
export const productArtworkExecuteDesignOutputSchema = previewOut.extend({
  id: z.string(),
  name: z.string(),
  status: z.literal('draft'),
  shopId: z.string(),
  catalogProductId: z.string(),
  published: z.literal(false),
});

function invalid(message = 'Product artwork details are not valid') {
  return new ApiError(400, message, 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function assertAdmin(actor) {
  if (!ROLES.has(actor?.user?.role)) throw new ForbiddenError('Product artwork requires a company admin');
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user?.userId) {
    throw new ForbiddenError('Product artwork is not available for this account');
  }
  return caller;
}

function sameText(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function designKey(name, productId) {
  return `product-design:${normalizeName(name)}:${productId}`;
}

function checkedPlacement(placement) {
  const centerX = placement.centerXPercent;
  const centerY = placement.centerYPercent;
  const width = placement.widthPercent;
  const rotation = placement.rotationDeg ?? 0;
  if (centerX < 0 || centerX > 100 || centerY < 0 || centerY > 100 || width <= 0 || width > 100) {
    throw new ApiError(422, 'Artwork placement is outside the decoration area', 'PLACEMENT_INVALID');
  }
  const radians = (rotation * Math.PI) / 180;
  const half = (width / 2) * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
  if (centerX - half < 0 || centerX + half > 100 || centerY - half < 0 || centerY + half > 100) {
    throw new ApiError(422, 'Artwork placement is outside the decoration area', 'PLACEMENT_INVALID');
  }
  return {
    printCxPct: centerX,
    printCyPct: centerY,
    printWPct: width,
    xPct: centerX,
    yPct: centerY,
    wPct: width,
    rot: rotation,
  };
}

function matchArea(product, wanted) {
  const areas = product.printAreas || [];
  const matches = areas.filter((area) => area.key === wanted || sameText(area.label, wanted));
  if (matches.length !== 1) {
    throw new ApiError(422, 'That decoration area is not on this product', 'DECORATION_AREA_INVALID');
  }
  return matches[0];
}

function matchVariant(product, selector) {
  if (!selector) return null;
  const variants = (product.variants || []).filter((variant) => variant.enabled !== false);
  const matches = variants.filter((variant) => {
    if (selector.sku && variant.sku !== selector.sku) return false;
    if (selector.color && !sameText(variant.color, selector.color)) return false;
    if (selector.size && !sameText(variant.size, selector.size)) return false;
    return true;
  });
  if (matches.length !== 1) {
    throw new ApiError(422, 'That variant is not available on this product', 'VARIANT_INVALID');
  }
  return matches[0];
}

function productImageUrl(product) {
  return product.baseImageUrl || product.primaryImageUrl || product.imageUrls?.[0] || '';
}

function variantOut(variant) {
  if (!variant) return null;
  return {
    sku: variant.sku || '',
    color: variant.color || '',
    size: variant.size || '',
  };
}

function areaOut(area) {
  return { key: area.key || area.label || '', label: area.label || area.key || '' };
}

async function resolveShop(tenantId, selector) {
  if (selector.shopId) {
    const shop = await Shop.findOne({ _id: selector.shopId, tenantId });
    if (!shop) throw new NotFoundError('Store not found');
    if (selector.shopName && !sameText(shop.name, selector.shopName)) {
      throw new ApiError(400, 'Store id and name do not match', 'VALIDATION');
    }
    return shop;
  }
  const rows = await Shop.find({ tenantId }).sort({ createdAt: 1 });
  const matches = rows.filter((row) => sameText(row.name, selector.shopName));
  if (!matches.length) throw new NotFoundError('Store not found');
  if (matches.length > 1) {
    throw new ApiError(409, 'Several stores match that name. Choose one store id.', 'SHOP_AMBIGUOUS');
  }
  return matches[0];
}

async function loadProduct(id) {
  const product = await CatalogProduct.findById(id);
  if (!product) throw new NotFoundError('Catalog product not found');
  if (product.status && product.status !== 'active') {
    throw new ApiError(422, 'This catalog product is not available', 'PRODUCT_UNAVAILABLE');
  }
  return product;
}

async function loadArtworkTicket(tenantId, actorUserId, ticketId) {
  const ticket = await McpShopAssetTicket.findOne({ tenantId, ticketId, userId: actorUserId });
  if (!ticket || ticket.kind !== 'product_artwork') {
    throw new ApiError(404, 'Product artwork upload not found', 'NOT_FOUND');
  }
  if (ticket.status !== 'ready' && ticket.status !== 'consumed') {
    throw new ApiError(422, 'Product artwork upload is not ready', 'ASSET_REQUIRED');
  }
  if (!ticket.assetUrl) throw new ApiError(422, 'Product artwork upload is not ready', 'ASSET_REQUIRED');
  return ticket;
}

async function resolveDesign(tenantId, actorUserId, input) {
  const shop = await resolveShop(tenantId, input);
  const product = await loadProduct(input.catalogProductId);
  const area = matchArea(product, input.decorationArea);
  const placement = checkedPlacement(input.placement);
  const variant = matchVariant(product, input.variant);
  const ticket = await loadArtworkTicket(tenantId, actorUserId, input.artworkTicketId);
  return {
    shop,
    product,
    area,
    placement,
    variant,
    ticket,
    artworkUrl: ticket.assetUrl,
    productImageUrl: productImageUrl(product),
  };
}

function designSnapshotFrom(resolved, input) {
  return {
    shopId: String(resolved.shop._id),
    productId: String(resolved.product._id),
    areaKey: resolved.area.key || resolved.area.label || '',
    artworkUrl: resolved.artworkUrl,
    ticketStatus: resolved.ticket.status,
    centerXPercent: input.placement.centerXPercent,
    centerYPercent: input.placement.centerYPercent,
    widthPercent: input.placement.widthPercent,
    rotationDeg: input.placement.rotationDeg ?? 0,
    variantSku: resolved.variant?.sku || '',
    variantColor: resolved.variant?.color || '',
    variantSize: resolved.variant?.size || '',
  };
}

function numbersMatch(left, right) {
  return Number(left) === Number(right);
}

function samePlacement(stored, placement) {
  if (!stored) return false;
  return numbersMatch(stored.printCxPct, placement.printCxPct)
    && numbersMatch(stored.printCyPct, placement.printCyPct)
    && numbersMatch(stored.printWPct, placement.printWPct)
    && numbersMatch(stored.rot, placement.rot);
}

async function findSavedDesign(tenantId, input, resolved) {
  const rows = await Collection.find({ tenantId, name: input.name.trim(), status: 'draft' });
  return rows.find((row) => {
    if (row.shopId || row.shopIds?.length) return false;
    const ref = (row.productRefs || [])[0];
    if (!ref || String(ref.catalogProductId) !== String(input.catalogProductId)) return false;
    const areaKey = resolved.area.key || resolved.area.label || '';
    const placed = (ref.placements || []).find((entry) => entry.artworkUrl === resolved.artworkUrl && entry.key === areaKey);
    return Boolean(placed) && samePlacement(placed, resolved.placement);
  }) || null;
}

function previewBody(resolved) {
  return {
    artworkUrl: resolved.artworkUrl,
    productImageUrl: resolved.productImageUrl,
    decorationArea: areaOut(resolved.area),
    placement: resolved.placement,
    variant: variantOut(resolved.variant),
    bakedMockup: false,
  };
}

function presentSaved(collection, resolved) {
  return {
    id: String(collection._id),
    name: collection.name,
    status: 'draft',
    shopId: String(resolved.shop._id),
    catalogProductId: String(resolved.product._id),
    published: isCollectionLinkedToShop(collection, resolved.shop._id),
    ...previewBody(resolved),
  };
}

let claimsReady;
function ensureClaims() {
  claimsReady ??= McpCollectionClaim.syncIndexes();
  return claimsReady;
}

async function saveDesign(actor, input) {
  await ensureClaims();
  const tenantId = actor.tenant._id;
  assertAdmin(actor);
  const resolved = await resolveDesign(tenantId, actor.user.userId, input);
  const existing = await findSavedDesign(tenantId, input, resolved);
  if (existing) {
    if (existing.status !== 'draft' || isCollectionLinkedToShop(existing, resolved.shop._id)) {
      throw new ApiError(409, 'A collection with this name already exists', 'COLLECTION_EXISTS');
    }
    return presentSaved(existing, resolved);
  }
  const key = designKey(input.name, input.catalogProductId);
  let claim = await McpCollectionClaim.findOne({ tenantId, logicalKey: key });
  if (!claim) {
    try {
      claim = await McpCollectionClaim.create({ tenantId, logicalKey: key });
    } catch (error) {
      if (error?.code !== 11000 && error?.cause?.code !== 11000) throw error;
      claim = await McpCollectionClaim.findOne({ tenantId, logicalKey: key });
    }
  }
  if (claim?.collectionId) {
    const linked = await Collection.findOne({ _id: claim.collectionId, tenantId });
    if (linked?.status === 'draft') {
      const again = await findSavedDesign(tenantId, input, resolved);
      if (again) return presentSaved(again, resolved);
    }
    if (linked) throw new ApiError(409, 'A collection with this name already exists', 'COLLECTION_EXISTS');
  }
  const areaKey = resolved.area.key || resolved.area.label || 'area_1';
  const collection = await Collection.create({
    tenantId,
    shopId: null,
    shopIds: [],
    code: `C${crypto.randomInt(100_000_000, 999_999_999)}`,
    name: input.name.trim(),
    status: 'draft',
    artworkUrl: resolved.artworkUrl,
    preferredColors: resolved.variant?.color ? [resolved.variant.color] : [],
    productRefs: [{
      catalogProductId: resolved.product._id,
      brand: resolved.product.brand || '',
      name: resolved.product.name,
      group: resolved.product.group || '',
      inheritArtwork: false,
      mockupUrl: '',
      placement: resolved.placement,
      placements: [{ key: areaKey, ...resolved.placement, artworkUrl: resolved.artworkUrl }],
    }],
    createdBy: actor.user.userId,
    isShopSpecific: false,
  });
  await McpCollectionClaim.updateOne({ _id: claim._id, tenantId }, { $set: { collectionId: collection._id } });
  await resolveShopAssetUrl({
    tenantId,
    actorUserId: actor.user.userId,
    ticketId: input.artworkTicketId,
    expectedKind: 'product_artwork',
    assetUrl: resolved.artworkUrl,
    consume: true,
  });
  await writeAudit({
    tenantId,
    req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
    action: 'collection.artwork_design',
    entityType: 'Collection',
    entityId: collection._id,
    after: {
      name: collection.name,
      status: collection.status,
      catalogProductId: String(resolved.product._id),
      artworkUrl: resolved.artworkUrl,
    },
  });
  const saved = presentSaved(collection, resolved);
  if (saved.published || saved.status !== 'draft') {
    throw new ApiError(409, 'The design was not left as a draft', 'CONFLICT');
  }
  return saved;
}

export async function prepareProductArtworkUpload({ tenantId, actorUserId, input }) {
  const actor = await loadMcpActor({ tenantId, actorUserId });
  assertAdmin(actor);
  const parsed = uploadInputSchema.safeParse(input || {});
  if (!parsed.success) throw invalid();
  const created = await createPendingAssetTicket({
    tenantId,
    userId: actorUserId,
    kind: 'product_artwork',
    originalName: parsed.data.originalName || '',
  });
  return {
    ...created,
    instructions: [
      'Open uploadPageUrl in a browser. The secure token is in the URL fragment, not the query string.',
      'ChatGPT cannot forward an attached file to ShelfMerch. Do not paste the image into chat.',
      'Allowed file: PNG, at least 300 DPI on both axes, maximum 5 MB.',
      'When the browser page shows success, call products_get_artwork_upload with this ticketId.',
      'Then call products_prepare_design. The design is not saved until products_execute_design.',
    ].join(' '),
  };
}

export async function getProductArtworkUpload({ tenantId, actorUserId, ticketId }) {
  const status = await getShopAssetUpload({ tenantId, actorUserId, ticketId });
  if (status.kind !== 'product_artwork') {
    throw new ApiError(404, 'Product artwork upload not found', 'NOT_FOUND');
  }
  return status;
}

export async function prepareProductArtworkDesign({ tenantId, actorUserId, input, now }) {
  const requested = designSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'products.artwork_design',
    payload: requested.data,
    now,
    authorize: async (actor) => {
      assertAdmin(actor);
      planned.resolved = await resolveDesign(tenantId, actorUserId, requested.data);
      planned.existing = await findSavedDesign(tenantId, requested.data, planned.resolved);
    },
    validate: async () => requested.data,
    resourceState: async () => designSnapshotFrom(
      await resolveDesign(tenantId, actorUserId, requested.data),
      requested.data,
    ),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      action: planned.existing ? 'reuse' : 'create',
      name: requested.data.name.trim(),
      shopId: String(planned.resolved.shop._id),
      catalogProductId: String(planned.resolved.product._id),
      status: 'draft',
      published: false,
      ...previewBody(planned.resolved),
    },
  };
}

export async function executeProductArtworkDesign({
  tenantId, actorUserId, input, confirmationId, idempotencyKey, now,
}) {
  const requested = designSchema.safeParse(businessInput(input));
  if (!requested.success) throw invalid();
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'products.artwork_design',
    payload: requested.data,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertAdmin(actor);
    },
    validate: async () => requested.data,
    resourceState: async () => designSnapshotFrom(
      await resolveDesign(tenantId, actorUserId, requested.data),
      requested.data,
    ),
    reconcile: async () => {
      const resolved = await resolveDesign(tenantId, actorUserId, requested.data).catch(() => null);
      if (!resolved) return { outcome: 'absent' };
      const existing = await findSavedDesign(tenantId, requested.data, resolved);
      if (!existing) return { outcome: 'absent' };
      return { outcome: 'completed', result: presentSaved(existing, resolved) };
    },
    execute: async (actor) => saveDesign(actor, requested.data),
  });
}

export async function prepareProductArtworkUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareProductArtworkUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function getProductArtworkUploadForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  const parsed = productArtworkGetUploadInputSchema.safeParse(args || {});
  if (!parsed.success) throw invalid('Upload ticket id is not valid');
  return getProductArtworkUpload({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    ticketId: parsed.data.ticketId,
  });
}

export async function prepareProductArtworkDesignForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareProductArtworkDesign({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeProductArtworkDesignForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeProductArtworkDesign({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function productArtworkText(output, heading) {
  if (output.uploadPageUrl) {
    return [
      heading,
      'ChatGPT cannot send the attached file to ShelfMerch.',
      'Open this link in a browser to upload the PNG:',
      output.uploadPageUrl,
      `Expires ${output.expiresAt}`,
    ].join('\n');
  }
  if (output.preview) {
    return [
      heading,
      `${output.preview.name} stays a draft`,
      `Artwork ${output.preview.artworkUrl}`,
      `Area ${output.preview.decorationArea.label}`,
      'No mockup image was baked. Confirm this preview before it expires.',
    ].join('\n');
  }
  if (output.status && !output.id) {
    return [heading, `Upload ${output.status}`, output.assetUrl || 'No artwork stored yet.'].join('\n');
  }
  return [
    heading,
    `${output.name} is a draft and is not published`,
    `Artwork ${output.artworkUrl}`,
    `Area ${output.decorationArea?.label || ''}`,
  ].join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot customize product artwork.',
  NOT_FOUND: 'That store, product, or artwork upload was not found.',
  VALIDATION: 'Product artwork details are not valid.',
  INVALID_ARTWORK: 'Upload a PNG artwork file at 300 DPI or higher, up to 5 MB.',
  ASSET_REQUIRED: 'The artwork upload is not ready. Finish the browser upload first.',
  DECORATION_AREA_INVALID: 'That decoration area is not on this product.',
  PLACEMENT_INVALID: 'The artwork does not fit inside the decoration area.',
  VARIANT_INVALID: 'That variant is not available on this product.',
  PRODUCT_UNAVAILABLE: 'This catalog product is not available.',
  SHOP_AMBIGUOUS: 'Several stores match that name. Ask the user to choose one store id.',
  COLLECTION_EXISTS: 'A collection with this name already exists.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare it again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare it again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested design.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different design.',
  ACTOR_INACTIVE: 'This account cannot customize product artwork.',
  TENANT_INACTIVE: 'This workspace cannot customize product artwork.',
};

export function productArtworkError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
