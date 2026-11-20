import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { deflateSync } from 'node:zlib';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CopilotAttachment } from '../src/modules/copilot/copilotAttachment.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { readMcpWriteOutcome } from '../src/modules/mcp/mcpWriteSafety.js';
import { reconcileConversationWriteState, messagesWithWriteOutcomes } from '../src/modules/copilot/copilotWriteState.service.js';
import { getConversation } from '../src/modules/copilot/copilotChat.service.js';
import { configureSwagForCaller, prepareSwag, executeSwag, swagConfigureSchema } from '../src/modules/copilot/swagDesignWorkflow.js';
import { publishCollectionToShop } from '../src/modules/shops/shopCatalogSync.js';
import { uploadCopilotAttachment } from '../src/modules/copilot/copilotAttachments.service.js';
import { uploadFile } from '../src/services/storage.service.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';

vi.mock('../src/modules/shops/shopCatalogSync.js', async original => {
  const actual = await original(); return { ...actual, publishCollectionToShop: vi.fn(actual.publishCollectionToShop) };
});
vi.mock('../src/services/storage.service.js', async original => ({ ...await original(),
  uploadFile: vi.fn().mockResolvedValue({ url: '/uploads/synthetic-artwork.png', key: 'synthetic', driver: 'local' }),
}));
beforeAll(connectTestDb);
afterAll(disconnectTestDb);
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
let tenant, admin, conversation, product, second, shop, otherShop, context, ctx;
beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant(); admin = await makeUser(tenant, 'company_admin');
  conversation = await CopilotConversation.create({ tenantId: tenant._id, userId: admin.user._id });
  product = await CatalogProduct.create({ sku: 'POLO', name: 'ActiveDry Polo', status: 'active', basePriceInr: 500, gstRate: 18,
    variants: [{ sku: 'POLO-M', color: 'Blue', size: 'M', stock: 5 }, { sku: 'POLO-L', enabled: false, stock: 0 }] });
  second = await CatalogProduct.create({ sku: 'MUG', name: 'Mug', status: 'active', basePriceInr: 300 });
  shop = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'synthetic-ai', status: 'live' });
  otherShop = await Shop.create({ tenantId: tenant._id, name: 'Second Store', slug: 'synthetic-second', status: 'draft' });
  context = { tenantId: tenant._id, actorUserId: admin.user._id };
  ctx = { authInfo: { extra: { tenantId: String(tenant._id), userId: String(admin.user._id), role: 'company_admin' } }, copilotConversationId: String(conversation._id) };
});
async function configure(changes = {}) {
  const doc = await CopilotConversation.findById(conversation._id);
  return configureSwagForCaller(ctx, { revision: doc.swag?.revision || 0, ...changes });
}
async function ready(changes = {}) {
  return configure({ name: 'New Employee Swag', addProductIds: [String(product._id)], artwork: 'none', shopIds: [String(shop._id)], ...changes });
}
async function prepare(action = 'publish') {
  const state = await configure();
  const input = { conversationId: String(conversation._id), revision: state.revision, action };
  return { input, approval: await prepareSwag({ ...context, input }) };
}
function execute(request, extra = {}) {
  return executeSwag({ ...context, input: { ...request.input, confirmationId: request.approval.confirmationId,
    idempotencyKey: `swag:${request.approval.confirmationId}`, ...extra } });
}

it('starts at name and never creates collection records while gathering selections', async () => {
  expect(await configure()).toMatchObject({ nextStep: 'name', persisted: false });
  expect(await configure({ name: ' New Employee Swag ' })).toMatchObject({ name: 'New Employee Swag', nextStep: 'products' });
  expect(await configure({ name: 'Renamed' })).toMatchObject({ name: 'Renamed' });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it.each(['', '   ', 'x'.repeat(161)])('rejects invalid collection name %j', async name => {
  await expect(configure({ name })).rejects.toThrow();
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('validates real products, exact enabled variants and safe prices without internal data', async () => {
  const state = await ready();
  // Catalog prices are already GST-inclusive; never add GST again in Copilot.
  expect(state.products[0]).toMatchObject({ id: String(product._id), name: product.name, sellingPriceInr: 500 });
  expect(state.products[0].variants).toHaveLength(1);
  expect(state.products[0].variants[0].sku).toBe('POLO-M');
  expect(JSON.stringify(state)).not.toMatch(/costPrice|supplier|password/);
  expect(swagConfigureSchema.safeParse({ variants: ['invented'] }).success).toBe(false);
});
it('supports multiple products, deduplication, removal and replacement across reload', async () => {
  await ready();
  await configure({ addProductIds: [String(product._id), String(second._id)] });
  const state = await configure({ removeProductIds: [String(product._id)] });
  expect(state.productIds).toEqual([String(second._id)]);
  expect((await CopilotConversation.findById(conversation._id)).swag.name).toBe('New Employee Swag');
});
it('rejects unavailable products and concurrent selection edits', async () => {
  await ready();
  await CatalogProduct.updateOne({ _id: second._id }, { status: 'archived' });
  await expect(configure({ addProductIds: [String(second._id)] })).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
  await expect(configureSwagForCaller(ctx, { revision: 0, name: 'Raced' })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
});
it('PREPARE creates only approval and binds exact design details and target stores', async () => {
  await ready(); const request = await prepare();
  expect(request.approval.preview).toMatchObject({ name: 'New Employee Swag', action: 'publish', artwork: 'none' });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toHaveLength(0);
});
it('publishes optional-artwork designs once to all selected stores with active listing identities', async () => {
  await ready({ addProductIds: [String(product._id), String(second._id)], shopIds: [String(shop._id), String(otherShop._id)] });
  const request = await prepare(); const result = await execute(request);
  expect(result).toMatchObject({ published: true, status: 'ready', productCount: 2 });
  expect(result.stores.map(s => s.name)).toEqual(['AI Store', 'Second Store']);
  const saved = await Collection.findOne({ _id: result.id, tenantId: tenant._id });
  expect(saved.shopIds.map(String)).toEqual([String(shop._id), String(otherShop._id)]);
  for (const store of await Shop.find({ tenantId: tenant._id })) {
    expect(store.activeListingKeys).toEqual([`${result.id}:${product._id}`, `${result.id}:${second._id}`]);
  }
  expect((await Shop.findOne({ _id: otherShop._id, tenantId: tenant._id })).status).toBe('draft');
  expect(await execute(request)).toEqual(result);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
});
it('save for later never publishes or requires a store, and supports loading authoritative saved state', async () => {
  await ready({ shopIds: [] });
  const result = await execute(await prepare('save'));
  expect(result).toMatchObject({ published: false, status: 'draft', stores: [] });
  expect((await Collection.findOne({ _id: result.id, tenantId: tenant._id })).shopIds).toHaveLength(0);
  const loaded = await configure({ collectionId: result.id });
  expect(loaded).toMatchObject({ persisted: true, published: false, savedStatus: 'draft' });
  expect(loaded.editorPath).toBe(`/swag/new?edit=${result.id}`);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
});
it('duplicate concurrent execution cannot create duplicate collections or listings', async () => {
  await ready(); const request = await prepare();
  const results = await Promise.allSettled([execute(request), execute(request)]);
  expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
  expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toHaveLength(1);
});
it.each(['selection', 'store', 'product'])('rejects a changed confirmed %s before any write', async change => {
  await ready(); const request = await prepare();
  if (change === 'selection') await configure({ name: 'Unapproved name' });
  if (change === 'store') await Shop.updateOne({ _id: shop._id, tenantId: tenant._id }, { name: 'Unapproved store' });
  if (change === 'product') await CatalogProduct.updateOne({ _id: product._id }, { basePriceInr: 999 });
  await expect(execute(request)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('rejects artwork changes after confirmation, including product placements', async () => {
  await ready(); const saved = await execute(await prepare('save'));
  await configure({ collectionId: saved.id }); const request = await prepare();
  await Collection.updateOne({ _id: saved.id, tenantId: tenant._id }, { 'productRefs.0.placement': { xPct: 10, yPct: 20, wPct: 30, rot: 0 } });
  await expect(execute(request)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toHaveLength(0);
});
it.each(['cancelled', 'expired'])('rejects %s approval without creating a collection', async mode => {
  await ready(); const request = await prepare();
  await McpWriteConfirmation.updateOne({ tenantId: tenant._id, confirmationId: request.approval.confirmationId },
    { $set: mode === 'cancelled' ? { status: 'rejected', copilotOutcome: { state: 'cancelled' } } : { expiresAt: new Date(0) } });
  await expect(execute(request)).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('rejects foreign stores, collections, conversations and non-admin execution', async () => {
  const foreign = await makeTenant();
  const store = await Shop.create({ tenantId: foreign._id, name: 'Foreign', slug: 'foreign' });
  await expect(ready({ shopIds: [String(store._id)] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const collection = await Collection.create({ tenantId: foreign._id, code: 'C1', name: 'Foreign', productRefs: [] });
  await expect(configure({ collectionId: String(collection._id) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const employee = await makeUser(tenant, 'recipient');
  await ready(); const request = await prepare();
  await expect(executeSwag({ tenantId: tenant._id, actorUserId: employee.user._id,
    input: { ...request.input, confirmationId: request.approval.confirmationId, idempotencyKey: 'foreign-key-123' } })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });
});
it('rolls back a second-store failure completely and does not report partial publication as success', async () => {
  await ready({ shopIds: [String(shop._id), String(otherShop._id)] }); const request = await prepare();
  vi.mocked(publishCollectionToShop).mockImplementationOnce(async (...args) => {
    const actual = await vi.importActual('../src/modules/shops/shopCatalogSync.js'); return actual.publishCollectionToShop(...args);
  }).mockRejectedValueOnce(new Error('Synthetic second-store failure'));
  await expect(execute(request)).rejects.toThrow('Synthetic second-store failure');
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await Shop.findOne({ _id: shop._id, tenantId: tenant._id })).activeListingKeys).toHaveLength(0);
  expect((await readMcpWriteOutcome({ ...context, operation: 'swag.collection', confirmationId: request.approval.confirmationId })).state).toBe('failed');
  await expect(execute(request)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
});
it('recovers a committed result read-only when the generic request acknowledgement was lost', async () => {
  await ready(); const request = await prepare(); const result = await execute(request);
  await McpWriteIdempotency.updateMany({ tenantId: tenant._id }, { $set: { status: 'pending', leaseExpiresAt: new Date(0) }, $unset: { result: '' } });
  expect(await readMcpWriteOutcome({ ...context, operation: 'swag.collection', confirmationId: request.approval.confirmationId }))
    .toMatchObject({ state: 'completed', result });
  expect(await execute(request)).toEqual(result);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
});
it('reload projects success/cancelled outcomes and does not revive old confirmation previews', async () => {
  await ready(); const request = await prepare();
  await CopilotConversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant', content: 'Please confirm',
    artifacts: [{ kind: 'confirmation', operation: 'swag.collection', status: 'pending', confirmationId: request.approval.confirmationId }] } } });
  const result = await execute(request);
  const loaded = await CopilotConversation.findById(conversation._id);
  const outcomes = await reconcileConversationWriteState(loaded);
  expect(loaded.messages[0].artifacts[0]).toMatchObject({ kind: 'confirmation', status: 'completed' });
  const restored = await getConversation({ tenantId: tenant._id, userId: admin.user._id, conversationId: String(conversation._id) });
  const receipts = restored.messages.flatMap(m => m.artifacts).filter(a => a.kind === 'success');
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ result: { id: result.id } });
  expect(restored.messages.at(-1).uiEventId).toBe(`swag:receipt:${request.approval.confirmationId}`);
  expect(JSON.stringify(messagesWithWriteOutcomes(loaded.messages, outcomes))).not.toContain('Please confirm');
});
async function attachment(extra = {}) {
  return CopilotAttachment.create({ tenantId: tenant._id, userId: admin.user._id, conversationId: conversation._id,
    kind: 'swag_artwork', status: 'uploaded', mimeType: 'image/png', fileUrl: '/uploads/synthetic.png',
    expiresAt: new Date(Date.now() + 60000), ...extra });
}
it.each(['foreign_actor', 'foreign_conversation', 'expired', 'wrong_kind'])('rejects %s artwork attachment', async mode => {
  const other = await makeUser(tenant, 'company_admin');
  const art = await attachment(mode === 'foreign_actor' ? { userId: other.user._id }
    : mode === 'foreign_conversation' ? { conversationId: new mongoose.Types.ObjectId() }
      : mode === 'expired' ? { expiresAt: new Date(0) } : { kind: 'artwork' });
  await expect(ready({ artworkAttachmentId: String(art._id) })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('associates uploaded artwork only after confirmed save, then requires the existing editor before publish', async () => {
  vi.stubEnv('SWAG_RENDERER_EXECUTABLE', '');
  const art = await attachment(); await ready({ artworkAttachmentId: String(art._id) });
  await expect(prepare()).rejects.toMatchObject({ code: 'DESIGN_REQUIRED' });
  const saved = await execute(await prepare('save'));
  expect(saved.published).toBe(false);
  expect((await Collection.findOne({ _id: saved.id, tenantId: tenant._id })).artworkUrl).toBe(art.fileUrl);
  expect(saved.artworkStatus).toMatch(/place artwork in the designer/);
  await configure({ collectionId: saved.id });
  await expect(prepare()).rejects.toMatchObject({ code: 'DESIGN_REQUIRED' });
  // Isolated saved-editor fixture: the actual editor persists these verified fields.
  await Collection.updateOne({ _id: saved.id, tenantId: tenant._id }, { $set: { 'productRefs.0.mockupUrl': '/uploads/verified-mockup.png',
    'productRefs.0.placements': [{ key: 'front', xPct: 50, yPct: 50, wPct: 20, rot: 0, artworkUrl: art.fileUrl }] } });
  const loaded = await configure({ collectionId: saved.id });
  expect(loaded.designs[0]).toMatchObject({ mockupUrl: '/uploads/verified-mockup.png', placements: [{ key: 'front' }] });
  expect(await execute(await prepare())).toMatchObject({ id: saved.id, published: true });
});
it('removes saved artwork only on explicit confirmed save, preserving an unsaved selection until then', async () => {
  await ready(); const saved = await execute(await prepare('save'));
  await Collection.updateOne({ _id: saved.id, tenantId: tenant._id }, { artworkUrl: '/uploads/art.png', 'productRefs.0.mockupUrl': '/uploads/mockup.png' });
  await configure({ collectionId: saved.id, artwork: 'none' });
  expect((await Collection.findOne({ _id: saved.id, tenantId: tenant._id })).artworkUrl).toBe('/uploads/art.png');
  await execute(await prepare('save'));
  const actual = await Collection.findOne({ _id: saved.id, tenantId: tenant._id });
  expect(actual.artworkUrl).toBe(''); expect(actual.productRefs[0].mockupUrl).toBe('');
});
it('rejects invalid PNG artwork via the actual designer validator before mocked storage', async () => {
  await expect(uploadCopilotAttachment({ tenantId: tenant._id, userId: admin.user._id, role: 'company_admin',
    kind: 'swag_artwork', conversationId: conversation._id,
    file: { originalname: 'logo.png', mimetype: 'image/png', buffer: Buffer.from('invalid PNG') } })).rejects.toMatchObject({ code: 'INVALID_ARTWORK' });
  expect(uploadFile).not.toHaveBeenCalled();
});

function png(dpi = 300) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  const density = Buffer.alloc(9); density.writeUInt32BE(Math.round(dpi / 0.0254), 0); density.writeUInt32BE(Math.round(dpi / 0.0254), 4); density[8] = 1;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('pHYs', density),
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}
it('accepts real 300-DPI PNG validation through the attachment path, using mocked storage only', async () => {
  const uploaded = await uploadCopilotAttachment({ tenantId: tenant._id, userId: admin.user._id, role: 'company_admin',
    kind: 'swag_artwork', conversationId: conversation._id,
    file: { originalname: 'logo.png', mimetype: 'image/png', buffer: png() } });
  expect(uploaded).toMatchObject({ kind: 'swag_artwork', status: 'uploaded', conversationId: String(conversation._id) });
  expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'artwork' }));
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('rejects low-DPI PNG and unauthorized upload ownership before storage', async () => {
  const input = { tenantId: tenant._id, userId: admin.user._id, role: 'company_admin', kind: 'swag_artwork', conversationId: conversation._id,
    file: { originalname: 'logo.png', mimetype: 'image/png', buffer: png(72) } };
  await expect(uploadCopilotAttachment(input)).rejects.toMatchObject({ code: 'INVALID_ARTWORK' });
  const other = await makeUser(tenant, 'company_admin');
  await expect(uploadCopilotAttachment({ ...input, userId: other.user._id, file: { ...input.file, buffer: png() } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(uploadFile).not.toHaveBeenCalled();
});
it('revalidates actual role assignments at execution', async () => {
  await ready(); const request = await prepare();
  await RoleAssignment.updateOne({ tenantId: tenant._id, userId: admin.user._id }, { role: 'recipient' });
  await expect(execute(request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('rejects a catalog mutation racing inside execution, rather than publishing stale approval', async () => {
  await ready(); const request = await prepare();
  const original = CatalogProduct.updateOne.bind(CatalogProduct);
  const spy = vi.spyOn(CatalogProduct, 'updateOne').mockImplementationOnce(async (...args) => {
    await original({ _id: product._id }, { name: 'Changed concurrently' });
    return original(...args);
  });
  try { await expect(execute(request)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' }); }
  finally { spy.mockRestore(); }
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await Shop.findOne({ tenantId: tenant._id, _id: shop._id })).activeListingKeys).toHaveLength(0);
});
it('preserves mixed saved designs where one product intentionally has no artwork', async () => {
  await ready({ addProductIds: [String(product._id), String(second._id)] });
  const saved = await execute(await prepare('save'));
  await Collection.updateOne({ tenantId: tenant._id, _id: saved.id }, { artworkUrl: '/uploads/saved-art.png',
    'productRefs.0.mockupUrl': '/uploads/saved-polo.png', 'productRefs.0.placements': [{ key: 'front', xPct: 50, yPct: 50, wPct: 20, rot: 0 }] });
  await configure({ collectionId: saved.id });
  const result = await execute(await prepare());
  expect(result).toMatchObject({ published: true, productCount: 2 });
  expect(result.designs[1].mockupUrl).toBe('');
  expect(result.designs[0].placements[0].key).toBe('front');
});
it('fences a worker whose generic execution lease was taken over before its transaction', async () => {
  await ready(); const request = await prepare();
  const original = McpWriteIdempotency.updateOne.bind(McpWriteIdempotency);
  const spy = vi.spyOn(McpWriteIdempotency, 'updateOne').mockImplementationOnce(async (...args) => {
    await original({ _id: args[0]._id, tenantId: tenant._id }, { $inc: { fence: 1 }, $set: { leaseOwner: 'synthetic-takeover' } });
    return original(...args);
  });
  try { await expect(execute(request)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' }); }
  finally { spy.mockRestore(); }
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await Shop.findOne({ tenantId: tenant._id, _id: shop._id })).activeListingKeys).toHaveLength(0);
});
it('serializes independently prepared approvals for the same conversation revision', async () => {
  await ready(); const one = await prepare(); const two = await prepare();
  const outcomes = await Promise.allSettled([execute(one), execute(two)]);
  expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
  expect((await Shop.findOne({ tenantId: tenant._id, _id: shop._id })).activeListingKeys).toHaveLength(1);
});

it('resolves exact product names without requiring the caller to supply a MongoDB id', async () => {
  const state = await configure({ name: 'swag for winter', addProductNames: [product.name] });
  expect(state).toMatchObject({ name: 'swag for winter', productIds: [String(product._id)] });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await configure({ addProductNames: [product.name] })).productIds).toEqual([String(product._id)]);
  expect((await configure({ removeProductNames: [product.name] })).productIds).toEqual([]);
});
it('uses the latest verified product cards for an unambiguous contextual selection', async () => {
  await CopilotConversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant',
    artifacts: [{ kind: 'product', product: { id: String(product._id), name: product.name } }] } } });
  expect((await configure({ name: 'Winter', productReference: 'this one' })).productIds).toEqual([String(product._id)]);
  await CopilotConversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant', artifacts: [{ kind: 'kit', kit: { id: 'kit-example', name: 'Other workflow result' } }] } } });
  await expect(configure({ productReference: 'this one' })).rejects.toMatchObject({ code: 'PRODUCT_AMBIGUOUS' });
});
it('asks for clarification for ambiguous names or multiple contextual cards', async () => {
  await CatalogProduct.create({ sku: 'DUPLICATE-POLO', name: product.name, status: 'active', basePriceInr: 700 });
  await expect(configure({ addProductNames: [product.name] })).rejects.toMatchObject({ code: 'PRODUCT_AMBIGUOUS' });
  await CopilotConversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant', artifacts:
    [product, second].map(p => ({ kind: 'product', product: { id: String(p._id), name: p.name } })) } } });
  await expect(configure({ productReference: 'this' })).rejects.toMatchObject({ code: 'PRODUCT_AMBIGUOUS' });
});
it('revalidates contextual products instead of trusting historical card eligibility', async () => {
  await CopilotConversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant',
    artifacts: [{ kind: 'product', product: { id: String(product._id), name: product.name } }] } } });
  await CatalogProduct.updateOne({ _id: product._id }, { status: 'archived' });
  await expect(configure({ productReference: 'this' })).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
});
