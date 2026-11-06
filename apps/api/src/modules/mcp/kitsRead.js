import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { Kit } from '../kits/kit.model.js';
import { PlatformKit } from '../kits/platformKit.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { isCuratedKitMeta, parseCuratedKitMeta } from '../kits/curatedKitMeta.js';
import { employeeReaderFromContext } from './employeesRead.js';

const READ_ROLES = new Set(rolesForTenantArea('kits', 'read'));
const OBJECT_ID = /^[a-f\d]{24}$/i;

export const KITS_LIST_DESCRIPTION = [
  'List customized kits owned by this workspace, including a curated kit only after it has been copied into the workspace.',
  'Company admins and department managers can list them. Another workspace is never included.',
  'Search matches the kit name. Draft, live, and archived kits can be filtered by status.',
  'Each row includes the kit id, type, status, item count, stored kit price, official image, and whether it can be sent.',
  'The stored price is the kit card price. The send preview calculates the payable total.',
  'This does not send a kit, create a campaign, or copy a curated kit.',
].join(' ');

export const KITS_GET_DESCRIPTION = [
  'Get one workspace kit by id from kits_list.',
  'Includes constituent products, quantities, the stored kit price, status, packaging, and the official image.',
  'A curated copy is marked curated and keeps the platform kit id it came from.',
  'Company admins and department managers only. This does not send the kit.',
].join(' ');

export const KITS_LIST_CURATED_DESCRIPTION = [
  'List active ShelfMerch curated kits. These are platform kits, not workspace-owned customized kits.',
  'Search matches the kit name or description. maxPriceInr filters the stored inclusive kit price.',
  'Each row includes the platform kit id, item count, stored price, official image, packaging, and whether a logo is required before sending.',
  'Any signed-in company admin or department manager in a workspace can read them.',
  'This does not copy the kit into the workspace or send it.',
].join(' ');

export const KITS_GET_CURATED_DESCRIPTION = [
  'Get one active ShelfMerch curated kit by id from kits_list_curated.',
  'Includes item labels, quantities, the stored inclusive price, images, packaging, and logo requirement.',
  'Archived and draft platform kits are not returned.',
  'This does not copy the kit into the workspace or send it.',
].join(' ');

const kitSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['customized', 'curated']),
  status: z.string(),
  itemCount: z.number().int(),
  priceInr: z.number(),
  imageUrl: z.string(),
  packaging: z.string(),
  sendEligible: z.boolean(),
});

const productSchema = z.object({
  catalogProductId: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  imageUrl: z.string(),
});

export const kitsListInputSchema = z.object({
  query: z.string().trim().max(80).optional(),
  status: z.enum(['draft', 'live', 'archived']).optional(),
});
export const kitsListOutputSchema = z.object({ items: z.array(kitSummarySchema) });
export const kitsGetInputSchema = z.object({ kitId: z.string().trim().regex(OBJECT_ID) });
export const kitsGetOutputSchema = kitSummarySchema.extend({
  description: z.string(),
  platformKitId: z.string(),
  requireLogo: z.boolean(),
  products: z.array(productSchema),
});
export const kitsListCuratedInputSchema = z.object({
  query: z.string().trim().max(80).optional(),
  maxPriceInr: z.number().nonnegative().optional(),
});
export const kitsListCuratedOutputSchema = z.object({
  items: z.array(kitSummarySchema.omit({ sendEligible: true }).extend({
    requireLogo: z.boolean(),
  })),
});
export const kitsGetCuratedInputSchema = z.object({ platformKitId: z.string().trim().regex(OBJECT_ID) });
export const kitsGetCuratedOutputSchema = kitsListCuratedOutputSchema.shape.items.element.extend({
  description: z.string(),
  products: z.array(productSchema),
});

function assertReader(user) {
  if (!READ_ROLES.has(user?.role)) {
    throw new ForbiddenError('Kits are not available for this account');
  }
}

function readerOrThrow(ctx) {
  const reader = employeeReaderFromContext(ctx);
  if (!reader.tenantId || !reader.user?.userId) {
    throw new ForbiddenError('Kits are not available for this account');
  }
  assertReader(reader.user);
  return reader;
}

function escapeSearch(value) {
  return String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function httpsImage(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function curatedSummary(kit) {
  const items = Array.isArray(kit.items) ? kit.items : [];
  const images = Array.isArray(kit.itemImages) ? kit.itemImages : [];
  return {
    id: String(kit._id),
    name: kit.name || 'Curated kit',
    type: 'curated',
    status: kit.status || 'active',
    itemCount: items.length || images.length,
    priceInr: Math.round(Number(kit.approxValueInr) || 0),
    imageUrl: httpsImage(kit.heroImage || kit.imageUrls?.[0]),
    packaging: kit.packaging || 'box',
    requireLogo: kit.rules?.requireLogo !== false,
  };
}

function workspaceSummary(kit, meta) {
  const curated = isCuratedKitMeta(meta);
  const products = kit.productRefs || [];
  const images = Array.isArray(meta?.itemImages) ? meta.itemImages : [];
  const sendEligible = kit.status !== 'archived' && (products.length > 0 || curated);
  return {
    id: String(kit._id),
    name: kit.name || 'Kit',
    type: curated ? 'curated' : 'customized',
    status: kit.status || 'draft',
    itemCount: products.length || images.length,
    priceInr: Math.round(Number(curated ? meta.approxValueInr || kit.kitPrice : kit.kitPrice) || 0),
    imageUrl: httpsImage(kit.artworkUrl || meta?.heroImage || meta?.imageUrls?.[0]),
    packaging: kit.packaging || 'none',
    sendEligible,
  };
}

export async function listKits({ tenantId, user, input = {} }) {
  assertReader(user);
  const filter = { tenantId };
  if (input.status) filter.status = input.status;
  if (input.query) filter.name = new RegExp(escapeSearch(input.query), 'i');
  const kits = await Kit.find(filter).sort({ name: 1 }).limit(100).lean();
  return {
    items: kits.map((kit) => workspaceSummary(kit, parseCuratedKitMeta(kit.designNotes))),
  };
}

export async function getKit({ tenantId, user, kitId }) {
  assertReader(user);
  const kit = await Kit.findOne({ _id: kitId, tenantId }).lean();
  if (!kit) throw new NotFoundError('Kit not found');
  const meta = parseCuratedKitMeta(kit.designNotes);
  const ids = (kit.productRefs || []).map((ref) => ref.catalogProductId).filter(Boolean);
  const products = ids.length
    ? await CatalogProduct.find({ _id: { $in: ids } }).select('name primaryImageUrl').lean()
    : [];
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const rows = (kit.productRefs || []).map((ref) => {
    const product = byId.get(String(ref.catalogProductId));
    return {
      catalogProductId: ref.catalogProductId ? String(ref.catalogProductId) : '',
      name: ref.name || product?.name || 'Item',
      quantity: 1,
      imageUrl: httpsImage(ref.mockupUrl || product?.primaryImageUrl),
    };
  });
  return {
    ...workspaceSummary(kit, meta),
    description: String(meta?.description || kit.description || ''),
    platformKitId: meta?.originalId ? String(meta.originalId) : '',
    requireLogo: meta ? meta.requireLogo !== false : false,
    products: rows,
  };
}

export async function listCuratedKits({ tenantId, user, input = {} }) {
  if (!tenantId) throw new ForbiddenError('Kits are not available for this account');
  assertReader(user);
  const filter = { status: 'active' };
  if (input.query) {
    const pattern = new RegExp(escapeSearch(input.query), 'i');
    filter.$or = [{ name: pattern }, { description: pattern }];
  }
  if (input.maxPriceInr != null) filter.approxValueInr = { $lte: input.maxPriceInr };
  const kits = await PlatformKit.find(filter).sort({ name: 1 }).limit(100).lean();
  return { items: kits.map(curatedSummary) };
}

export async function getCuratedKit({ tenantId, user, platformKitId }) {
  if (!tenantId) throw new ForbiddenError('Kits are not available for this account');
  assertReader(user);
  const kit = await PlatformKit.findOne({ _id: platformKitId, status: 'active' }).lean();
  if (!kit) throw new NotFoundError('Kit not found');
  const ids = (kit.items || []).map((item) => item.catalogProductId).filter(Boolean);
  const products = ids.length
    ? await CatalogProduct.find({ _id: { $in: ids } }).select('name primaryImageUrl').lean()
    : [];
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const fromItems = (kit.items || []).map((item) => {
    const product = byId.get(String(item.catalogProductId));
    return {
      catalogProductId: item.catalogProductId ? String(item.catalogProductId) : '',
      name: product?.name || 'Item',
      quantity: Math.max(1, Math.round(Number(item.qty) || 1)),
      imageUrl: httpsImage(product?.primaryImageUrl),
    };
  });
  const fromImages = fromItems.length
    ? fromItems
    : (kit.itemImages || []).map((item) => ({
      catalogProductId: '',
      name: item.label || 'Item',
      quantity: 1,
      imageUrl: httpsImage(item.imageUrl),
    }));
  return {
    ...curatedSummary(kit),
    description: kit.description || '',
    products: fromImages,
  };
}

export async function listKitsForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return listKits({ tenantId: reader.tenantId, user: reader.user, input: args });
}
export async function getKitForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return getKit({ tenantId: reader.tenantId, user: reader.user, kitId: args?.kitId });
}
export async function listCuratedKitsForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return listCuratedKits({ tenantId: reader.tenantId, user: reader.user, input: args });
}
export async function getCuratedKitForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  return getCuratedKit({ tenantId: reader.tenantId, user: reader.user, platformKitId: args?.platformKitId });
}

export function kitsText(output, heading) {
  const items = output.items || [output];
  if (!items.length || !items[0]?.name) return `${heading}\nNo matching kits.`;
  const lines = items.map((kit) => {
    const price = kit.priceInr ? `${kit.priceInr} INR` : 'price unavailable';
    return `${kit.name} [${kit.type}] ${kit.status} ${kit.itemCount} items ${price}`;
  });
  return [heading, ...lines].join('\n');
}

export function kitsError(error, fallback) {
  if (error instanceof NotFoundError) return 'Kit not found.';
  if (error instanceof ForbiddenError) return error.message;
  if (error?.name === 'ZodError') return 'Kit details are not valid.';
  return fallback;
}
