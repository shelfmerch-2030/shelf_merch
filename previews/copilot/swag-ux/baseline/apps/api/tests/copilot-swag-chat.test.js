import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { streamAssistantTurn, getConversation } from '../src/modules/copilot/copilotChat.service.js';
import { executeCopilotWrite, cancelCopilotWrite } from '../src/modules/copilot/copilotWrites.service.js';
import { streamOpenAiCompletion } from '../src/modules/copilot/providers/openaiChatAdapter.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { listOpenAiToolsForRole, runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { configureSwagForCaller } from '../src/modules/copilot/swagDesignWorkflow.js';

vi.mock('../src/modules/copilot/providers/openaiChatAdapter.js', async original => ({ ...await original(),
  createOpenAiClient: vi.fn(() => ({})), streamOpenAiCompletion: vi.fn(),
}));
const previous = { provider: env.COPILOT_AI_PROVIDER, key: env.OPENAI_API_KEY, collections: env.EMBEDDED_COPILOT_WRITE_COLLECTIONS };
beforeAll(connectTestDb);
afterAll(async () => { Object.assign(env, { COPILOT_AI_PROVIDER: previous.provider, OPENAI_API_KEY: previous.key,
  EMBEDDED_COPILOT_WRITE_COLLECTIONS: previous.collections }); await disconnectTestDb(); });
let tenant, user, conversation, ctx, fixture;
beforeEach(async () => {
  await clearTestDb(); vi.mocked(streamOpenAiCompletion).mockReset();
  env.COPILOT_AI_PROVIDER = 'openai'; env.OPENAI_API_KEY = 'synthetic-key-no-provider-calls'; env.EMBEDDED_COPILOT_WRITE_COLLECTIONS = 'true';
  tenant = await makeTenant(); ({ user } = await makeUser(tenant, 'company_admin'));
  conversation = await CopilotConversation.create({ tenantId: tenant._id, userId: user._id });
  ctx = { authInfo: { extra: { tenantId: String(tenant._id), userId: String(user._id), role: 'company_admin' } } };
  fixture = { tenantId: tenant._id, userId: user._id, role: 'company_admin', conversationId: String(conversation._id), toolCtx: ctx };
});
function answer(text) { return { text, toolCalls: [], finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } }; }
function tool(name, args, response) {
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce({ text: '', finishReason: 'tool_calls', toolCalls: [
    { id: `call-${Date.now()}`, name, arguments: JSON.stringify(args) },
  ], usage: {} }).mockResolvedValueOnce(answer(response));
}
async function turn(content) { return streamAssistantTurn({ ...fixture, content, onEvent: vi.fn() }); }
function req() { return { tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant' } }; }

it('selects an authorized store by name into the same conversation state as the store controls', async () => {
  const product = await CatalogProduct.create({ sku: 'NAMED-STORE-POLO', name: 'Polo', status: 'active', basePriceInr: 500 });
  const shop = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'named-store', status: 'draft' });
  const scoped = { ...ctx, copilotConversationId: String(conversation._id) };
  const selected = await configureSwagForCaller(scoped, { revision: 0, name: 'Welcome Kit', addProductIds: [String(product._id)], artwork: 'none', step: 'stores' });
  const button = await configureSwagForCaller(scoped, { revision: selected.revision, shopIds: [String(shop._id)] });
  await configureSwagForCaller(scoped, { revision: button.revision, shopIds: [] });
  const response = await turn('Select AI Store');
  expect(response.messages.at(-1).content).toMatch(/Store selected/);
  expect((await CopilotConversation.findById(conversation._id)).swag.shopIds).toEqual(button.shopIds);
  expect(streamOpenAiCompletion).not.toHaveBeenCalled();
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it.each(['ambiguous', 'foreign'])('clarifies %s store names without selecting an unapproved store', async mode => {
  const product = await CatalogProduct.create({ sku: 'STORE-NAME-GUARD', name: 'Polo', status: 'active', basePriceInr: 500 });
  const storeTenant = mode === 'foreign' ? await makeTenant() : tenant;
  await Shop.create({ tenantId: storeTenant._id, name: 'AI Store', slug: 'store-name-one' });
  if (mode === 'ambiguous') await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'store-name-two' });
  await configureSwagForCaller({ ...ctx, copilotConversationId: String(conversation._id) }, {
    revision: 0, name: 'Welcome Kit', addProductIds: [String(product._id)], artwork: 'none', step: 'stores',
  });
  const response = await turn('Select AI Store');
  expect(response.messages.at(-1).content).toMatch(/Choose the intended store/);
  expect((await CopilotConversation.findById(conversation._id)).swag.shopIds).toEqual([]);
  expect(streamOpenAiCompletion).not.toHaveBeenCalled();
});
it('does not hijack wallet instructions while the Swag store-selection step is active', async () => {
  const product = await CatalogProduct.create({ sku: 'STORE-WALLET-GUARD', name: 'Polo', status: 'active', basePriceInr: 500 });
  await configureSwagForCaller({ ...ctx, copilotConversationId: String(conversation._id) }, {
    revision: 0, name: 'Welcome Kit', addProductIds: [String(product._id)], artwork: 'none', step: 'stores',
  });
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(answer('Continuing with the existing wallet workflow.'));
  const response = await turn('Use wallet');
  expect(response.messages.at(-1).content).toBe('Continuing with the existing wallet workflow.');
  expect(streamOpenAiCompletion).toHaveBeenCalledTimes(1);
  expect((await CopilotConversation.findById(conversation._id)).swag.shopIds).toEqual([]);
});

it('asks for only the missing collection name without a model call or business record', async () => {
  const first = await turn('I want to design swag.');
  expect(first.messages.at(-1).content).toBe('What would you like to name your swag collection?');
  expect(streamOpenAiCompletion).not.toHaveBeenCalled();
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  expect((await CopilotConversation.findById(conversation._id)).swag.revision).toBe(1);
});
it('does not throw away an already supplied collection name in an explicit design request', async () => {
  tool('swag_configure', { revision: 0, name: 'Named upfront' }, 'Let’s select products.');
  const first = await turn('Design swag called Named upfront');
  expect(first.messages.at(-1).content).toBe('Let’s select products.');
  expect((await CopilotConversation.findById(conversation._id)).swag.name).toBe('Named upfront');
});
it('runs the named-product-optional-artwork-store lifecycle through real tools and one confirmed publish', async () => {
  const product = await CatalogProduct.create({ sku: 'CHAT-POLO', name: 'ActiveDry Polo', status: 'active', basePriceInr: 500 });
  const shop = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'synthetic-chat-store', status: 'live' });
  await turn('I want to design swag');
  tool('swag_configure', { revision: 1, name: 'New Employee Swag' }, 'Your collection will be called New Employee Swag. Let’s select products.');
  await turn('New Employee Swag');
  tool('catalog_get_product', { productId: String(product._id) }, 'Here’s the polo.');
  const catalog = await turn('Show ActiveDry Polo');
  expect(catalog.messages.at(-1).artifacts[0]).toMatchObject({ kind: 'product', product: { id: String(product._id), sellingPriceInr: 500 } });
  await turn('Add ActiveDry Polo');
  expect((await CopilotConversation.findById(conversation._id)).swag.productIds).toEqual([String(product._id)]);
  tool('swag_configure', { revision: 3, artwork: 'none' }, 'Which store would you like to publish this collection to?');
  await turn('Continue without artwork');
  // Simulate a reload between steps; no conversation or collection is recreated.
  expect((await getConversation(fixture)).swag.name).toBe('New Employee Swag');
  tool('swag_configure', { revision: 4, shopIds: [String(shop._id)] }, 'AI Store selected.');
  await turn('AI Store');
  tool('swag_prepare_collection', { conversationId: String(conversation._id), revision: 5, action: 'publish' }, 'Review and confirm publication.');
  const reviewed = await turn('Continue to publishing');
  const cards = reviewed.messages.flatMap(m => m.artifacts).filter(a => a.kind === 'confirmation');
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ operation: 'swag.collection', status: 'pending', preview: { name: 'New Employee Swag', action: 'publish' } });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  const result = await executeCopilotWrite(req(), 'swag.collection', { ...cards[0].request,
    confirmationId: cards[0].confirmationId, idempotencyKey: `swag:${cards[0].confirmationId}` });
  expect(result).toMatchObject({ published: true, productCount: 1, stores: [{ id: String(shop._id), name: 'AI Store' }] });
  const loaded = await getConversation(fixture);
  expect(loaded.messages.flatMap(m => m.artifacts).filter(a => a.kind === 'success')).toHaveLength(1);
  expect(loaded.messages.flatMap(m => m.artifacts).filter(a => a.kind === 'confirmation' && a.status === 'pending')).toHaveLength(0);
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(answer('Your New Employee Swag collection has been published to AI Store.'));
  await turn('okay');
  const transcript = JSON.stringify(vi.mocked(streamOpenAiCompletion).mock.calls.at(-1));
  expect(transcript).toContain('Backend-confirmed WRITE state');
  expect(vi.mocked(streamOpenAiCompletion).mock.calls.at(-1)[0].messages.some(message =>
    typeof message.content === 'string' && message.content.includes('"published":true'))).toBe(true);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
});
it('cancelled preparations remain cancelled after reload and never become collections', async () => {
  const product = await CatalogProduct.create({ sku: 'CANCEL-MUG', name: 'Mug', status: 'active', basePriceInr: 300 });
  tool('swag_configure', { revision: 0, name: 'Save later', addProductIds: [String(product._id)], artwork: 'none' }, 'Ready to save.');
  await turn('I want to save a design for later');
  tool('swag_prepare_collection', { conversationId: String(conversation._id), revision: 1, action: 'save' }, 'Confirm saving only.');
  const prepared = await turn('Save it');
  const card = prepared.messages.at(-1).artifacts[0];
  await cancelCopilotWrite(req(), 'swag.collection', { confirmationId: card.confirmationId });
  const loaded = await getConversation(fixture);
  expect(loaded.messages.at(-1).artifacts[0]).toMatchObject({ status: 'cancelled' });
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('configuration is actor/conversation-scoped and execution tools remain hidden and forbidden to the model', async () => {
  const another = await makeUser(tenant, 'company_admin');
  const foreignCtx = { ...ctx, authInfo: { extra: { ...ctx.authInfo.extra, userId: String(another.user._id) } }, copilotConversationId: String(conversation._id) };
  await expect(configureSwagForCaller(foreignCtx, {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const names = listOpenAiToolsForRole('company_admin').map(t => t.function.name);
  expect(names).toContain('swag_configure'); expect(names).toContain('swag_prepare_collection'); expect(names).not.toContain('swag_execute_collection');
  expect(listOpenAiToolsForRole('entity_manager').map(t => t.function.name)).not.toContain('swag_configure');
  await expect(runCopilotTool('swag_execute_collection', ctx, {}, 'company_admin')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  env.EMBEDDED_COPILOT_WRITE_COLLECTIONS = 'false';
  expect(listOpenAiToolsForRole('company_admin').map(t => t.function.name)).not.toEqual(expect.arrayContaining(['swag_configure', 'swag_prepare_collection']));
  await expect(runCopilotTool('swag_configure', ctx, {}, 'company_admin')).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it.each(['Add an employee', 'Remove funds from the budget'])('does not hijack another workflow with an active swag selection: %s', async content => {
  await configureSwagForCaller({ ...ctx, copilotConversationId: String(conversation._id) }, { revision: 0, name: 'Winter' });
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(answer('Continuing with the requested existing workflow.'));
  const response = await turn(content);
  expect(streamOpenAiCompletion).toHaveBeenCalledTimes(1);
  expect(response.messages.at(-1).content).toBe('Continuing with the requested existing workflow.');
  expect((await CopilotConversation.findById(conversation._id)).swag.productIds).toEqual([]);
});
