import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';

const original = { COPILOT_AI_PROVIDER: env.COPILOT_AI_PROVIDER, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY };
let turn, model;
beforeAll(connectTestDb);
afterAll(async () => {
  vi.restoreAllMocks();
  Object.assign(env, original);
  await disconnectTestDb();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await clearTestDb();
  Object.assign(env, { COPILOT_AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-only-no-network' });
  model = vi.spyOn(adapter, 'streamAnthropicCompletion').mockRejectedValue(new Error('Unexpected model call'));
  const tenant = await makeTenant();
  const { user } = await makeUser(tenant, 'company_admin');
  const scope = { tenantId: tenant._id, userId: user._id, role: 'company_admin' };
  const conversation = await createConversation(scope);
  const toolCtx = buildCopilotToolCtx({ tenantId: scope.tenantId, user: { userId: scope.userId, role: scope.role } });
  turn = async content => {
    const events = [];
    await streamAssistantTurn({ ...scope, conversationId: conversation.id, toolCtx, content, mode: 'chat', onEvent: event => events.push(event) });
    const saved = await CopilotConversation.findById(conversation.id).lean();
    return { ...saved.messages.at(-1), events };
  };
});

async function seedCatalog() {
  return CatalogProduct.create([
    ['Black Backpack', 'Bags', 'Backpacks', 450], ['Ceramic Mug', 'Drinkware', 'Mugs', 499],
    ['Cotton Crew Neck', 'Apparel', 'T-Shirts', 350], ['Team Polo', 'Apparel', 'Polo Shirts', 799],
    ['Team Polo at Limit', 'Apparel', 'Polo Shirts', 800], ['Travel Bottle', 'Drinkware', 'Bottles', 500],
    ['Workshop T-shirt', 'Apparel', 'T-Shirts', 510],
  ].map(([name, category, childCategory, basePriceInr], index) => ({
    sku: `DISCOVERY-${index}`, name, category, childCategory, basePriceInr, status: 'active',
    primaryImageUrl: `https://catalog.example.com/${index}.png`,
  })));
}
const products = message => message.artifacts.flatMap(row => row.kind === 'product' ? [row.product] : []);
const page = message => message.artifacts.find(row => row.kind === 'catalog_page').catalog;

it.each(['Show me products', 'can u show me products ?', 'I want to see the products', 'What products do you have?'])('asks one question and runs no search for %s', async content => {
  await seedCatalog();
  const read = vi.spyOn(CatalogProduct, 'find');
  const message = await turn(content);
  expect(message.content).toBe('Sure! What type of products are you looking for?');
  expect(message.artifacts).toEqual([]);
  expect(message.events.map(event => event.type)).toEqual(['delta', 'done']);
  expect(read).not.toHaveBeenCalled();
  expect(model).not.toHaveBeenCalled();
});

it.each(['Show me T-shirts', 'T-shirts', 'Backpacks'])('uses real catalog matches for %s without asking again', async content => {
  const seeded = await seedCatalog();
  if (!content.startsWith('Show')) await turn('Show me products');
  const message = await turn(content);
  const category = content === 'Backpacks' ? 'Backpacks' : 'T-Shirts';
  expect(page(message).query.category).toBe(category);
  expect(products(message)).toEqual(seeded.filter(row => row.childCategory === category).map(row => expect.objectContaining({
    id: row.id, name: row.name, sellingPriceInr: row.basePriceInr, primaryImageUrl: row.primaryImageUrl,
  })));
  expect(model).not.toHaveBeenCalled();
});

it('uses GST-inclusive upper limits for a product type and for a mixed budget search', async () => {
  await seedCatalog();
  const polos = await turn('Show me polo T-shirts under ₹800');
  expect(page(polos).query).toMatchObject({ category: 'Polo Shirts', maxSellingPriceInr: 799 });
  expect(products(polos).map(row => row.name)).toEqual(['Team Polo']);
  const budget = await turn('Show me products under ₹500');
  expect(page(budget).query).toMatchObject({ maxSellingPriceInr: 499 });
  expect(page(budget).query.category).toBeUndefined();
  expect(products(budget).map(row => row.name)).toEqual(['Black Backpack', 'Ceramic Mug', 'Cotton Crew Neck']);
});

it.each(['Show all', 'Anything'])('paginates mixed catalog results when the user says %s', async content => {
  await seedCatalog();
  await turn('Show me products');
  const first = await turn(content);
  expect(products(first)).toHaveLength(4);
  expect(new Set(products(first).map(row => row.category)).size).toBeGreaterThan(1);
  const second = await turn('Next page');
  expect(page(second).pagination).toMatchObject({ page: 2, limit: 4, total: 7 });
  expect(products(second)).toHaveLength(3);
  expect(products(second).some(product => products(first).some(previous => previous.id === product.id))).toBe(false);
});

it('retains the price filter when paging and recognizes a legacy product name', async () => {
  await seedCatalog();
  await CatalogProduct.create({ sku: 'DISCOVERY-LEGACY', name: 'Canvas Hoodie', category: 'Apparel', basePriceInr: 290, status: 'active' });
  const hoodies = await turn('Show me hoodies');
  expect(page(hoodies).query.query).toBe('Hoodie');
  expect(products(hoodies).map(row => row.name)).toEqual(['Canvas Hoodie']);
  const first = await turn('Show me products under ₹1,000');
  expect(products(first)).toHaveLength(4);
  const second = await turn('Next page');
  expect(page(second).query).toMatchObject({ maxSellingPriceInr: 999, page: 2 });
});

it('passes arbitrary product keywords to the existing model-assisted search after the clarification', async () => {
  const vacuum = await CatalogProduct.create({ sku: 'DISCOVERY-VACUUM', name: 'Handheld Vacuum', category: 'Home', basePriceInr: 900, status: 'active' });
  await turn('Show me products');
  model.mockImplementationOnce(async ({ messages, systemPrompt }) => {
    expect(JSON.stringify(messages)).toContain('What type of products are you looking for?');
    expect(systemPrompt).toContain('Search immediately');
    return { finishReason: 'tool_use', toolCalls: [{ id: 'toolu_vacuum', name: 'catalog_search', arguments: '{"query":"Vacuum","limit":4}' }] };
  }).mockResolvedValueOnce({ finishReason: 'end_turn', text: 'I found a handheld option.' });
  expect(products(await turn('Vacuum cleaners'))).toEqual([expect.objectContaining({ id: vacuum.id })]);
});

it('returns an empty match instead of dropping a supplied budget', async () => {
  await seedCatalog();
  const none = await turn('Show me polo T-shirts under ₹300');
  expect(none.content).toMatch(/couldn’t find any catalog products that match/);
  expect(products(none)).toEqual([]);
  expect(page(none).query.maxSellingPriceInr).toBe(299);
});
