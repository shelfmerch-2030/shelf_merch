import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';

const original = {
  COPILOT_AI_PROVIDER: env.COPILOT_AI_PROVIDER,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  EMBEDDED_COPILOT_SERPAPI_ENABLED: env.EMBEDDED_COPILOT_SERPAPI_ENABLED,
  EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH: env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH,
};
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
  Object.assign(env, {
    COPILOT_AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-only-no-network',
    EMBEDDED_COPILOT_SERPAPI_ENABLED: 'false',
    EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH: 'false',
  });
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

it.each(['Show all', 'Anything'])('returns every mixed catalog result when the user says %s', async content => {
  await seedCatalog();
  await turn('Show me products');
  const first = await turn(content);
  expect(products(first)).toHaveLength(7);
  expect(new Set(products(first).map(row => row.category)).size).toBeGreaterThan(1);
  const second = await turn('Next page');
  expect(second.content).toBe('All matching products are already shown above.');
  expect(products(second)).toHaveLength(0);
});

it('retains the price filter in complete results and recognizes a legacy product name', async () => {
  await seedCatalog();
  await CatalogProduct.create({ sku: 'DISCOVERY-LEGACY', name: 'Canvas Hoodie', category: 'Apparel', basePriceInr: 290, status: 'active' });
  const hoodies = await turn('Show me hoodies');
  expect(page(hoodies).query.query).toBe('Hoodie');
  expect(products(hoodies).map(row => row.name)).toEqual(['Canvas Hoodie']);
  const first = await turn('Show me products under ₹1,000');
  expect(products(first)).toHaveLength(8);
  expect(page(first).query).toMatchObject({ maxSellingPriceInr: 999 });
});

it('streams all 8 bags, 45 budget-matching T-shirts and 117 products without calling the model', async () => {
  const records = [
    ...Array.from({ length: 8 }, (_, i) => [`Travel bag ${i}`, 'Bags', 'Backpacks', 430]),
    ...Array.from({ length: 45 }, (_, i) => [`Cotton tee ${i}`, 'Apparel', 'T-Shirts', 799]),
    ['Over-budget tee', 'Apparel', 'T-Shirts', 800],
    ...Array.from({ length: 63 }, (_, i) => [`Catalog mug ${i}`, 'Drinkware', 'Mugs', 499]),
  ];
  await CatalogProduct.create(records.map(([name, category, childCategory, basePriceInr], i) => ({
    sku: `COMPLETE-${i}`, name, category, childCategory, basePriceInr, status: 'active',
    primaryImageUrl: `https://catalog.example.com/complete-${i}.png`,
    variants: [{ sku: `COMPLETE-V-${i}`, color: 'Black', size: 'One size', stock: i === 0 ? 0 : 2 }],
  })));
  for (const [prompt, count, filter] of [
    ['Show me bags', 8, { category: 'Bags' }],
    ['Show me T-shirts under ₹800', 45, { childCategory: 'T-Shirts', sellingPriceInr: 799 }],
    ['Explore all products', 117, {}],
  ]) {
    const reply = await turn(prompt);
    expect(reply.content).toContain(`I found ${count} matching catalog products`);
    expect(page(reply)).toMatchObject({ complete: true, pagination: { total: count } });
    expect(new Set(products(reply).map(row => row.id)).size).toBe(count);
    expect(products(reply)).toEqual(Array.from({ length: count }, () => expect.objectContaining({
      ...filter, primaryImageUrl: expect.stringContaining('https://catalog.example.com/'),
    })));
    const batches = reply.events.filter(event => event.type === 'artifacts')
      .map(event => event.artifacts.filter(row => row.kind === 'product').length).filter(Boolean);
    expect(batches.reduce((sum, size) => sum + size, 0)).toBe(count);
    expect(Math.max(...batches)).toBeLessThanOrEqual(25);
  }
  expect(model).not.toHaveBeenCalled();
});

it('passes arbitrary product keywords to the existing model-assisted search after the clarification', async () => {
  const vacuum = await CatalogProduct.create({ sku: 'DISCOVERY-VACUUM', name: 'Handheld Vacuum', category: 'Home', basePriceInr: 900, status: 'active' });
  await turn('Show me products');
  model.mockImplementationOnce(async ({ messages, systemPrompt }) => {
    expect(JSON.stringify(messages)).toContain('What type of products are you looking for?');
    expect(systemPrompt).toContain('Search immediately');
    return { finishReason: 'tool_use', toolCalls: [{ id: 'toolu_vacuum', name: 'catalog_search', arguments: '{"query":"Vacuum","limit":4}' }] };
  }).mockImplementationOnce(async ({ messages }) => {
    expect(JSON.stringify(messages)).not.toContain('Vacuum 18');
    return { finishReason: 'end_turn', text: 'I found a handheld option. Want the next page?' };
  });
  await CatalogProduct.create(Array.from({ length: 30 }, (_, index) => ({
    sku: `DISCOVERY-V-${index}`, name: `Vacuum ${index}`, category: 'Home', basePriceInr: 900, status: 'active',
  })));
  const result = await turn('Vacuum cleaners');
  expect(products(result)).toHaveLength(31);
  expect(products(result)).toContainEqual(expect.objectContaining({ id: vacuum.id }));
  expect(result.content).toBe('I found 31 matching catalog products. Here they are.');
  expect(result.events).toContainEqual({ type: 'delta', text: result.content, replace: true });
  expect(result.events.filter(event => event.type === 'delta').map(event => event.text).join('')).not.toContain('next page');
});

it('marks a result incomplete when the expanded cursor stops early', async () => {
  const [verified] = await seedCatalog();
  const originalFind = CatalogProduct.find;
  vi.spyOn(CatalogProduct, 'find')
    .mockImplementationOnce(originalFind)
    .mockImplementationOnce(() => ({
      select() { return this; },
      sort() { return this; },
      lean() { return this; },
      cursor() {
        return {
          async *[Symbol.asyncIterator]() {
            yield verified.toObject();
            throw new Error('Catalog cursor interrupted');
          },
          async close() {},
        };
      },
    }));
  const reply = await turn('Explore all products');
  expect(products(reply).map(row => row.id)).toEqual([verified.id]);
  expect(page(reply)).toMatchObject({ complete: false, pagination: { total: 1 } });
  expect(reply.content).toMatch(/these results are incomplete/i);
  expect(model).not.toHaveBeenCalled();
});

it('combines and deduplicates multiple filtered searches from the same model round', async () => {
  await seedCatalog();
  model.mockResolvedValueOnce({ finishReason: 'tool_use', toolCalls: [
    { id: 'toolu_bags', name: 'catalog_search', arguments: '{"category":"Bags","limit":1}' },
    { id: 'toolu_backpacks', name: 'catalog_search', arguments: '{"query":"Backpack","limit":1}' },
    { id: 'toolu_drinkware', name: 'catalog_search', arguments: '{"category":"Drinkware","maxSellingPriceInr":499,"limit":1}' },
  ] }).mockResolvedValueOnce({ finishReason: 'end_turn', text: 'I found your matches.' });
  const reply = await turn('Show backpacks and drinkware under ₹500');
  expect(products(reply).map(row => row.name)).toEqual(['Black Backpack', 'Ceramic Mug']);
  expect(reply.content).toBe('I found 2 matching catalog products. Here they are.');
  expect(page(reply).queries).toHaveLength(3);
});

it('returns only the requested highest-priced products', async () => {
  await seedCatalog();
  model.mockResolvedValueOnce({
    finishReason: 'tool_use',
    toolCalls: [{ id: 'toolu_top', name: 'catalog_search', arguments: '{"limit":10}' }],
  }).mockResolvedValueOnce({ finishReason: 'end_turn', text: 'Here are six products.' });
  const reply = await turn('Give me the top 3 products of shelfmerch having highest price');
  expect(products(reply).map(row => [row.name, row.sellingPriceInr])).toEqual([
    ['Team Polo at Limit', 800],
    ['Team Polo', 799],
    ['Workshop T-shirt', 510],
  ]);
  expect(reply.content).toBe('Here are the 3 highest-priced catalog products.');
  expect(page(reply).pagination.total).toBe(3);
});

it('finds tees stored as Crew Neck or Oversized when the user asks for T-shirts', async () => {
  await CatalogProduct.create([
    { sku: 'TEE-CREW', name: 'Classic Crew Neck', category: 'Apparel', subcategory: 'Apparel', childCategory: 'Crew Neck', basePriceInr: 400, status: 'active' },
    { sku: 'TEE-OVER', name: 'Over Size Crew Neck', category: 'Apparel', subcategory: 'Apparel', childCategory: 'Oversized', basePriceInr: 450, status: 'active' },
    { sku: 'TEE-POLO', name: 'Corporate Polo', category: 'Apparel', subcategory: 'Apparel', childCategory: 'Polo', basePriceInr: 500, status: 'active' },
    { sku: 'TEE-CAP', name: 'Customized Cap', category: 'Apparel', subcategory: 'Apparel', childCategory: 'Caps', basePriceInr: 200, status: 'active' },
  ]);
  const message = await turn('Show me T-shirts');
  expect(products(message).map(row => row.name).sort()).toEqual(['Classic Crew Neck', 'Over Size Crew Neck']);
});

it('returns an empty match instead of dropping a supplied budget', async () => {
  await seedCatalog();
  const none = await turn('Show me polo T-shirts under ₹300');
  expect(none.content).toMatch(/couldn’t find any catalog products that match/);
  expect(products(none)).toEqual([]);
  expect(page(none).query.maxSellingPriceInr).toBe(299);
});
