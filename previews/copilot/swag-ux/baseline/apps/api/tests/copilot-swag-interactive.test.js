import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader } from './helpers.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { configureSwagForCaller } from '../src/modules/copilot/swagDesignWorkflow.js';
import { streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
vi.mock('../src/modules/copilot/providers/openaiChatAdapter.js', async original => ({ ...await original(),
  createOpenAiClient: vi.fn(() => ({})), streamOpenAiCompletion: vi.fn(() => { throw Error('Unexpected provider call'); }),
}));
const previous = { enabled: env.EMBEDDED_COPILOT_ENABLED, collections: env.EMBEDDED_COPILOT_WRITE_COLLECTIONS, provider: env.COPILOT_AI_PROVIDER, key: env.OPENAI_API_KEY };
let app, tenant, account, conversation, product, store, ctx;
beforeAll(async () => { await connectTestDb(); app = createApp(); });
afterAll(async () => { Object.assign(env, { EMBEDDED_COPILOT_ENABLED: previous.enabled, EMBEDDED_COPILOT_WRITE_COLLECTIONS: previous.collections,
  COPILOT_AI_PROVIDER: previous.provider, OPENAI_API_KEY: previous.key }); await disconnectTestDb(); });
beforeEach(async () => {
  await clearTestDb(); env.EMBEDDED_COPILOT_ENABLED = 'true'; env.EMBEDDED_COPILOT_WRITE_COLLECTIONS = 'true';
  env.COPILOT_AI_PROVIDER = 'openai'; env.OPENAI_API_KEY = 'synthetic-only';
  tenant = await makeTenant(); account = await makeUser(tenant, 'company_admin');
  conversation = await CopilotConversation.create({ tenantId: tenant._id, userId: account.user._id });
  product = await CatalogProduct.create({ sku: 'TEST-HOODIE', name: 'Sustainable Classic Hoodie', category: 'Apparel', status: 'active', basePriceInr: 840 });
  store = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'synthetic-interactive-store', status: 'draft' });
  ctx = { authInfo: { extra: { tenantId: String(tenant._id), userId: String(account.user._id), role: 'company_admin' } }, copilotConversationId: String(conversation._id) };
  await configureSwagForCaller(ctx, { revision: 0, reset: true });
});
const endpoint = () => `/api/v1/copilot/conversations/${conversation._id}/swag`;
async function read() { const response = await request(app).get(endpoint()).set(authHeader(account.token)); expect(response.status).toBe(200); return response.body.state; }
async function change(patch) {
  const state = await read(); return request(app).post(endpoint()).set(authHeader(account.token)).send({ revision: state.revision, ...patch });
}
async function text(content) { return streamAssistantTurn({ tenantId: tenant._id, userId: account.user._id, role: 'company_admin', conversationId: String(conversation._id),
  content, toolCtx: ctx, onEvent: vi.fn() }); }

it('updates exactly the same actor-owned product selection through a click or exact natural-language name', async () => {
  await change({ name: 'swag for winter' });
  expect((await change({ addProductIds: [String(product._id)] })).status).toBe(200);
  const clicked = await read(); await change({ removeProductIds: [String(product._id)] });
  const reply = await text('Sustainable Classic Hoodie: add this');
  expect(reply.messages.at(-1).content).toContain('1 product selected');
  const typed = await read(); expect(typed.productIds).toEqual(clicked.productIds); expect(typed.name).toBe('swag for winter');
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('resolves add this from a single verified displayed card and preserves previous selections', async () => {
  await change({ name: 'Winter' });
  await CopilotConversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant', artifacts: [{ kind: 'product', product: { id: String(product._id), name: product.name } }] } } });
  await text('Add this one'); await text('Add this hoodie');
  expect((await read()).productIds).toEqual([String(product._id)]);
  await text('Remove Sustainable Classic Hoodie'); expect((await read()).productIds).toEqual([]);
});
it('returns clarification for ambiguous contextual references and never asks for internal ids', async () => {
  await change({ name: 'Winter' });
  await CopilotConversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant', artifacts: [
    { kind: 'product', product: { id: String(product._id), name: product.name } },
    { kind: 'product', product: { id: '1234567890abcdef12345678', name: 'Another product' } },
  ] } } });
  const result = await text('Add this');
  expect(result.messages.at(-1).content).toContain('intended product card');
  expect(result.messages.at(-1).content).not.toMatch(/Mongo|provide.*id/i);
  expect((await read()).productIds).toEqual([]);
});
it('persists Next and Back while retaining selections, and rejects invalid advancement', async () => {
  await change({ name: 'Winter' });
  expect((await change({ step: 'artwork' })).status).toBe(400);
  await change({ addProductIds: [String(product._id)] });
  await text('Next'); expect((await read()).step).toBe('artwork');
  await text('Go back'); expect((await read()).step).toBe('products');
  expect((await read()).productIds).toEqual([String(product._id)]);
  await text('Next'); await text('Skip artwork');
  expect(await read()).toMatchObject({ step: 'design', artwork: 'none', designReady: true });
  await text('Next'); expect((await read()).step).toBe('stores');
});
it('supports six-product pagination with unchanged filters and keeps selection across category searches', async () => {
  await change({ name: 'Winter', addProductIds: [String(product._id)] });
  for (let i = 0; i < 13; i++) await CatalogProduct.create({ sku: `HOODIE-${i}`, name: `Hoodie ${i}`, category: 'Apparel', status: 'active', basePriceInr: 400 + i });
  await CatalogProduct.create({ sku: 'MUG', name: 'Mug', category: 'Accessories', status: 'active', basePriceInr: 200 });
  const page = await request(app).get(`${endpoint()}/catalog`).query({ query: 'Hoodie', category: 'Apparel', page: 1 }).set(authHeader(account.token));
  expect(page.status).toBe(200); expect(page.body.items).toHaveLength(6); expect(page.body.pagination.total).toBe(14);
  const more = await request(app).get(`${endpoint()}/catalog`).query({ query: 'Hoodie', category: 'Apparel', page: 2 }).set(authHeader(account.token));
  expect(more.body.items).toHaveLength(6); expect(new Set([...page.body.items, ...more.body.items].map(p => p.id)).size).toBe(12);
  await request(app).get(`${endpoint()}/catalog`).query({ category: 'Accessories' }).set(authHeader(account.token));
  expect((await read()).productIds).toEqual([String(product._id)]);
});
it('rejects stale click retries without losing a successful selection or duplicating products', async () => {
  await change({ name: 'Winter' }); const state = await read();
  const input = { revision: state.revision, addProductIds: [String(product._id)] };
  const outcomes = await Promise.all([request(app).post(endpoint()).set(authHeader(account.token)).send(input), request(app).post(endpoint()).set(authHeader(account.token)).send(input)]);
  expect(outcomes.map(r => r.status).sort()).toEqual([200, 409]);
  expect((await read()).productIds).toEqual([String(product._id)]);
});
it('protects conversation ownership, role eligibility and selected store tenant boundaries', async () => {
  const other = await makeUser(tenant, 'company_admin');
  expect((await request(app).get(endpoint()).set(authHeader(other.token))).status).toBe(404);
  const manager = await makeUser(tenant, 'entity_manager');
  expect((await request(app).get(endpoint()).set(authHeader(manager.token))).status).toBe(403);
  const foreign = await makeTenant(); const foreignStore = await Shop.create({ tenantId: foreign._id, name: 'Foreign store', slug: 'foreign-interactive' });
  await change({ name: 'Winter', addProductIds: [String(product._id)], artwork: 'none' });
  expect((await change({ shopIds: [String(foreignStore._id)] })).status).toBe(404);
  await change({ step: 'stores' }); expect((await read()).storeOptions.map(s => s.id)).toEqual([String(store._id)]);
});
it('persists one review card and publishes only on explicit existing EXECUTE, with reload recovery', async () => {
  await change({ name: 'Winter', addProductIds: [String(product._id)], artwork: 'none', shopIds: [String(store._id)], step: 'review' });
  const state = await read();
  const prepared = await request(app).post(`${endpoint()}/prepare`).set(authHeader(account.token)).send({ revision: state.revision, action: 'publish' });
  expect(prepared.status).toBe(200); const card = prepared.body.artifact;
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  const loaded = await request(app).get(`/api/v1/copilot/conversations/${conversation._id}`).set(authHeader(account.token));
  expect(loaded.body.messages.flatMap(m => m.artifacts).filter(a => a.kind === 'confirmation')).toHaveLength(1);
  const input = { ...card.request, confirmationId: card.confirmationId, idempotencyKey: `swag:${card.confirmationId}` };
  const result = await request(app).post('/api/v1/copilot/writes/swag.collection/execute').set(authHeader(account.token)).send(input);
  expect(result.status).toBe(200); expect(result.body).toMatchObject({ name: 'Winter', published: true, stores: [{ name: 'AI Store', status: 'draft' }] });
  expect((await request(app).post('/api/v1/copilot/writes/swag.collection/execute').set(authHeader(account.token)).send(input)).body.id).toBe(result.body.id);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
  expect((await read()).active).toBe(false);
});
it('keeps unavailable selections repairable on reload while rejecting progression or publication', async () => {
  await change({ name: 'Winter', addProductIds: [String(product._id)] });
  await CatalogProduct.updateOne({ _id: product._id }, { status: 'archived' });
  const state = await read();
  expect(state.invalidProductIds).toEqual([String(product._id)]);
  expect(state.products[0]).toMatchObject({ eligible: false });
  expect(state.products[0].sellingPriceInr).toBeUndefined();
  expect((await change({ step: 'artwork' })).status).toBe(422);
  expect((await change({ removeProductIds: [String(product._id)] })).status).toBe(200);
  expect((await read()).productIds).toEqual([]);
});
it('refreshes saved references read-only on return and requires explicit reload after editor changes', async () => {
  const saved = await Collection.create({ tenantId: tenant._id, code: 'SYNTHETIC-EDITOR', name: 'Saved winter', artworkUrl: '/synthetic-logo.png',
    productRefs: [{ catalogProductId: product._id, name: product.name, mockupUrl: '/synthetic-saved-design.png' }] });
  await change({ collectionId: String(saved._id) }); const before = await read(); expect(before.designReady).toBe(true);
  await Collection.updateOne({ tenantId: tenant._id, _id: saved._id }, { name: 'Edited winter', 'productRefs.0.placements': [{ key: 'front', xPct: 50, yPct: 50, wPct: 25, rot: 0 }] });
  const refreshed = await read(); expect(refreshed.revision).toBe(before.revision);
  expect(refreshed).toMatchObject({ savedDesignChanged: true, designReady: false });
  expect(refreshed.designs[0].placements[0].key).toBe('front');
  expect((await change({ step: 'stores' })).status).toBe(422);
  await change({ collectionId: String(saved._id) }); expect(await read()).toMatchObject({ name: 'Edited winter', designReady: true, savedDesignChanged: false });
});
