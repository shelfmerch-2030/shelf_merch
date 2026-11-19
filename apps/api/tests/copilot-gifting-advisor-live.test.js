// Explicit opt-in only: real Claude, synthetic catalog and an isolated MongoDB database.
import { expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { connectTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';

it.skipIf(process.env.GIFTING_ADVISOR_LIVE !== '1')('uses live Claude for catalog advice, refinements, kits and persisted constraints in ordinary chat', async () => {
  const enabled = env.EMBEDDED_COPILOT_ENABLED;
  try {
    expect(env.COPILOT_AI_PROVIDER).toBe('anthropic');
    env.EMBEDDED_COPILOT_ENABLED = 'true'; await connectTestDb();
    const tenant = await makeTenant(), { user } = await makeUser(tenant, 'company_admin');
    const products = await CatalogProduct.create(Array.from({ length: 100 }, (_, n) => ({ sku: `LIVE-ADVISOR-${n}`, name: `Desk gift ${String(n).padStart(3, '0')}`,
      description: 'A desk gift for Diwali festive celebrations, employee appreciation, executive gifting and onboarding.', category: n % 2 ? 'Stationery' : 'Work Essentials',
      status: 'active', basePriceInr: 200 + n * 10, primaryImageUrl: `https://official.example.test/gift-${n}.png`, variants: [{ color: 'Navy', stock: 1000 }],
    })));
    const platform = await PlatformKit.create({ name: 'Diwali Gift Kit', status: 'active', approxValueInr: 1500, items: [{ catalogProductId: products[0]._id, qty: 2 }] });
    const customized = await Kit.create({ tenantId: tenant._id, name: 'Onboarding Welcome Kit', status: 'live', kitPrice: 1000, productRefs: [{ catalogProductId: products[1]._id, name: products[1].name }] });
    const conversation = await createConversation({ tenantId: tenant._id, userId: user._id });
    const toolCtx = buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } });
    const summaries = [], seen = new Set();
    const requests = [
      'Suggest 20 creative Diwali gifting ideas for 100 Toast employees under ₹2,000 per person. No mugs, bottles or apparel.',
      'Show me 10 more.',
      'Make it more premium. Show 5 more options, keeping the same budget and exclusions.',
      'Now suggest onboarding kits for 50 employees under ₹2,500 instead. Show 5 options.',
      'Suggest 5 employee appreciation gifts instead.',
      'Forget the budget. Show 5 executive gifts.',
    ];
    for (const [index, content] of requests.entries()) {
      const events = [];
      await streamAssistantTurn({ tenantId: tenant._id, userId: user._id, role: 'company_admin', conversationId: String(conversation._id), toolCtx, mode: 'chat', content, onEvent: event => events.push(event) });
      const saved = await CopilotConversation.findById(conversation._id), last = saved.messages.at(-1), curation = last.artifacts[0].curation;
      const cards = curation.chat.groups.flatMap(group => group.artifacts), returnedIds = cards.map(row => String((row.product || row.kit).id));
      expect(cards.length).toBe(index === 0 ? 20 : index === 1 ? 10 : 5);
      expect(returnedIds.some(id => seen.has(id))).toBe(false); returnedIds.forEach(id => seen.add(id));
      expect(curation.brief.company).toBe('Toast');
      expect(curation.brief.exclusions).toEqual(expect.arrayContaining(['mugs', 'bottles', 'apparel']));
      for (const row of cards.filter(row => row.kind === 'product')) {
        const product = products.find(item => String(item._id) === row.product.id);
        expect(product).toBeTruthy(); expect(row.product.sellingPriceInr).toBe(product.basePriceInr); expect(row.product.primaryImageUrl).toBe(product.primaryImageUrl);
      }
      for (const group of curation.chat.groups.filter(group => group.kind === 'combination')) {
        const sum = group.artifacts.reduce((total, row) => total + row.product.sellingPriceInr, 0);
        expect(group.subtotal).toBe(sum); expect(group.total).toBe(sum * curation.brief.recipients);
        if (curation.brief.budgetPerRecipient) expect(sum).toBeLessThanOrEqual(curation.brief.budgetPerRecipient);
      }
      if (index === 0) expect(returnedIds).toContain(String(platform._id));
      if (index === 3) { expect(returnedIds).toContain(String(customized._id)); expect(curation.brief.recipients).toBe(50); }
      if (index === 5) expect(curation.brief.budgetPerRecipient).toBeUndefined();
      expect(events.at(-1).type).toBe('done');
      summaries.push({ request: content, brief: curation.brief, cards: cards.length, groups: curation.chat.groups.map(group => ({ name: group.name, kind: group.kind, subtotal: group.subtotal, total: group.total })), usage: events.at(-1).usage });
    }
    for (const Model of [Order, Shop, Campaign]) expect(await Model.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await Kit.countDocuments({ tenantId: tenant._id })).toBe(1);
    await writeFile(new URL('../../../previews/copilot/gifting-advisor-live-results.json', import.meta.url), JSON.stringify({ liveProvider: 'anthropic', isolatedSyntheticCatalog: true, ordinaryChatMode: true, noDuplicateCards: true, officialRecordPricesAndImages: true, noBusinessWrites: true, checkedAt: new Date().toISOString(), turns: summaries }, null, 2));
  } finally { env.EMBEDDED_COPILOT_ENABLED = enabled; await disconnectTestDb(); }
}, 180000);
