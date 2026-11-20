import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { png } from './fixtures/swagArtwork.js';
import { Readable } from 'node:stream';
import PNG from 'png-js';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CopilotAttachment } from '../src/modules/copilot/copilotAttachment.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { readMcpWriteOutcome } from '../src/modules/mcp/mcpWriteSafety.js';
import { configureSwagForCaller, prepareSwag, executeSwag } from '../src/modules/copilot/swagDesignWorkflow.js';
import { withSwagRenderer, rendererVersion } from '../src/modules/copilot/swagRenderer.service.js';
import { readProductImage } from '../src/modules/copilot/swagArtwork.service.js';
import { LOCAL_UPLOAD_DIR, readStoredFile, uploadBuffer } from '../src/services/storage.service.js';
import { buildBrandedProductListings, mapBrandedListing, resolveBrandedListingSnapshot } from '../src/modules/storefront/brandedShopProducts.js';

vi.mock('../src/services/storage.service.js', async original => ({ ...await original(), readStoredFile: vi.fn(), uploadBuffer: vi.fn() }));
let tenant, account, conversation, products, attachment, store, context, ctx, logo, folder;
const assets = new Map();
const previousExecutable = process.env.SWAG_RENDERER_EXECUTABLE;
beforeAll(async () => {
  // Explicit executable supplied by the controlled test runner; never download a browser.
  if (!process.env.SWAG_RENDERER_EXECUTABLE) throw new Error('Set SWAG_RENDERER_EXECUTABLE to an approved installed browser for real renderer acceptance tests.');
  await connectTestDb();
  await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  folder = await fs.mkdtemp(path.join(LOCAL_UPLOAD_DIR, 'isolated-swag-auto-'));
  await fs.writeFile(path.join(folder, 'base.png'), png(200, 300, [235,235,235,255]));
});
afterAll(async () => {
  await disconnectTestDb();
  if (folder && path.dirname(folder) === LOCAL_UPLOAD_DIR && path.basename(folder).startsWith('isolated-swag-auto-')) await fs.rm(folder, { recursive: true, force: true });
  if (previousExecutable === undefined) delete process.env.SWAG_RENDERER_EXECUTABLE; else process.env.SWAG_RENDERER_EXECUTABLE = previousExecutable;
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await clearTestDb(); assets.clear();
  tenant = await makeTenant(); account = await makeUser(tenant, 'company_admin');
  conversation = await CopilotConversation.create({ tenantId: tenant._id, userId: account.user._id });
  const baseUrl = `/uploads/${path.basename(folder)}/base.png`;
  products = await CatalogProduct.create(['Polo', 'Mug', 'Bottle'].map((name, index) => ({ sku: `AUTO-${index}`, name, group: ['polo', 'mug', 'bottle'][index], status: 'active', basePriceInr: 500,
    maskImageUrl: baseUrl, physicalDimensions: { width: 8, height: 12, length: 4 },
    printAreas: [{ key: index ? 'front' : 'left', label: index ? 'Front' : 'Left chest', mockupImageUrl: baseUrl,
      xIn: index + 1, yIn: 2, widthIn: index + 1, heightIn: 2, dpi: 300, methods: ['dtf'] }] })));
  logo = png(32, 16, [220,20,20,255]);
  attachment = await CopilotAttachment.create({ tenantId: tenant._id, userId: account.user._id, conversationId: conversation._id, kind: 'swag_artwork',
    fileUrl: '/uploads/approved-source-logo.png', storageKey: `${tenant._id}/artwork/isolated-logo.png`, storageDriver: 'local',
    originalName: 'company-logo.png', mimeType: 'image/png', expiresAt: new Date(Date.now() + 3600000) });
  store = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'isolated-auto-store', status: 'draft' });
  context = { tenantId: tenant._id, actorUserId: account.user._id };
  ctx = { authInfo: { extra: { tenantId: String(tenant._id), userId: String(account.user._id), role: 'company_admin' } }, copilotConversationId: String(conversation._id) };
  vi.mocked(readStoredFile).mockImplementation(async () => Readable.from([logo]));
  vi.mocked(uploadBuffer).mockImplementation(async input => {
    const url = `/uploads/${tenant._id}/${input.kind}/${crypto.randomUUID()}.png`; assets.set(url, Buffer.from(input.buffer)); return { url };
  });
  await configure({ name: 'Welcome Kit 2026', addProductIds: products.map(p => String(p._id)), artworkAttachmentId: String(attachment._id) });
});
async function configure(patch = {}) {
  const current = await CopilotConversation.findOne({ _id: conversation._id, tenantId: tenant._id });
  return configureSwagForCaller(ctx, { revision: current.swag?.revision || 0, ...patch });
}
async function prepare(action = 'apply') {
  const state = await configure(), input = { conversationId: String(conversation._id), revision: state.revision, action };
  return { input, approval: await prepareSwag({ ...context, input }) };
}
const execute = request => executeSwag({ ...context, input: { ...request.input, confirmationId: request.approval.confirmationId, idempotencyKey: `artwork:${request.approval.confirmationId}` } });
const getCollection = id => Collection.findOne({ _id: id, tenantId: tenant._id });

it('uses the real sandboxed browser pipeline to save three different product defaults and branded PNGs', async () => {
  const original = Buffer.from(logo), request = await prepare();
  expect(request.approval.preview.application.targets.map(row => row.areaKey)).toEqual(['left', 'front', 'front']);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  const result = await execute(request), saved = await getCollection(result.id);
  expect(result).toMatchObject({ action: 'apply', published: false, productCount: 3, status: 'ready' });
  expect(saved.productRefs.every(ref => ref.mockupUrl && ref.designOnlyImageUrl && ref.placements[0].artworkUrl === saved.artworkUrl)).toBe(true);
  expect(saved.productRefs.map(ref => ref.printSpec.widthIn)).toEqual([1, 2, 3]);
  expect(assets.get(saved.artworkUrl)).toEqual(original); expect(logo).toEqual(original);
  for (const ref of saved.productRefs) {
    const png = new PNG(assets.get(ref.mockupUrl)); expect([png.width, png.height]).toEqual([1000,1000]);
    const pixels = await new Promise(resolve => png.decode(resolve));
    expect(pixels.some((_, index) => index % 4 === 0 && pixels[index] > pixels[index + 2] + 80)).toBe(true);
  }
  await fs.writeFile(path.resolve('../../previews/copilot/swag-auto/renderer-proof.png'), assets.get(saved.productRefs[1].mockupUrl));
  const state = await configure(); expect(state).toMatchObject({ artwork: 'saved', designReady: true, hasUnsavedChanges: false });
  expect(state.designs.map(row => row.mockupUrl)).toEqual(saved.productRefs.map(ref => ref.mockupUrl));
});
it('Apply approval never publishes; a separate final publish approval uses the same saved images', async () => {
  const applied = await execute(await prepare());
  expect((await Shop.findOne({ _id: store._id, tenantId: tenant._id })).activeListingKeys).toHaveLength(0);
  await configure({ shopNames: ['AI Store'], step: 'review' });
  const published = await execute(await prepare('publish'));
  expect(published.published).toBe(true);
  const listings = await buildBrandedProductListings(await Shop.findOne({ _id: store._id, tenantId: tenant._id }));
  for (const row of applied.designs) expect(listings.find(item => item.catalogProductId === row.productId).mockupUrl).toBe(row.mockupUrl);
  expect((await Shop.findOne({ _id: store._id, tenantId: tenant._id })).status).toBe('draft');
});
it('resumes a Save for Later upload through a new Apply approval without creating a second collection', async () => {
  const saved = await execute(await prepare('save'));
  expect(saved.designs.every(row => !row.mockupUrl)).toBe(true);
  expect(await configure()).toMatchObject({ artwork: 'upload', designReady: false, persisted: true });
  await configure({ artwork: 'upload' });
  const applied = await execute(await prepare());
  expect(applied.id).toBe(saved.id); expect(applied.designs.every(row => row.mockupUrl)).toBe(true);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
});
it('applies a chosen subset without assigning artwork or mockups to other products', async () => {
  await configure({ artworkProductIds: [String(products[1]._id)] });
  const result = await execute(await prepare()), saved = await getCollection(result.id);
  expect(saved.productRefs.map(ref => Boolean(ref.mockupUrl))).toEqual([false,true,false]);
  expect(saved.productRefs[0].placements).toHaveLength(0);
  expect(saved.productRefs[0].inheritArtwork).toBe(false);
});
it('does not visually brand excluded products through a shared-logo fallback in storefront or order snapshots', async () => {
  await configure({ artworkProductIds: [String(products[1]._id)] });
  const applied = await execute(await prepare()), saved = await getCollection(applied.id);
  for (const index of [0,2]) {
    const ref = saved.productRefs[index], listing = mapBrandedListing(saved, ref, products[index].toObject());
    expect(listing.artworkUrl).toBe(''); expect(listing.inheritArtwork).toBe(false);
    expect(resolveBrandedListingSnapshot([saved], listing).artworkUrl).toBe('');
  }
  const selected = mapBrandedListing(saved, saved.productRefs[1], products[1].toObject());
  expect(selected.artworkUrl).toBe(saved.productRefs[1].placements[0].artworkUrl);
});
it('preserves an unselected legacy shared logo while applying a different logo to another product', async () => {
  const initial = await execute(await prepare('save'));
  await Collection.updateOne({ _id: initial.id, tenantId: tenant._id }, {
    $set: { artworkUrl: '/uploads/legacy-logo.png', 'productRefs.0.mockupUrl': '/uploads/legacy-mockup.png' },
    $unset: { 'productRefs.0.inheritArtwork': '' },
  });
  await configure({ artworkProductIds: [String(products[1]._id)] });
  const applied = await execute(await prepare()), saved = await getCollection(applied.id);
  expect(saved.artworkUrl).toBe('/uploads/legacy-logo.png');
  expect(mapBrandedListing(saved, saved.productRefs[0], products[0].toObject()).artworkUrl).toBe('/uploads/legacy-logo.png');
  expect(mapBrandedListing(saved, saved.productRefs[1], products[1].toObject()).artworkUrl).not.toBe('/uploads/legacy-logo.png');
  expect((await configure()).artworkPreviewUrl).toBe(saved.productRefs[1].placements[0].artworkUrl);
});
it('saving a pending replacement for later does not overwrite existing product artwork', async () => {
  const applied = await execute(await prepare()), original = await getCollection(applied.id);
  const next = await CopilotAttachment.create({ ...attachment.toObject(), _id: undefined, fileUrl: '/uploads/new-upload.png',
    storageKey: `${tenant._id}/artwork/new-upload.png`, originalName: 'new-logo.png' });
  await configure({ artworkAttachmentId: String(next._id) });
  await execute(await prepare('save'));
  const saved = await getCollection(applied.id);
  expect(JSON.stringify(saved.productRefs)).toBe(JSON.stringify(original.productRefs));
  expect(saved.artworkUrl).toBe(original.artworkUrl);
  expect(await configure()).toMatchObject({ artwork: 'upload', artworkName: 'new-logo.png', designReady: false });
});
it('removes applied artwork only after a confirmed save and retains explicit unbranded intent', async () => {
  const applied = await execute(await prepare());
  await configure({ artwork: 'none' });
  expect((await getCollection(applied.id)).productRefs[0].mockupUrl).toBeTruthy();
  await execute(await prepare('save'));
  const saved = await getCollection(applied.id);
  expect(saved.artworkUrl).toBe('');
  expect(saved.productRefs.every(ref => !ref.mockupUrl && !ref.placements.length && ref.inheritArtwork === false)).toBe(true);
});
it('retains the dashboard baker image priority when a print-area image differs from the main product view', async () => {
  await fs.writeFile(path.join(folder, 'area.png'), png(200,300,[10,200,10,255]));
  await CatalogProduct.updateOne({ _id: products[1]._id }, { 'printAreas.0.mockupImageUrl': `/uploads/${path.basename(folder)}/area.png` });
  await configure({ artworkProductIds: [String(products[1]._id)] });
  const request = await prepare(); expect(request.approval.preview.application.targets[0].baseUrl).toBe(products[1].maskImageUrl);
  const applied = await execute(request), saved = await getCollection(applied.id), buffer = assets.get(saved.productRefs[1].mockupUrl);
  const pixels = await new Promise(resolve => new PNG(buffer).decode(resolve));
  const offset = (900 * 1000 + 500) * 4;
  expect(Array.from(pixels.slice(offset, offset + 3))).toEqual([235,235,235]);
});
it('duplicate Apply clicks reuse one committed receipt, collection and set of uploaded assets', async () => {
  const request = await prepare(), result = await execute(request), count = assets.size;
  expect(await execute(request)).toEqual(result); expect(assets.size).toBe(count);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
  expect((await McpWriteConfirmation.findOne({ tenantId: tenant._id, confirmationId: request.approval.confirmationId })).copilotOutcome.state).toBe('completed');
});
it('reloading an unchanged Apply review reuses its pending approval', async () => {
  const first = await prepare(), second = await prepare();
  expect(second.approval.confirmationId).toBe(first.approval.confirmationId);
  expect(await McpWriteConfirmation.countDocuments({ tenantId: tenant._id, operation: 'swag.collection' })).toBe(1);
});
it('does not prepare a fresh Apply approval while an earlier consumed application is unverified', async () => {
  const request = await prepare();
  await McpWriteConfirmation.updateOne({ tenantId: tenant._id, confirmationId: request.approval.confirmationId }, { status: 'consumed' });
  await expect(prepare()).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
  expect(assets.size).toBe(0); expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it.each(['no_area', 'polygon', 'engraving'])('identifies unsupported %s products before approval and keeps them untouched on explicitly approved partial application', async mode => {
  await CatalogProduct.updateOne({ _id: products[0]._id }, mode === 'no_area' ? { printAreas: [] } : mode === 'polygon' ? { 'printAreas.0.shapeType': 'polygon' } : { 'printAreas.0.methods': ['engraving'] });
  const request = await prepare(); expect(request.approval.preview.application.manual.map(row => row.name)).toEqual(['Polo']);
  const result = await execute(request), saved = await getCollection(result.id);
  expect(saved.productRefs[0].mockupUrl).toBeFalsy(); expect(result.artworkStatus).toMatch(/1 product unchanged/);
});
it('preserves an existing customized product until replacement is deliberately selected', async () => {
  const first = await execute(await prepare());
  await configure({ artworkAttachmentId: String(attachment._id), artworkProductIds: [String(products[0]._id), String(products[1]._id)] });
  await expect(prepare()).rejects.toMatchObject({ code: 'DESIGN_REQUIRED' });
  await configure({ replaceArtwork: true, artworkProductIds: [String(products[0]._id)] });
  const replacement = await prepare();
  expect(replacement.approval.preview.designs[0].mockupUrl).toBe(first.designs[0].mockupUrl);
  const second = await execute(replacement);
  expect(second.id).toBe(first.id); expect(second.designs[0].mockupUrl).not.toBe(first.designs[0].mockupUrl);
  expect(second.designs[1].mockupUrl).toBe(first.designs[1].mockupUrl);
});
it('rejects stale catalog print-area changes before staging any files', async () => {
  const request = await prepare(); await CatalogProduct.updateOne({ _id: products[0]._id }, { 'printAreas.0.widthIn': 2.5 });
  await expect(execute(request)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' }); expect(assets.size).toBe(0);
});
it('rejects mutated source logo bytes after approval', async () => {
  const request = await prepare(); logo = png(32,16,[0,0,220,255]);
  await expect(execute(request)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' }); expect(assets.size).toBe(0);
});
it.each(['tenantId', 'userId', 'conversationId'])('revalidates attachment %s ownership', async field => {
  await CopilotAttachment.updateOne({ _id: attachment._id }, { [field]: new (await import('mongoose')).default.Types.ObjectId() });
  await expect(prepare()).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(assets.size).toBe(0);
});
it('a failed upload after rendering leaves no Collection or completed success receipt', async () => {
  const request = await prepare(), original = vi.mocked(uploadBuffer).getMockImplementation(); let calls = 0;
  vi.mocked(uploadBuffer).mockImplementation(async input => { if (++calls === 3) throw new Error('Isolated storage failure'); return original(input); });
  await expect(execute(request)).rejects.toThrow('Isolated storage failure');
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await McpWriteConfirmation.findOne({ tenantId: tenant._id, confirmationId: request.approval.confirmationId })).copilotOutcome?.state).not.toBe('completed');
});
it('catalog edits racing staged rendering cannot commit an old approved design', async () => {
  const request = await prepare(), original = vi.mocked(uploadBuffer).getMockImplementation();
  vi.mocked(uploadBuffer).mockImplementationOnce(async input => {
    const result = await original(input); await CatalogProduct.updateOne({ _id: products[0]._id }, { 'printAreas.0.widthIn': 3 }); return result;
  });
  await expect(execute(request)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect(assets.size).toBeGreaterThan(0); // unreferenced staging files, never a visible partially applied design
});
it('a lost acknowledgement after commit recovers the durable result without another render or upload', async () => {
  const request = await prepare(), original = McpWriteIdempotency.findOneAndUpdate.bind(McpWriteIdempotency);
  vi.spyOn(McpWriteIdempotency, 'findOneAndUpdate').mockImplementation((filter, update, options) =>
    update.$set?.status === 'completed' ? Promise.resolve(null) : original(filter, update, options));
  await expect(execute(request)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
  const count = assets.size;
  vi.restoreAllMocks();
  const recovered = await readMcpWriteOutcome({ ...context, operation: 'swag.collection', confirmationId: request.approval.confirmationId });
  expect(recovered).toMatchObject({ state: 'completed', result: { action: 'apply' } }); expect(assets.size).toBe(count);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
});
it('a taken-over lease cannot stage artwork or commit saved references', async () => {
  const request = await prepare(), original = McpWriteIdempotency.updateOne.bind(McpWriteIdempotency);
  vi.spyOn(McpWriteIdempotency, 'updateOne').mockImplementationOnce(async (...args) => {
    await original({ _id: args[0]._id, tenantId: tenant._id }, { $inc: { fence: 1 }, $set: { leaseOwner: 'isolated-takeover' } }); return original(...args);
  });
  await expect(execute(request)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
  expect(assets.size).toBe(0); expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('does not silently adopt a renamed or reselected saved design after manual edits', async () => {
  const applied = await execute(await prepare());
  await Collection.updateOne({ _id: applied.id, tenantId: tenant._id }, { name: 'Changed in editor' });
  expect(await configure()).toMatchObject({ savedDesignChanged: true, canRefreshSavedDesign: false, designReady: false });
  await expect(configure({ refreshSavedDesign: true })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
});
it('reconciles safe manual placement changes through metadata only, invalidating older approval revisions', async () => {
  const applied = await execute(await prepare());
  await Collection.updateOne({ _id: applied.id, tenantId: tenant._id }, { 'productRefs.0.placements.0.rot': 5 });
  expect(await configure()).toMatchObject({ canRefreshSavedDesign: true, savedDesignChanged: true });
  const state = await configure({ refreshSavedDesign: true }); expect(state).toMatchObject({ savedDesignChanged: false, designReady: true });
  expect(state.designs[0].placements[0].rot).toBe(5);
});
it('renderer failure during PREPARE never dispatches a write or pretends the logo was applied', async () => {
  const old = process.env.SWAG_RENDERER_EXECUTABLE; process.env.SWAG_RENDERER_EXECUTABLE = 'missing-approved-browser';
  try { await expect(prepare()).rejects.toThrow(); } finally { process.env.SWAG_RENDERER_EXECUTABLE = old; }
  expect(assets.size).toBe(0); expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect(await configure()).toMatchObject({ artwork: 'upload', persisted: false, designReady: false });
});
it('blocks unapproved remote hosts, file paths and SVG raster substitution', async () => {
  await expect(readProductImage('https://127.0.0.1/private.png')).rejects.toThrow();
  await expect(readProductImage('/uploads/../../private.png')).rejects.toThrow();
  await expect(readProductImage('file:///private.png')).rejects.toThrow();
});
it('the renderer is a versioned bundle of the actual dashboard pipeline, not a second compositor', async () => {
  const version = await rendererVersion(); expect(version.hash).toMatch(/^[a-f0-9]{64}$/);
  const target = await withSwagRenderer(renderer => renderer.evaluate('inspect', [[{ ...products[0].toObject(), _id: String(products[0]._id) }]]));
  expect(target[0]).toMatchObject({ areaKey: 'left', supported: true });
});
it('refuses an outdated development bundle when the dashboard source manifest no longer matches', async () => {
  const original = fs.readFile.bind(fs);
  vi.spyOn(fs, 'readFile').mockImplementation((file, ...args) => String(file).replaceAll('\\', '/').endsWith('/features/swag/rendererEntry.ts')
    ? Promise.resolve(Buffer.from('isolated changed source')) : original(file, ...args));
  await expect(rendererVersion()).rejects.toMatchObject({ code: 'SWAG_RENDERER_UNAVAILABLE' });
});
