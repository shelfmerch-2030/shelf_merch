import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { streamAssistantTurn, getConversation } from '../src/modules/copilot/copilotChat.service.js';
import { executeCopilotWrite, cancelCopilotWrite } from '../src/modules/copilot/copilotWrites.service.js';
import { streamOpenAiCompletion } from '../src/modules/copilot/providers/openaiChatAdapter.js';
import { streamAnthropicCompletion } from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { listOpenAiToolsForRole, runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { configureSwagForCaller } from '../src/modules/copilot/swagDesignWorkflow.js';

vi.mock('../src/modules/copilot/providers/openaiChatAdapter.js', async original => ({ ...await original(),
  createOpenAiClient: vi.fn(() => ({})), streamOpenAiCompletion: vi.fn(),
}));
vi.mock('../src/modules/copilot/providers/anthropicChatAdapter.js', async original => ({ ...await original(),
  createAnthropicClient: vi.fn(() => ({})), streamAnthropicCompletion: vi.fn(),
}));
const previous = { provider: env.COPILOT_AI_PROVIDER, key: env.OPENAI_API_KEY, anthropicKey: env.ANTHROPIC_API_KEY, collections: env.EMBEDDED_COPILOT_WRITE_COLLECTIONS };
beforeAll(connectTestDb);
afterAll(async () => { Object.assign(env, { COPILOT_AI_PROVIDER: previous.provider, OPENAI_API_KEY: previous.key,
  ANTHROPIC_API_KEY: previous.anthropicKey, EMBEDDED_COPILOT_WRITE_COLLECTIONS: previous.collections }); await disconnectTestDb(); });
let tenant, user, conversation, ctx, fixture;
beforeEach(async () => {
  await clearTestDb(); vi.mocked(streamOpenAiCompletion).mockReset();
  vi.mocked(streamAnthropicCompletion).mockReset();
  env.COPILOT_AI_PROVIDER = 'openai'; env.OPENAI_API_KEY = 'synthetic-key-no-provider-calls'; env.EMBEDDED_COPILOT_WRITE_COLLECTIONS = 'true';
  tenant = await makeTenant(); ({ user } = await makeUser(tenant, 'company_admin'));
  conversation = await CopilotConversation.create({ tenantId: tenant._id, userId: user._id });
  ctx = { authInfo: { extra: { tenantId: String(tenant._id), userId: String(user._id), role: 'company_admin' } } };
  fixture = { tenantId: tenant._id, userId: user._id, role: 'company_admin', conversationId: String(conversation._id), toolCtx: ctx };
});
function answer(text) { return { text, toolCalls: [], finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } }; }
function tool(name, args, response) {
  vi.mocked(streamOpenAiCompletion).mockReset();
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce({ text: '', finishReason: 'tool_calls', toolCalls: [
    { id: `call-${Date.now()}`, name, arguments: JSON.stringify(args) },
  ], usage: {} }).mockResolvedValueOnce(answer(response));
}
async function turn(content) { return streamAssistantTurn({ ...fixture, content, onEvent: vi.fn() }); }
async function nameCollection() {
  await turn('I want to design swag');
  tool('swag_configure', { revision: 1, name: 'Team Spirit Essentials' }, '');
  await turn('Team Spirit Essentials');
  vi.mocked(streamOpenAiCompletion).mockClear();
  return getConversation(fixture);
}
function req() { return { tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant' } }; }

it.each(['Select AI Store', 'AI Store', 'Publish to AI Store'])('selects an authorized store through %s into the same conversation state as the store controls', async content => {
  const product = await CatalogProduct.create({ sku: 'NAMED-STORE-POLO', name: 'Polo', status: 'active', basePriceInr: 500 });
  const shop = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'named-store', status: 'draft' });
  const scoped = { ...ctx, copilotConversationId: String(conversation._id) };
  const selected = await configureSwagForCaller(scoped, { revision: 0, name: 'Welcome Kit', addProductIds: [String(product._id)], artwork: 'none', step: 'stores' });
  const button = await configureSwagForCaller(scoped, { revision: selected.revision, shopIds: [String(shop._id)] });
  await configureSwagForCaller(scoped, { revision: button.revision, shopIds: [] });
  const response = await turn(content);
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
  expect(first.messages.at(-1).content).toContain('Named upfront');
  expect((await CopilotConversation.findById(conversation._id)).swag.name).toBe('Named upfront');
});
it.each(['Yes', 'Yeah', 'Sure', 'Okay, show me', 'Sure, show me', 'Show products'])('browses once in response to %s without changing the collection', async suggestion => {
  const product = await CatalogProduct.create({ sku: 'SUGGESTED-POLO', name: 'Suggested Polo', status: 'active', basePriceInr: 500 });
  const initial = await nameCollection();
  expect(initial.messages.at(-1).artifacts.some(artifact => artifact.kind === 'product')).toBe(false);

  await turn(suggestion);

  const reloaded = await getConversation(fixture);
  expect(reloaded.swag).toMatchObject({ name: initial.swag.name, revision: initial.swag.revision, step: 'products' });
  const messages = reloaded.messages.slice(initial.messages.length);
  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatchObject({ role: 'user', content: suggestion });
  expect(messages[1]).toMatchObject({ role: 'assistant', content: 'Here are some products you can customize.' });
  const products = messages[1].artifacts.filter(artifact => artifact.kind === 'product');
  expect(products).toEqual([expect.objectContaining({ product: expect.objectContaining({ id: String(product._id) }) })]);
  expect(streamOpenAiCompletion).not.toHaveBeenCalled();
});
it.each(['Not now', 'Not yet'])('acknowledges %s without browsing, renaming, or leaving the product stage', async decline => {
  const initial = await nameCollection();
  const result = await turn(decline);
  expect(result.messages.at(-1).content).toMatch(/when you’re ready/);
  expect(result.messages.at(-1).artifacts.map(artifact => artifact.kind)).toEqual(['swag_step']);
  expect((await getConversation(fixture)).swag).toMatchObject({ name: initial.swag.name, revision: initial.swag.revision, step: 'products' });
  expect(streamOpenAiCompletion).not.toHaveBeenCalled();

  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(answer('What would you like to do?'));
  const unrelatedAffirmative = await turn('Yes');
  expect(unrelatedAffirmative.messages.at(-1).artifacts.some(artifact => artifact.kind === 'product')).toBe(false);
  expect(streamOpenAiCompletion).toHaveBeenCalledTimes(1);
});
it.each([
  ['Show me T-shirts', { query: 'T-shirt' }, 'Cotton T-shirt', 'Canvas Bag', 'Apparel', 'Bags'],
  ['I want hoodies', { query: 'Hoodie' }, 'Fleece Hoodie', 'Canvas Bag', 'Apparel', 'Bags'],
  ['Show all apparel', { category: 'Apparel' }, 'Fleece Hoodie', 'Canvas Bag', 'Apparel', 'Bags'],
  ['Show polos under ₹800', { query: 'Polo', maxSellingPriceInr: 799 }, 'Team Polo', 'Premium Polo', 'Apparel', 'Apparel'],
  ['Find polos under ₹800', { query: 'Polo', maxSellingPriceInr: 799 }, 'Team Polo', 'Premium Polo', 'Apparel', 'Apparel'],
  ['Do you have bags?', { query: 'Bag' }, 'Canvas Bag', 'Team Polo', 'Bags', 'Apparel'],
])('uses the existing catalog filters for %s', async (request, filters, name, otherName, category, otherCategory) => {
  const [product] = await CatalogProduct.create([
    { sku: 'REQUEST-MATCH', name, category, status: 'active', basePriceInr: 799, gstRate: 18 },
    { sku: 'REQUEST-EXCLUDED', name: otherName, category: otherCategory, status: 'active', basePriceInr: 800, gstRate: 18 },
  ]);
  await nameCollection();
  env.COPILOT_AI_PROVIDER = 'anthropic';
  env.ANTHROPIC_API_KEY = 'synthetic-key-no-provider-calls';
  const modelFilters = filters.maxSellingPriceInr === undefined ? filters : { ...filters, maxSellingPriceInr: 800 };
  vi.mocked(streamAnthropicCompletion).mockResolvedValueOnce({
    text: '', finishReason: 'tool_use', usage: {},
    toolCalls: [{ id: 'catalog', name: 'catalog_search', arguments: JSON.stringify(modelFilters) }],
  }).mockResolvedValueOnce({ ...answer('Here is a matching product.'), finishReason: 'end_turn' });

  const result = await turn(request);
  const artifacts = result.messages.at(-1).artifacts;
  expect(artifacts.filter(artifact => artifact.kind === 'product')).toEqual([
    expect.objectContaining({ product: expect.objectContaining({ id: String(product._id), sellingPriceInr: 799 }) }),
  ]);
  expect(artifacts).toContainEqual(expect.objectContaining({ kind: 'catalog_page', catalog: expect.objectContaining({ query: expect.objectContaining(filters) }) }));
  expect((await getConversation(fixture)).swag.name).toBe('Team Spirit Essentials');
  expect(streamAnthropicCompletion).toHaveBeenCalledTimes(2);
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

it.each(['summer', 'winter'])('keeps original %s intent across naming and retrieves verified relevant cards in the same turn', async season => {
  const polo = await CatalogProduct.create({ sku: 'SUMMER-POLO', name: 'Lightweight Polo', category: 'Apparel', status: 'active', basePriceInr: 650 });
  tool('swag_configure', { revision: 0, reset: true }, 'What should we call your collection?');
  await turn(`I want to design ${season} swag for men.`);
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce({ text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [
    { id: 'name', name: 'swag_configure', arguments: JSON.stringify({ revision: 1, name: 'Team Essentials' }) },
  ] }).mockResolvedValueOnce({ text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [
    { id: 'catalog', name: 'catalog_search', arguments: JSON.stringify({ query: 'Polo', category: 'Apparel', limit: 4 }) },
  ] }).mockResolvedValueOnce(answer(season === 'winter' ? '' : 'Here are lightweight polos from the catalog.'));
  const named = await turn('Team Essentials');
  expect(JSON.stringify(vi.mocked(streamOpenAiCompletion).mock.calls.at(-1))).toContain(`${season} swag for men`);
  expect(named.messages.at(-1).content).not.toContain('Would you like me to show you some products?');
  expect(named.messages.at(-1).artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'product', product: expect.objectContaining({ id: String(polo._id), name: 'Lightweight Polo' }) })]));
  expect((await CopilotConversation.findById(conversation._id)).swag.name).toBe('Team Essentials');
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('lets the model resolve group and ordinal references into verified identities instead of treating them as names', async () => {
  const products = await CatalogProduct.create([
    { sku: 'GROUP-ONE', name: 'Summer Polo', status: 'active', basePriceInr: 500 },
    { sku: 'GROUP-TWO', name: 'Team Polo', status: 'active', basePriceInr: 600 },
  ]);
  await configureSwagForCaller({ ...ctx, copilotConversationId: String(conversation._id) }, { revision: 0, name: 'Summer' });
  tool('catalog_search', { query: 'Polo' }, 'Two verified polos.'); await turn('Show polos');
  tool('swag_configure', { revision: 1, addProductNames: products.map(p => p.name) }, 'Added both polos.');
  await turn('Add both polos');
  expect((await CopilotConversation.findById(conversation._id)).swag.productIds).toEqual(products.map(p => String(p._id)));
  tool('swag_configure', { revision: 2, removeProductNames: [products[1].name] }, 'Removed the second polo.');
  await turn('Remove the second one');
  expect((await CopilotConversation.findById(conversation._id)).swag.productIds).toEqual([String(products[0]._id)]);
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});
it('treats looks good and publish it as navigation to authorized stores, never execution', async () => {
  const product = await CatalogProduct.create({ sku: 'NATURAL-REVIEW', name: 'Polo', status: 'active', basePriceInr: 500 });
  await configureSwagForCaller({ ...ctx, copilotConversationId: String(conversation._id) }, { revision: 0, name: 'Summer', addProductIds: [String(product._id)], artwork: 'none', step: 'design' });
  const response = await turn('Looks good. Publish it.');
  expect(response.messages.at(-1).content).toMatch(/Which store/);
  expect((await CopilotConversation.findById(conversation._id)).swag.step).toBe('stores');
  expect(streamOpenAiCompletion).not.toHaveBeenCalled();
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
});

it('acknowledges an ordinary name even when the provider returns no prose, and waits for explicit browsing', async () => {
  await turn('I want to design swag.');
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce({ text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'ordinary-name', name: 'swag_configure', arguments: JSON.stringify({ revision: 1, name: 'emp collection' }) }] });
  const named = await turn('emp collection');
  expect(named.messages.at(-1).content).toBe("I've named your collection **emp collection**. Would you like me to show you some products?");
  expect(named.messages.at(-1).artifacts.some(a => a.kind === 'product')).toBe(false);
  await CatalogProduct.create({ sku: 'EXPLICIT-BROWSE', name: 'Team Polo', status: 'active', basePriceInr: 500 });
  vi.mocked(streamOpenAiCompletion).mockClear();
  const browsed = await turn('Yes');
  expect(browsed.messages.at(-1).artifacts.some(a => a.kind === 'product')).toBe(true);
  expect(streamOpenAiCompletion).not.toHaveBeenCalled();
});
it('a delayed model tool cannot reorder the user turn or revive an older selection', async () => {
  const scoped = { ...ctx, copilotConversationId: String(conversation._id) };
  await configureSwagForCaller(scoped, { revision: 0, name: 'Original' });
  let release; const gate = new Promise(resolve => { release = resolve; });
  vi.mocked(streamOpenAiCompletion).mockImplementationOnce(async () => { await gate; return { text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'slow', name: 'catalog_search', arguments: JSON.stringify({ query: 'Polo' }) }] }; }).mockResolvedValueOnce(answer('Old recommendations.'));
  const pending = turn('Show polos'); await vi.waitFor(() => expect(streamOpenAiCompletion).toHaveBeenCalled());
  await configureSwagForCaller({ ...scoped, swagTimeline: true }, { revision: 1, name: 'New selection' });
  release(); await pending;
  const saved = await CopilotConversation.findById(conversation._id);
  expect(saved.messages.findIndex(m => m.role === 'user' && m.content === 'Show polos')).toBeLessThan(saved.messages.findIndex(m => m.uiEventId === `swag:state:${conversation._id}:2`));
  expect(saved.messages.at(-1).content).toContain('New selection');
  expect(saved.messages.at(-1).uiEventId).toBe(`swag:state:${conversation._id}:2`);
  expect(saved.messages.some(m => m.content === 'Old recommendations.')).toBe(false);
  expect(saved.messages.at(-1).artifacts.find(a => a.kind === 'swag_step').swag.revision).toBe(2);
  expect(saved.messages.at(-1).artifacts.some(a => a.kind === 'product')).toBe(false);
  expect(saved.swag.name).toBe('New selection');
});
