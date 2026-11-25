import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { publicResearchRequest } from '../src/modules/copilot/copilotWebResearch.js';
import { isCreativeGiftingRequest, isGiftingAdvisorRequest, updateAdvisorBrief, requestedAdvice } from '../src/modules/copilot/giftingAdvisor.js';
import { mergeBrief } from '../src/modules/copilot/curator.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';

const original = {
  enabled: env.EMBEDDED_COPILOT_ENABLED,
  provider: env.COPILOT_AI_PROVIDER,
  key: env.ANTHROPIC_API_KEY,
  web: env.EMBEDDED_COPILOT_WEB_SEARCH_ENABLED,
  kill: env.EMBEDDED_COPILOT_WEB_SEARCH_KILL_SWITCH,
};

const WELCOME = 'I want to welcome 10 new employees. Suggest some useful gifts for them.';
const toolResponse = (name, value) => ({
  toolCalls: [{ id: 'call', name, arguments: JSON.stringify(value) }],
  usage: { promptTokens: 80, completionTokens: 40 },
});

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => {
  Object.assign(env, {
    EMBEDDED_COPILOT_ENABLED: original.enabled,
    COPILOT_AI_PROVIDER: original.provider,
    ANTHROPIC_API_KEY: original.key,
    EMBEDDED_COPILOT_WEB_SEARCH_ENABLED: original.web,
    EMBEDDED_COPILOT_WEB_SEARCH_KILL_SWITCH: original.kill,
  });
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  vi.restoreAllMocks();
  Object.assign(env, {
    EMBEDDED_COPILOT_ENABLED: 'true',
    COPILOT_AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-only-no-network',
    EMBEDDED_COPILOT_WEB_SEARCH_ENABLED: 'true',
    EMBEDDED_COPILOT_WEB_SEARCH_KILL_SWITCH: 'false',
  });
});

async function workspace() {
  const tenant = await makeTenant();
  const member = await makeUser(tenant, 'company_admin');
  const conversation = await createConversation({ tenantId: tenant._id, userId: member.user._id });
  const toolCtx = buildCopilotToolCtx({
    tenantId: tenant._id,
    user: { userId: member.user._id, role: 'company_admin', scopeType: member.assignment.scopeType, assignedEntityIds: [] },
  });
  return {
    tenant,
    conversation,
    args: {
      tenantId: tenant._id,
      userId: member.user._id,
      role: 'company_admin',
      conversationId: String(conversation._id),
      toolCtx,
      mode: 'chat',
    },
  };
}

async function last(conversation) {
  return (await CopilotConversation.findById(conversation._id)).messages.at(-1);
}

describe('classifier: gifting consultation vs supplier research', () => {
  it('does not route bare welcome-gift ideation to listing research', () => {
    expect(publicResearchRequest(WELCOME)).toBeNull();
    expect(isGiftingAdvisorRequest(WELCOME)).toBe(true);
    expect(isCreativeGiftingRequest(WELCOME)).toBe(false);
  });

  it('keeps specific-category kit discovery on listings research', () => {
    expect(publicResearchRequest(
      'I need something innovative in kitchen tech for Toast employees. Give me nice gifting kit ideas.',
    )).toMatchObject({
      purpose: 'listings',
      category: 'Kitchenware',
      kitIntent: true,
    });
  });

  it('still routes explicit supplier / outside-catalog asks to research', () => {
    expect(publicResearchRequest('Search the web for kitchen-tech gadgets available in India.')).toMatchObject({ purpose: 'listings' });
    expect(publicResearchRequest('Find gifts outside ShelfMerch under INR 1000.')).toMatchObject({ purpose: 'listings' });
    expect(publicResearchRequest('Show supplier listings for welcome gifts in India.')).toMatchObject({ purpose: 'listings' });
  });

  it('leaves unrelated general questions on the default chat lane', () => {
    expect(publicResearchRequest('What is the capital of Belgium?')).toBeNull();
    expect(isGiftingAdvisorRequest('What is the capital of Belgium?')).toBe(false);
    expect(isCreativeGiftingRequest('Explain how recursion works.')).toBe(false);
  });

  it('parses recipient count from welcome / new-hire phrasing', () => {
    expect(mergeBrief({}, {}, WELCOME).recipients).toBe(10);
    expect(mergeBrief({}, {}, 'Welcome 25 new hires with practical desk gifts').recipients).toBe(25);
    expect(updateAdvisorBrief({}, { brief: {}, queries: [] }, WELCOME).recipients).toBe(10);
    expect(updateAdvisorBrief({}, { brief: {}, queries: [] }, WELCOME).occasion).toBe('Welcome / Onboarding');
  });
});

describe('acceptance: welcome gifts use advisor, not web search', () => {
  it('returns ShelfMerch curation for the staging welcome prompt even when web search is allowlisted', async () => {
    const { args, conversation } = await workspace();
    await CatalogProduct.create([
      { sku: 'NB-1', name: 'Welcome Notebook', category: 'Stationery', description: 'Onboarding journal for new joiners', basePriceInr: 399, status: 'active', variants: [{ stock: 50 }], primaryImageUrl: 'https://official.test/nb.png' },
      { sku: 'PEN-1', name: 'Desk Pen Set', category: 'Stationery', description: 'Welcome desk gift for new employees', basePriceInr: 299, status: 'active', variants: [{ stock: 50 }] },
      { sku: 'BAG-1', name: 'Day-one Tote', category: 'Bags', description: 'Practical bag for onboarding week', basePriceInr: 699, status: 'active', variants: [{ stock: 50 }] },
      { sku: 'BOT-1', name: 'Steel Bottle', category: 'Drinkware', description: 'Reusable bottle for new hires', basePriceInr: 499, status: 'active', variants: [{ stock: 50 }] },
    ]);
    const stream = vi.spyOn(adapter, 'streamAnthropicCompletion').mockImplementation(async (call) => {
      const name = call.tools?.[0]?.function.name;
      if (name === 'gifting_update_brief') {
        return toolResponse(name, { brief: { occasion: 'Welcome / Onboarding', recipients: 10 }, combinations: true, queries: ['notebook', 'desk', 'bag'] });
      }
      if (name === 'gifting_plan_combinations') {
        const context = JSON.parse(call.messages[0].content);
        return toolResponse(name, {
          groups: context.products.length >= 2
            ? [{ name: 'First-day desk kit', rationale: 'Useful tools for settling into a new role.', itemIds: context.products.slice(0, 2).map((p) => p.key) }]
            : [],
        });
      }
      return { text: 'should-not-reach-general-chat', toolCalls: [], usage: {} };
    });
    vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue({});

    await streamAssistantTurn({ ...args, content: WELCOME });
    const message = await last(conversation);

    expect(message.artifacts.some((row) => row.kind === 'web_research')).toBe(false);
    expect(message.artifacts.some((row) => row.kind === 'external_product')).toBe(false);
    expect(message.artifacts[0]).toMatchObject({
      kind: 'curation',
      curation: expect.objectContaining({
        brief: expect.objectContaining({ recipients: 10, occasion: 'Welcome / Onboarding' }),
        chat: expect.objectContaining({ groups: expect.any(Array) }),
      }),
    });
    expect(message.content).toMatch(/10 recipients/i);
    expect(message.content).not.toMatch(/Share a per-person budget/i);
    expect(stream.mock.calls.every(([call]) => !call.webSearch)).toBe(true);
    expect(stream.mock.calls[0][0].tools?.[0]?.function.name).toBe('gifting_update_brief');
  });

  it('refines with a budget follow-up and keeps kit follow-ups on the advisor', async () => {
    const { args, conversation } = await workspace();
    await CatalogProduct.create([
      { sku: 'A1', name: 'Welcome Notebook', category: 'Stationery', description: 'Onboarding gift notebook', basePriceInr: 400, status: 'active', variants: [{ stock: 40 }] },
      { sku: 'A2', name: 'Welcome Pen', category: 'Stationery', description: 'Onboarding gift pen', basePriceInr: 300, status: 'active', variants: [{ stock: 40 }] },
      { sku: 'A3', name: 'Welcome Tote', category: 'Bags', description: 'Onboarding tote bag', basePriceInr: 700, status: 'active', variants: [{ stock: 40 }] },
      { sku: 'A4', name: 'Premium Speaker', category: 'Electronics', description: 'Executive desk speaker', basePriceInr: 5000, status: 'active', variants: [{ stock: 10 }] },
    ]);
    const plans = [
      { brief: { occasion: 'Welcome / Onboarding', recipients: 10 }, combinations: true, queries: ['notebook'] },
      { brief: { budgetPerRecipient: 2000, currency: 'INR', recipients: 10 }, combinations: true, queries: ['desk'] },
      { brief: { budgetPerRecipient: 2000, currency: 'INR', recipients: 10 }, combinations: true, queries: ['tote', 'notebook'] },
    ];
    vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue({});
    vi.spyOn(adapter, 'streamAnthropicCompletion').mockImplementation(async (call) => {
      const name = call.tools?.[0]?.function.name;
      if (name === 'gifting_update_brief') return toolResponse(name, plans.shift() || { brief: {}, queries: [] });
      if (name === 'gifting_plan_combinations') {
        const context = JSON.parse(call.messages[0].content);
        return toolResponse(name, {
          groups: context.products.length >= 2
            ? [{ name: 'Welcome essentials', rationale: 'Practical day-one items.', itemIds: context.products.slice(0, 2).map((p) => p.key) }]
            : [],
        });
      }
      return { text: 'general', toolCalls: [], usage: {} };
    });

    await streamAssistantTurn({ ...args, content: WELCOME });
    await streamAssistantTurn({ ...args, content: 'My budget is INR 2,000 per employee' });
    const budgeted = await last(conversation);
    expect(budgeted.artifacts[0].curation.brief).toMatchObject({ recipients: 10, budgetPerRecipient: 2000, currency: 'INR' });
    expect(budgeted.artifacts.some((row) => row.kind === 'web_research')).toBe(false);

    const saved = await CopilotConversation.findById(conversation._id);
    expect(isGiftingAdvisorRequest('Show real products for the second kit', saved)).toBe(true);
    await streamAssistantTurn({ ...args, content: 'Show real products for the second kit' });
    const follow = await last(conversation);
    expect(follow.artifacts[0].kind).toBe('curation');
    expect(follow.artifacts.some((row) => row.kind === 'external_product')).toBe(false);
  });
});

describe('acceptance: creative, external, catalog, and general lanes stay distinct', () => {
  it('uses creative concepts for brainstorm prompts without inventing prices', async () => {
    const { args, conversation } = await workspace();
    env.EMBEDDED_COPILOT_WEB_SEARCH_ENABLED = 'false';
    vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue({});
    vi.spyOn(adapter, 'streamAnthropicCompletion').mockResolvedValue({
      text: '1. Modular desk starter - Useful for settling in.\n2. Commute comfort set - Helps the first commute week.',
      finishReason: 'end_turn',
      toolCalls: [],
      usage: { promptTokens: 20, completionTokens: 30 },
    });
    await streamAssistantTurn({
      ...args,
      content: 'Brainstorm creative welcome kit ideas for new joiners.',
    });
    const message = await last(conversation);
    expect(message.content).toMatch(/Creative gifting concepts/i);
    expect(message.content).not.toMatch(/INR\s*\d|Rs\.?\s*\d|\$\d/);
    expect(message.artifacts).toEqual([]);
  });

  it('uses external research only for explicit outside-ShelfMerch listing asks', async () => {
    const { args, conversation } = await workspace();
    vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue({});
    const stream = vi.spyOn(adapter, 'streamAnthropicCompletion').mockResolvedValue({
      finishReason: 'end_turn',
      toolCalls: [],
      text: '',
      usage: {},
    });
    await streamAssistantTurn({ ...args, content: 'Find gifts outside ShelfMerch under INR 1,000.' });
    const message = await last(conversation);
    expect(message.artifacts[0]?.kind).toBe('web_research');
    expect(publicResearchRequest('Find gifts outside ShelfMerch under INR 1,000.')).toMatchObject({ purpose: 'listings' });
    expect(stream).toHaveBeenCalled();
  });

  it('keeps idea counts separate from employee counts', () => {
    expect(requestedAdvice(WELCOME).count).toBe(8);
    expect(requestedAdvice('Suggest 5 useful welcome gifts for 10 new employees.').count).toBe(5);
    expect(requestedAdvice('My budget is INR 2,000 per employee', { count: 8 }).count).toBe(8);
  });
});