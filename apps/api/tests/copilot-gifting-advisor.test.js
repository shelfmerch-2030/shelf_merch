import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader } from './helpers.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CopilotAudit } from '../src/modules/copilot/copilotAudit.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { isGiftingAdvisorRequest, requestedAdvice, updateAdvisorBrief, buildAdvisorGroups, advisorBriefSchema, scoreGift } from '../src/modules/copilot/giftingAdvisor.js';
import { discoverAdvisorCandidates, readAdvisorCatalogPage } from '../src/modules/copilot/giftingCatalogRead.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';

const original = { enabled: env.EMBEDDED_COPILOT_ENABLED, provider: env.COPILOT_AI_PROVIDER, key: env.ANTHROPIC_API_KEY };
let app, plans, model;
const toolResponse = (name, value) => ({ toolCalls: [{ id: 'call', name, arguments: JSON.stringify(value) }], usage: { promptTokens: 100, completionTokens: 60 } });
beforeAll(async () => { await connectTestDb(); app = createApp(); });
afterAll(async () => { Object.assign(env, { EMBEDDED_COPILOT_ENABLED: original.enabled, COPILOT_AI_PROVIDER: original.provider, ANTHROPIC_API_KEY: original.key }); await disconnectTestDb(); });
beforeEach(async () => {
  await clearTestDb(); vi.restoreAllMocks(); plans = [];
  Object.assign(env, { EMBEDDED_COPILOT_ENABLED: 'true', COPILOT_AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-only-no-network' });
  vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue({});
  model = vi.spyOn(adapter, 'streamAnthropicCompletion').mockImplementation(async args => {
    const name = args.tools?.[0]?.function.name;
    if (name === 'gifting_update_brief') return toolResponse(name, plans.shift() || { brief: {}, queries: [] });
    if (name === 'gifting_plan_combinations') {
      const context = JSON.parse(args.messages[0].content);
      return toolResponse(name, { groups: context.products.length >= 2 ? [{ name: 'Thoughtful desk essentials', rationale: 'A practical start for the team.', itemIds: context.products.slice(0, 2).map(item => item.key) }] : [] });
    }
    args.onTextDelta?.('Normal Copilot response');
    return { text: 'Normal Copilot response', toolCalls: [], usage: { promptTokens: 50, completionTokens: 10 } };
  });
});
async function setup(role = 'company_admin') {
  const tenant = await makeTenant(), member = await makeUser(tenant, role, role === 'entity_manager' ? 'entity' : 'tenant');
  const conversation = await createConversation({ tenantId: tenant._id, userId: member.user._id });
  const toolCtx = buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: member.user._id, role, scopeType: member.assignment.scopeType, assignedEntityIds: [] } });
  return { tenant, member, conversation, args: { tenantId: tenant._id, userId: member.user._id, role, conversationId: String(conversation._id), toolCtx, mode: 'chat' } };
}
async function seedProducts(count = 35) {
  // Alphabetically earlier unrelated inventory must never win just by appearing first.
  await CatalogProduct.create({ sku: 'UNRELATED', name: 'A Construction Hammer', category: 'Industrial', description: 'Workshop hardware', basePriceInr: 50, status: 'active', variants: [{ stock: 100 }] });
  return CatalogProduct.create(Array.from({ length: count }, (_, index) => ({ sku: `DESK-${index}`, name: `Z Desk Item ${String(index).padStart(2, '0')}`,
    description: 'Thoughtful Diwali festive gift for onboarding, employee appreciation and executive desks.', category: index % 2 ? 'Stationery' : 'Work Essentials',
    basePriceInr: 200 + index * 10, gstRate: 18, primaryImageUrl: `https://official.test/desk-${index}.png`, status: 'active', variants: [{ color: 'Navy', stock: 100 }],
  })));
}
const plan = (brief = {}, extra = {}) => ({ brief, queries: [], ...extra });
async function turn(args, content) { const events = []; await streamAssistantTurn({ ...args, content, onEvent: event => events.push(event) }); return events; }
async function last(conversation) { return (await CopilotConversation.findById(conversation._id)).messages.at(-1); }
const cards = message => message.artifacts.flatMap(artifact => artifact.curation?.chat?.groups.flatMap(group => group.artifacts) || []);
const ids = message => cards(message).map(card => String((card.product || card.kit).id));

describe('gifting advisor in the existing Copilot conversation', () => {
  it.each(['company_admin', 'entity_manager'])('finds 20 metadata-relevant products and 10 unseen alternatives for %s', async role => {
    const { args, conversation } = await setup(role), products = await seedProducts(40);
    plans.push(plan({ occasion: 'Diwali', recipients: 100, budgetPerRecipient: 2000, currency: 'INR' }, { count: 20 }));
    await turn(args, 'Suggest 20 creative Diwali gifting ideas for 100 employees under ₹2,000 per person.');
    const first = await last(conversation);
    expect(cards(first)).toHaveLength(20);
    expect(cards(first).every(card => products.some(product => String(product._id) === card.product?.id))).toBe(true);
    for (const card of cards(first)) {
      const source = products.find(product => String(product._id) === card.product.id);
      expect(card.product.sellingPriceInr).toBe(source.basePriceInr);
      expect(card.product.primaryImageUrl).toBe(source.primaryImageUrl);
    }
    plans.push(plan());
    await turn(args, 'Show me 10 more.');
    const more = await last(conversation);
    expect(cards(more)).toHaveLength(10);
    expect(ids(more).some(id => ids(first).includes(id))).toBe(false);
    expect(more.artifacts[0].curation.brief).toMatchObject({ recipients: 100, budgetPerRecipient: 2000, occasion: 'Diwali / Festival' });
    expect(model.mock.calls.every(([call]) => call.tools.length === 1)).toBe(true);
    const audit = await CopilotAudit.findOne({ toolName: 'gifting.advisor' }).sort({ createdAt: -1 });
    expect(audit.metrics).toMatchObject({ modelCalls: 2 });
    expect(audit.metrics.scanned).toBeLessThanOrEqual(150);
  });
  it('calculates real onboarding combinations for 50 employees without business writes', async () => {
    const { args, conversation, tenant } = await setup(); await seedProducts(5);
    plans.push(plan({ company: 'Toast', recipients: 50, budgetPerRecipient: 2500, currency: 'INR' }, { combinations: true }));
    await turn(args, 'I need welcome kits for 50 Toast employees under ₹2,500 each.');
    const message = await last(conversation), group = message.artifacts[0].curation.chat.groups.find(row => row.kind === 'combination');
    const actual = group.artifacts.reduce((sum, row) => sum + row.product.sellingPriceInr, 0);
    expect(group).toMatchObject({ subtotal: actual, total: actual * 50, budgetDifference: 2500 - actual, completePrice: true });
    expect(message.content).toMatch(/not a final fulfilment quote/);
    for (const Model of [Shop, Kit, Order, Campaign]) expect(await Model.countDocuments({ tenantId: tenant._id })).toBe(0);
  });
  it.each(['Employee appreciation gifts', 'Premium executive gifts', 'Christmas gifting combinations'])('handles %s without demanding missing essentials', async content => {
    const { args, conversation } = await setup(); await seedProducts(5);
    if (/Christmas/.test(content)) await CatalogProduct.updateMany({ sku: /^DESK-/ }, { $set: { description: 'A Christmas holiday desk gift.' } });
    plans.push(plan()); await turn(args, content);
    const message = await last(conversation);
    expect(cards(message).length).toBeGreaterThan(0);
    expect(message.content).not.toMatch(/what is the occasion|recipient count\?/i);
  });
  it('preserves exclusions and updates budget, occasion and budget removal across reopened turns', async () => {
    const { args, conversation } = await setup(); await seedProducts(30);
    for (const [sku, name, category] of [['MUG', 'Diwali Mug', 'Drinkware'], ['BOTTLE', 'Welcome Bottle', 'Drinkware'], ['TEE', 'Diwali Cotton Tee', 'Apparel']]) await CatalogProduct.create({ sku, name, category, description: 'Festive gift', status: 'active', basePriceInr: 100, variants: [{ stock: 100 }] });
    plans.push(plan({ budgetPerRecipient: 2000, recipients: 50, currency: 'INR', exclusions: ['mugs', 'bottles', 'apparel'] }));
    await turn(args, 'Onboarding gifts for 50 employees under ₹2,000. No mugs, bottles or apparel.');
    expect(cards(await last(conversation)).every(row => !/mug|bottle|tee/i.test(row.product.name))).toBe(true);
    plans.push(plan({ budgetPerRecipient: 1500 })); await turn(args, 'Now show Diwali gifts instead, under ₹1,500.');
    let saved = await CopilotConversation.findById(conversation._id);
    expect(saved.curator.brief).toMatchObject({ occasion: 'Diwali / Festival', recipients: 50, budgetPerRecipient: 1500, exclusions: ['mugs', 'bottles', 'apparel'] });
    plans.push(plan({}, { clearBudget: true })); await turn(args, 'Forget the budget.');
    saved = await CopilotConversation.findById(conversation._id);
    expect(saved.curator.brief.budgetPerRecipient).toBeUndefined();
    expect(saved.curator.brief.totalBudget).toBeUndefined();
    expect(saved.curator.brief.recipients).toBe(50);
    expect(saved.messages.at(-1).content).not.toMatch(/Share a per-person budget/);
  });
  it('retrieves real curated and tenant-customized kits with actual contents and excludes other tenants', async () => {
    const { args, conversation, tenant } = await setup(), [product] = await seedProducts(1);
    const curated = await PlatformKit.create({ name: 'Diwali Celebration', status: 'active', approxValueInr: 1500, heroImage: 'https://official.test/kit.png', items: [{ catalogProductId: product._id, qty: 2 }] });
    const customized = await Kit.create({ tenantId: tenant._id, name: 'Diwali Team Kit', status: 'live', kitPrice: 1300, artworkUrl: 'https://official.test/custom.png', productRefs: [{ catalogProductId: product._id, name: product.name }] });
    const onboarding = await Kit.create({ tenantId: tenant._id, name: 'Onboarding Welcome Kit', status: 'live', kitPrice: 1000, productRefs: [{ catalogProductId: product._id, name: product.name }] });
    const outsider = await makeTenant(); await Kit.create({ tenantId: outsider._id, name: 'Diwali Private Kit', status: 'live', kitPrice: 1000, productRefs: [{ catalogProductId: product._id }] });
    plans.push(plan({ occasion: 'Diwali', budgetPerRecipient: 2000, currency: 'INR' }, { combinations: true }));
    await turn(args, 'Suggest Diwali gift kits under ₹2,000 each.');
    const kitCards = cards(await last(conversation)).filter(row => row.kind === 'kit');
    expect(kitCards.map(row => row.kit.id).sort()).toEqual([String(curated._id), String(customized._id)].sort());
    expect(kitCards.find(row => row.kit.curated).kit).toMatchObject({ priceInr: 1500, products: [{ name: product.name, quantity: 2 }] });
    plans.push(plan({}, { combinations: true }));
    await turn(args, 'Now suggest onboarding kits instead.');
    expect(cards(await last(conversation)).filter(row => row.kind === 'kit').map(row => row.kit.id)).toEqual([String(onboarding._id)]);
  });
  it('does not recommend out-of-stock or over-budget products; supports missing images and unknown prices', async () => {
    const { args, conversation } = await setup();
    await CatalogProduct.create([
      { sku: 'OUT', name: 'Diwali Lamp Out', status: 'active', basePriceInr: 500, variants: [{ stock: 0 }] },
      { sku: 'EXP', name: 'Diwali Lamp Expensive', status: 'active', basePriceInr: 4000, variants: [{ stock: 20 }] },
      { sku: 'UNKNOWN', name: 'Diwali Gift Unknown', status: 'active', basePriceInr: 0, variants: [{ stock: 20 }] },
      { sku: 'REAL', name: 'Diwali Gift Missing Image', status: 'active', basePriceInr: 500, variants: [{ stock: 20 }] },
    ]);
    plans.push(plan({ budgetPerRecipient: 2000, currency: 'INR' }, { combinations: true })); await turn(args, 'Diwali gifting combinations under ₹2,000.');
    const message = await last(conversation), group = message.artifacts[0].curation.chat.groups[0];
    expect(cards(message)).toHaveLength(2);
    expect(group).toMatchObject({ subtotal: 500, completePrice: false, total: null, missingPrices: 1 });
    expect(cards(message).find(row => /Unknown/.test(row.product.name)).product.sellingPriceInr).toBeNull();
    expect(cards(message).every(row => row.product.primaryImageUrl === '')).toBe(true);
  });
  it('returns a truthful zero-match response instead of unrelated inventory', async () => {
    const { args, conversation } = await setup();
    await CatalogProduct.create({ sku: 'HAMMER', name: 'A Hammer', category: 'Industrial', description: 'Hardware', basePriceInr: 100, status: 'active' });
    plans.push(plan()); await turn(args, 'Suggest Diwali gifts.');
    const message = await last(conversation);
    expect(cards(message)).toHaveLength(0);
    expect(message.content).toMatch(/no suitable.*bounded search/i);
    expect(model).toHaveBeenCalledOnce();
  });
  it('keeps real cards available when Claude omits a valid combination plan', async () => {
    const { args, conversation } = await setup(); await seedProducts(5);
    model.mockImplementationOnce(async () => toolResponse('gifting_update_brief', plan()));
    model.mockImplementationOnce(async () => ({ text: 'Here are some ideas.', toolCalls: [], usage: {} }));
    await turn(args, 'Suggest 5 Diwali gifts.');
    const message = await last(conversation);
    expect(cards(message)).toHaveLength(5);
    expect(message.content).toMatch(/could not validate the themed grouping/);
    expect(message.artifacts[0].curation.chat.groups.every(group => group.kind === 'products')).toBe(true);
    expect(model).toHaveBeenCalledTimes(2);
  });
  it('finds matching description data beyond alphabetically earlier unrelated records', async () => {
    const { args, conversation } = await setup();
    await CatalogProduct.create(Array.from({ length: 70 }, (_, n) => ({ sku: `TOOLS-${n}`, name: `A Hammer ${n}`, category: 'Industrial', basePriceInr: 100, status: 'active', variants: [{ stock: 100 }] })));
    const product = await CatalogProduct.create({ sku: 'LATE', name: 'Z Handcrafted Light', description: `${'A carefully made item. '.repeat(20)}A Diwali gifting option.`, category: 'Home', basePriceInr: 1200, status: 'active', variants: [{ stock: 100 }] });
    plans.push(plan({ currency: 'INR', budgetPerRecipient: 2000 })); await turn(args, 'Suggest Diwali gifts under ₹2,000.');
    expect(ids(await last(conversation))).toEqual([String(product._id)]);
  });
  it('refines premium/affordable price order and can move to other real categories', async () => {
    const { args, conversation } = await setup(); await seedProducts(35);
    plans.push(plan({}, { count: 3, combinations: false })); await turn(args, 'Show 3 premium executive gifts.');
    const premium = cards(await last(conversation)).map(row => row.product.sellingPriceInr);
    expect(premium).toEqual([...premium].sort((a, b) => b - a));
    plans.push(plan({}, { combinations: false })); await turn(args, 'Show 3 affordable alternatives.');
    const affordable = cards(await last(conversation)).map(row => row.product.sellingPriceInr);
    expect(Math.max(...affordable)).toBeLessThan(Math.min(...premium));
    const other = await CatalogProduct.create({ sku: 'OTHER', name: 'Wireless Speaker', description: 'Premium executive desk gift', category: 'Electronics', basePriceInr: 1000, status: 'active', variants: [{ stock: 100 }] });
    plans.push(plan({}, { combinations: false })); await turn(args, 'Show products from other categories.');
    expect(ids(await last(conversation))).toEqual([String(other._id)]);
  });
  it('keeps wallet and WRITE requests on the ordinary Copilot flow in the same conversation', async () => {
    const { args, conversation } = await setup(); await seedProducts(3);
    plans.push(plan()); await turn(args, 'Suggest onboarding gifts.');
    await turn(args, 'What is my wallet balance?');
    expect((await last(conversation)).content).toBe('Normal Copilot response');
    expect(model.mock.calls.at(-1)[0].tools.some(tool => tool.function.name === 'wallet_list_balances')).toBe(true);
    expect(isGiftingAdvisorRequest('Create a store for onboarding gifts', conversation)).toBe(false);
    expect(isGiftingAdvisorRequest('Send this kit to employees', conversation)).toBe(false);
    expect(isGiftingAdvisorRequest('Create a new company swag store for onboarding gifts', conversation)).toBe(false);
    expect(isGiftingAdvisorRequest('Show my department budget', conversation)).toBe(false);
    expect(isGiftingAdvisorRequest('Send a Diwali kit to the team', conversation)).toBe(false);
  });
  it('never converts foreign currency or searches external products', async () => {
    const { args, conversation } = await setup();
    plans.push(plan({ budgetPerRecipient: 20, currency: 'USD' })); const events = await turn(args, 'Show onboarding gifts under $20.');
    expect((await last(conversation)).content).toMatch(/not converted/);
    expect(events.some(event => /catalog|kits/.test(event.name || ''))).toBe(false);
    plans.push(plan()); await turn(args, 'Show gifts outside ShelfMerch.');
    expect((await last(conversation)).content).toMatch(/not connected/);
  });
  it('uses the existing authenticated SSE route and denies cross-tenant history access', async () => {
    const { conversation, member } = await setup(); await seedProducts(3); plans.push(plan());
    const response = await request(app).post(`/api/v1/copilot/conversations/${conversation._id}/messages`).set(authHeader(member.token)).send({ content: 'Recommend employee appreciation gifts.', mode: 'chat' });
    expect(response.status).toBe(200); expect(response.text).toContain('"type":"artifacts"'); expect(response.text).toContain('"type":"done"');
    const outsider = await makeUser(await makeTenant(), 'company_admin');
    expect((await request(app).get(`/api/v1/copilot/conversations/${conversation._id}`).set(authHeader(outsider.token))).status).toBe(404);
  });
  it('enforces catalog permission before direct advisor reads', async () => {
    const { args } = await setup();
    await expect(readAdvisorCatalogPage({ brief: {}, terms: ['gift'], page: 1, seenIds: [], omitCategories: [], ranking: 'relevant', role: 'member', toolCtx: args.toolCtx })).rejects.toMatchObject({ status: 403 });
  });
});

describe('advisor safeguards and bounded discovery', () => {
  it('distinguishes idea counts from recipients and retains total-budget semantics', () => {
    expect(requestedAdvice('Suggest 20 creative Diwali gifting ideas for 100 employees.').count).toBe(20);
    expect(requestedAdvice('Show me 10 more.', { count: 20 }).count).toBe(10);
    const brief = updateAdvisorBrief({}, advisorBriefSchema.parse(plan({ totalBudget: 100000, recipients: 50, currency: 'INR' })), 'Welcome gifts, total ₹100,000 for 50 employees.');
    expect(brief.budgetPerRecipient).toBe(2000);
    expect(updateAdvisorBrief(brief, advisorBriefSchema.parse(plan({ recipients: 100 })), 'For 100 employees').budgetPerRecipient).toBe(1000);
  });
  it('rejects invented IDs, over-budget combinations and repeated cards across groups', () => {
    const items = [1, 2, 3].map(n => ({ key: `product:${n}`, name: 'Desk gift', kind: 'product', price: n * 100, card: { id: String(n), name: 'Desk gift' } }));
    const groups = buildAdvisorGroups({ groups: [
      { name: 'Invented', itemIds: ['product:1', 'invented'] },
      { name: 'Too much', itemIds: ['product:2', 'product:3'] },
      { name: 'Valid', rationale: 'A useful start', itemIds: ['product:1', 'product:2'] },
    ] }, items, { budgetPerRecipient: 350, currency: 'INR', recipients: 10 }, true);
    expect(groups[0]).toMatchObject({ name: 'Valid', subtotal: 300, total: 3000, budgetDifference: 50 });
    expect(groups.flatMap(group => group.artifacts).map(row => row.product.id)).toEqual(['1', '2', '3']);
  });
  it('does not give unrelated products a premium relevance score', () => {
    expect(scoreGift({ name: 'Construction Hammer', price: 1999 }, { occasion: 'Executive' }, { ranking: 'premium' })).toBe(0);
    const brief = updateAdvisorBrief({ budgetPerRecipient: 2000, currency: 'INR' }, advisorBriefSchema.parse(plan({}, { clearBudget: true })), 'Something more premium');
    expect(brief.budgetPerRecipient).toBe(2000);
  });
  it('bounds pages and candidate scans even for a large full catalog', async () => {
    let pages = 0;
    const result = await discoverAdvisorCandidates({ brief: { source: 'shelfmerch', occasion: 'Diwali', exclusions: ['mugs'] }, advice: { count: 20, ranking: 'relevant' }, state: {}, queries: [],
      readPage: async () => { pages += 1; return { hasMore: true, items: Array.from({ length: 25 }, (_, n) => ({ id: `${pages}${String(n).padStart(23, '0')}`, name: 'Diwali Mug', sellingPriceInr: 100, variants: [{ stock: 1 }] })) }; },
      readTool: async () => ({ result: { items: [] } }),
    });
    expect(pages).toBe(6); expect(result.scanned).toBe(150); expect(result.candidates).toHaveLength(0);
  });
});
