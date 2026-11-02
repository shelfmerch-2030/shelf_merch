import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { slugifyShopName } from '../../utils/shopSlug.js';
import { Shop } from '../shops/shop.model.js';
import { createShop, updateShop } from '../shops/shops.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpShopClaim } from './mcpShopClaim.model.js';

const WRITE_ROLES = new Set(rolesForTenantArea('shops', 'write'));

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ''))
  .refine(
    (value) => value === '' || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value),
    'Enter a valid domain like company.com',
  );

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');

const logoSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || /^https:\/\/\S+$/.test(value), 'Use an https logo URL');

const textFields = {
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
  pointsConversionEnabled: z.boolean().optional(),
  companyEmailDomain: domainSchema.optional(),
  categories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  logoUrl: logoSchema.optional(),
};

const createSchema = z.object({
  ...textFields,
  currencyMode: z.enum(['points', 'inr']).optional(),
}).strict();

const updateSchema = z.object({
  shopId: z.string().trim().regex(/^[a-fA-F0-9]{24}$/),
  ...textFields,
  name: textFields.name.optional(),
}).strict().refine(
  (value) => ['name', 'slug', 'pointsConversionEnabled', 'companyEmailDomain', 'categories', 'logoUrl']
    .some((field) => value[field] !== undefined),
  { message: 'Store details are not valid' },
);

export const SHOPS_PREPARE_CREATE_DESCRIPTION = [
  'Preview a new ShelfMerch company store without saving it.',
  'Checks the name, slug, currency mode, company email domain, and text settings.',
  'Company admins only. The store stays a draft until someone publishes it in ShelfMerch.',
  'Logo files, banners, catalog products, and design placement are not accepted.',
  'Returns a one-use confirmation. Saving requires shops_execute_create.',
].join(' ');

export const SHOPS_EXECUTE_CREATE_DESCRIPTION = [
  'Create the draft store from shops_prepare_create.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller and the store settings before writing.',
  'A repeated key returns the original draft. The same store name is not created twice.',
].join(' ');

export const SHOPS_PREPARE_UPDATE_DESCRIPTION = [
  'Preview a company store name, slug, domain, categories, or logo URL change without saving it.',
  'Company admins only. Status, currency mode, banners, products, and design files are rejected.',
  'The confirmation is bound to the current store record and expires.',
].join(' ');

export const SHOPS_EXECUTE_UPDATE_DESCRIPTION = [
  'Apply the store change from shops_prepare_update.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks permissions and the store record before writing.',
  'A changed record, an expired confirmation, or a repeated confirmation is rejected.',
].join(' ');

export const shopsPrepareCreateInputSchema = createSchema;
export const shopsExecuteCreateInputSchema = createSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const shopsPrepareCreateOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    action: z.enum(['create', 'reuse']),
    name: z.string(),
    slug: z.string(),
    status: z.string(),
    currencyMode: z.string(),
    pointsConversionEnabled: z.boolean(),
    companyEmailDomain: z.string(),
    categories: z.array(z.string()),
    shopId: z.string().optional(),
  }),
});
export const shopsExecuteCreateOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  currencyMode: z.string(),
  pointsConversionEnabled: z.boolean(),
  companyEmailDomain: z.string(),
  categories: z.array(z.string()),
});
export const shopsPrepareUpdateInputSchema = updateSchema;
export const shopsExecuteUpdateInputSchema = updateSchema.and(z.object({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
}));
export const shopsPrepareUpdateOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    shopId: z.string(),
    version: z.string(),
    changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() })),
    shop: shopsExecuteCreateOutputSchema,
  }),
});
export const shopsExecuteUpdateOutputSchema = shopsExecuteCreateOutputSchema;

let claimsReady;

function invalidDetails() {
  return new ApiError(400, 'Store details are not valid', 'VALIDATION');
}

function duplicateKey(error) {
  return error?.code === 11000 || error?.cause?.code === 11000;
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function nameKey(input) {
  return `shop:${normalizeName(input.name)}`;
}

function assertShopWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Store changes require a company admin');
  }
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function parseCreate(input) {
  const parsed = createSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  return canonicalCreate(parsed.data);
}

function parseUpdate(input) {
  const parsed = updateSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  return parsed.data;
}

function canonicalCreate(data) {
  return {
    name: data.name.trim(),
    slug: data.slug || '',
    currencyMode: data.currencyMode || 'points',
    pointsConversionEnabled: data.pointsConversionEnabled ?? false,
    companyEmailDomain: data.companyEmailDomain || '',
    categories: data.categories || [],
    logoUrl: data.logoUrl || '',
  };
}

function createData(input) {
  return {
    name: input.name,
    ...(input.slug ? { slug: input.slug } : {}),
    currencyMode: input.currencyMode,
    pointsConversionEnabled: input.pointsConversionEnabled,
    companyEmailDomain: input.companyEmailDomain,
    categories: input.categories,
    logoUrl: input.logoUrl,
  };
}

function safeShop(shop) {
  return {
    id: String(shop._id),
    name: shop.name,
    slug: shop.slug || '',
    status: shop.status,
    currencyMode: shop.currencyMode,
    pointsConversionEnabled: Boolean(shop.pointsConversionEnabled),
    companyEmailDomain: shop.companyEmailDomain || '',
    categories: [...(shop.categories || [])],
  };
}

async function ensureClaims() {
  claimsReady ??= McpShopClaim.syncIndexes();
  await claimsReady;
}

async function matchingShop(tenantId, name) {
  const wanted = normalizeName(name);
  const rows = await Shop.find({ tenantId }).sort({ createdAt: 1 });
  return rows.find((row) => normalizeName(row.name) === wanted) || null;
}

function wantedSlug(input) {
  return input.slug || slugifyShopName(input.name);
}

function sameConfig(shop, input) {
  const slug = shop.slug || '';
  const slugMatches = input.slug
    ? slug === input.slug
    : slug === wantedSlug(input) || slug.startsWith(`${wantedSlug(input)}-`);
  return slugMatches
    && shop.currencyMode === input.currencyMode
    && Boolean(shop.pointsConversionEnabled) === input.pointsConversionEnabled
    && (shop.companyEmailDomain || '') === input.companyEmailDomain
    && JSON.stringify(shop.categories || []) === JSON.stringify(input.categories)
    && (shop.logoUrl || '') === input.logoUrl;
}

async function loadShop(tenantId, shopId) {
  const shop = await Shop.findOne({ _id: shopId, tenantId });
  if (!shop) throw new NotFoundError('Store not found');
  return shop;
}

function shopVersion(shop) {
  return {
    shopId: String(shop._id),
    name: shop.name,
    slug: shop.slug || '',
    status: shop.status,
    currencyMode: shop.currencyMode,
    pointsConversionEnabled: Boolean(shop.pointsConversionEnabled),
    companyEmailDomain: shop.companyEmailDomain || '',
    categories: [...(shop.categories || [])],
    logoUrl: shop.logoUrl || '',
    updatedAt: new Date(shop.updatedAt).toISOString(),
  };
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
}

function shopChanges(shop, input) {
  const current = {
    name: shop.name,
    slug: shop.slug || '',
    pointsConversionEnabled: Boolean(shop.pointsConversionEnabled),
    companyEmailDomain: shop.companyEmailDomain || '',
    categories: [...(shop.categories || [])],
    logoUrl: shop.logoUrl || '',
  };
  return ['name', 'slug', 'pointsConversionEnabled', 'companyEmailDomain', 'categories', 'logoUrl']
    .filter((field) => input[field] !== undefined)
    .filter((field) => displayValue(current[field]) !== displayValue(input[field]))
    .map((field) => ({
      field,
      from: displayValue(current[field]),
      to: displayValue(input[field]),
    }));
}

async function auditShop(actor, action, shop) {
  await writeAudit({
    tenantId: actor.tenant._id,
    req: { tenantId: actor.tenant._id, user: { userId: actor.user.userId, role: actor.user.role } },
    action,
    entityType: 'Shop',
    entityId: shop._id,
    after: {
      name: shop.name,
      slug: shop.slug,
      status: shop.status,
      currencyMode: shop.currencyMode,
    },
  });
}

async function applyDraftConfig(actor, shop, input) {
  if (shop.currencyMode !== input.currencyMode) {
    throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
  }
  if (sameConfig(shop, input)) return safeShop(shop);
  const patch = {};
  if (input.name !== shop.name) patch.name = input.name;
  if (input.slug && input.slug !== shop.slug) patch.slug = input.slug;
  if (Boolean(shop.pointsConversionEnabled) !== input.pointsConversionEnabled) {
    patch.pointsConversionEnabled = input.pointsConversionEnabled;
  }
  if ((shop.companyEmailDomain || '') !== input.companyEmailDomain) {
    patch.companyEmailDomain = input.companyEmailDomain;
  }
  if (JSON.stringify(shop.categories || []) !== JSON.stringify(input.categories)) {
    patch.categories = input.categories;
  }
  if ((shop.logoUrl || '') !== input.logoUrl) patch.logoUrl = input.logoUrl;
  if (!Object.keys(patch).length) return safeShop(shop);
  const { shop: saved } = await updateShop({
    tenantId: actor.tenant._id,
    shopId: shop._id,
    patch,
  });
  await auditShop(actor, 'shop.update', saved);
  return safeShop(saved);
}

async function linkMatchingShop(tenantId, logicalKey, input) {
  const claim = await McpShopClaim.findOne({ tenantId, logicalKey });
  if (claim?.shopId) {
    const linked = await Shop.findOne({ _id: claim.shopId, tenantId });
    if (linked) return String(linked._id);
  }
  const match = await matchingShop(tenantId, input.name);
  if (!match) return null;
  await McpShopClaim.updateOne(
    { tenantId, logicalKey },
    { $set: { shopId: match._id } },
    { upsert: true },
  );
  return String(match._id);
}

async function waitForShop(tenantId, logicalKey, input) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const shopId = await linkMatchingShop(tenantId, logicalKey, input);
    if (shopId) return shopId;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new ApiError(409, 'This store is already being created', 'SHOP_CREATE_IN_PROGRESS');
}

async function saveLinkedShop(actor, input) {
  await ensureClaims();
  const tenantId = actor.tenant._id;
  const existing = await matchingShop(tenantId, input.name);
  if (existing?.status === 'live') {
    throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
  }
  if (existing) return applyDraftConfig(actor, existing, input);

  const logicalKey = nameKey(input);
  let ownsClaim = false;
  try {
    await McpShopClaim.create({ tenantId, logicalKey });
    ownsClaim = true;
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  if (!ownsClaim) {
    const shopId = await waitForShop(tenantId, logicalKey, input);
    const shop = await Shop.findOne({ _id: shopId, tenantId });
    if (!shop) throw new ApiError(409, 'This store is already being created', 'SHOP_CREATE_IN_PROGRESS');
    if (shop.status !== 'draft') {
      throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
    }
    return applyDraftConfig(actor, shop, input);
  }

  try {
    const shop = await createShop({ tenantId, data: createData(input) });
    if (shop.status !== 'draft') {
      throw new ApiError(409, 'Store was not created as a draft', 'SHOP_NOT_DRAFT');
    }
    await McpShopClaim.updateOne({ tenantId, logicalKey }, { $set: { shopId: shop._id } });
    await auditShop(actor, 'shop.create', shop);
    return safeShop(shop);
  } catch (error) {
    const created = await matchingShop(tenantId, input.name);
    if (created) {
      await McpShopClaim.updateOne({ tenantId, logicalKey }, { $set: { shopId: created._id } });
    } else {
      await McpShopClaim.deleteOne({ tenantId, logicalKey, shopId: null });
    }
    throw error;
  }
}

async function createResourceState(tenantId, input) {
  const shop = await matchingShop(tenantId, input.name);
  if (!shop) return { name: normalizeName(input.name), exists: false };
  return { exists: true, ...shopVersion(shop) };
}

export async function prepareShopCreate({ tenantId, actorUserId, input, now }) {
  const requested = parseCreate(input);
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.create',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      const shop = await matchingShop(tenantId, requested.name);
      if (shop?.status === 'live') {
        throw new ApiError(409, 'A store with this name already exists', 'SHOP_EXISTS');
      }
    },
    validate: async () => requested,
    resourceState: async () => createResourceState(tenantId, requested),
    summary: async () => ({ action: 'preview', name: requested.name, status: 'draft' }),
  });
  const shop = await matchingShop(tenantId, requested.name);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      action: shop ? 'reuse' : 'create',
      name: requested.name,
      slug: shop?.slug || wantedSlug(requested),
      status: 'draft',
      currencyMode: requested.currencyMode,
      pointsConversionEnabled: requested.pointsConversionEnabled,
      companyEmailDomain: requested.companyEmailDomain,
      categories: requested.categories,
      ...(shop ? { shopId: String(shop._id) } : {}),
    },
  };
}

export async function executeShopCreate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseCreate(input);
  const saved = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.create',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
    },
    validate: async () => requested,
    resourceState: async () => createResourceState(tenantId, requested),
    reconcile: async () => {
      const shop = await matchingShop(tenantId, requested.name);
      if (shop?.status === 'draft') return { outcome: 'completed', result: safeShop(shop) };
      const claim = await McpShopClaim.findOne({ tenantId, logicalKey: nameKey(requested) });
      if ((claim && !claim.shopId) || shop) return { outcome: 'uncertain' };
      return { outcome: 'absent' };
    },
    execute: async (actor) => saveLinkedShop(actor, requested),
  });
  return presentShop(tenantId, saved);
}

export async function prepareShopUpdate({ tenantId, actorUserId, input, now }) {
  const requested = parseUpdate(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.update',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      planned.shop = await loadShop(tenantId, requested.shopId);
      planned.changes = shopChanges(planned.shop, requested);
      if (!planned.changes.length) throw invalidDetails();
    },
    validate: async () => requested,
    resourceState: async () => shopVersion(await loadShop(tenantId, requested.shopId)),
    summary: async () => ({
      action: 'preview',
      shopId: requested.shopId,
      fields: planned.changes?.map((change) => change.field) || [],
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      shopId: String(planned.shop._id),
      version: new Date(planned.shop.updatedAt).toISOString(),
      changes: planned.changes,
      shop: {
        ...safeShop(planned.shop),
        ...Object.fromEntries(planned.changes.map((change) => [change.field, requested[change.field]])),
      },
    },
  };
}

export async function executeShopUpdate({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseUpdate(input);
  const saved = await executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'shops.update',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertShopWriter(actor);
      const shop = await loadShop(tenantId, requested.shopId);
      if (!shopChanges(shop, requested).length) throw invalidDetails();
    },
    validate: async () => requested,
    resourceState: async () => shopVersion(await loadShop(tenantId, requested.shopId)),
    reconcile: async () => {
      const shop = await Shop.findOne({ _id: requested.shopId, tenantId });
      if (!shop) return { outcome: 'uncertain' };
      if (!shopChanges(shop, requested).length) return { outcome: 'completed', result: safeShop(shop) };
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      const patch = {};
      for (const field of ['name', 'slug', 'pointsConversionEnabled', 'companyEmailDomain', 'categories', 'logoUrl']) {
        if (requested[field] !== undefined) patch[field] = requested[field];
      }
      const { shop } = await updateShop({ tenantId, shopId: requested.shopId, patch });
      await auditShop(actor, 'shop.update', shop);
      return safeShop(shop);
    },
  });
  return presentShop(tenantId, saved);
}


async function presentShop(tenantId, result) {
  const shop = await Shop.findOne({ _id: result.id, tenantId });
  return {
    ...result,
    companyEmailDomain: shop?.companyEmailDomain || '',
  };
}
function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Stores are not available for this account');
  }
  return caller;
}

export async function prepareShopCreateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopCreate({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeShopCreateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeShopCreate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export async function prepareShopUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareShopUpdate({ tenantId: caller.tenantId, actorUserId: caller.user.userId, input: args });
}

export async function executeShopUpdateForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeShopUpdate({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function shopWriteText(output, heading) {
  const shop = output.preview?.shop || output.preview || output;
  const lines = [
    heading,
    `${shop.name} (${shop.slug}) ${shop.status} ${shop.currencyMode}`,
  ];
  if (output.preview?.changes?.length) {
    lines.push(...output.preview.changes.map((change) => `${change.field}: ${change.from} -> ${change.to}`));
  }
  if (output.confirmationId) lines.push('Confirm this preview before it expires.');
  return lines.join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot change stores.',
  SHOP_EXISTS: 'A store with this name already exists.',
  NOT_FOUND: 'Store not found.',
  VALIDATION: 'Store details are not valid.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the change again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the change again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested change.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different change.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This store change is already in progress.',
  ACTOR_INACTIVE: 'This account cannot change stores.',
  TENANT_INACTIVE: 'This workspace cannot change stores.',
  SHOP_CREATE_IN_PROGRESS: 'This store is already being created.',
};

export function shopWriteError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
