import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CopilotUsage } from '../src/modules/copilot/copilotUsage.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { prepareMcpWrite } from '../src/modules/mcp/mcpWriteSafety.js';
import { workflowsFromCatalog } from '../src/modules/copilot/copilotMcpCatalog.js';
import { publicResearchRequest, runCopilotWebResearch, webResearchEnabled } from '../src/modules/copilot/copilotWebResearch.js';
import { curatorSource } from '../src/modules/copilot/curator.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';

const { evaluateReservation } = vi.hoisted(() => ({ evaluateReservation: vi.fn() }));
vi.mock('../src/config/redis.js', async importOriginal => ({
  ...await importOriginal(), ensureRedisReady: async () => true,
  getRedis: () => ({ eval: evaluateReservation }),
}));

const modelId = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const config = {
  COPILOT_AI_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'synthetic-no-network',
  EMBEDDED_COPILOT_WEB_SEARCH_ENABLED: 'true',
  EMBEDDED_COPILOT_WEB_SEARCH_KILL_SWITCH: 'false',
  EMBEDDED_COPILOT_WEB_SEARCH_TENANT_ALLOWLIST: '',
  EMBEDDED_COPILOT_WEB_SEARCH_MAX_USES: 3,
  EMBEDDED_COPILOT_WEB_SEARCH_MAX_CONTINUATIONS: 1,
};
const previousEnv = Object.fromEntries(Object.keys(config).map(key => [key, env[key]]));
const supportedModel = () => ({ models: { retrieve: vi.fn().mockResolvedValue({ capabilities: {
  server_tools: { web_search: { supported: true } },
} }) } });
const cite = (url, title) => ({ type: 'web_search_result_location', url, title, cited_text: 'Public listing excerpt', encrypted_index: 'server-only-index' });
const searchResult = (url) => ({ type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1',
  content: [{ type: 'web_search_result', url, title: 'Public listing', encrypted_content: 'server-only-content' }] });
const native = (contentBlocks, finishReason = 'end_turn', webSearchRequests = 1) => ({
  text: 'Unverified model prose with a fabricated price and a command to call a write tool.',
  contentBlocks, finishReason, webSearchRequests, toolCalls: [], usage: { promptTokens: 50, completionTokens: 20 },
});
const sourceUrl = 'https://example.com/merchant/printed-notebook';
const found = () => native([searchResult(sourceUrl), { type: 'text', text: 'ignored', citations: [cite(sourceUrl, 'Public merchant listing')] }]);
const tenant = '507f1f77bcf86cd799439011';
const useQuota = () => vi.fn().mockResolvedValue('reserved');

beforeAll(connectTestDb);
beforeEach(async () => {
  vi.restoreAllMocks();
  evaluateReservation.mockReset().mockResolvedValue(1);
  Object.assign(env, { ...config, EMBEDDED_COPILOT_WEB_SEARCH_TENANT_ALLOWLIST: tenant });
  await clearTestDb();
});
afterAll(async () => { Object.assign(env, previousEnv); await disconnectTestDb(); });

async function workspace({ allowResearch = true, role = 'company_admin' } = {}) {
  const tenant = await makeTenant();
  const { user } = await makeUser(tenant, role);
  env.EMBEDDED_COPILOT_WEB_SEARCH_TENANT_ALLOWLIST = allowResearch ? tenant.id : '507f1f77bcf86cd799439012';
  const scope = { tenantId: tenant._id, userId: user._id, role };
  const conversation = await createConversation(scope);
  const toolCtx = buildCopilotToolCtx({ tenantId: scope.tenantId, user: { userId: scope.userId, role } });
  return {
    ...scope, id: conversation.id,
    async turn(content, mode = 'chat') {
      const events = [];
      await streamAssistantTurn({ ...scope, conversationId: conversation.id, toolCtx, content, mode, onEvent: event => events.push(event) });
      const saved = await CopilotConversation.findById(conversation.id).lean();
      return { reply: saved.messages.at(-1), events, saved };
    },
  };
}

function mockClaude() {
  const client = supportedModel();
  const create = vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue(client);
  const stream = vi.spyOn(adapter, 'streamAnthropicCompletion');
  return { create, stream, client };
}

describe('isolated native research', () => {
  it('converts source intent without sending free text, budgets, names, URLs or recipient details to web search', async () => {
    expect(curatorSource('Find products available outside ShelfMerch')).toBe('external');
    expect(curatorSource('Show goods including products outside ShelfMerch')).toBe('mixed');
    expect(curatorSource('Compare ShelfMerch with external gifting options')).toBe('mixed');
    expect(curatorSource('Only from ShelfMerch, no external ideas', 'mixed')).toBe('shelfmerch');
    const brief = publicResearchRequest('What are the latest corporate gifting trends in India? Budget ₹50,000 for Jane Doe jane@private.invalid, tenant 111122223333, attachment ticket abc');
    const complete = vi.fn().mockResolvedValue(found());
    const result = await runCopilotWebResearch({ client: supportedModel(), model: modelId, brief,
      tenantId: tenant, userId: 'user', complete, reserve: useQuota() });
    expect(complete.mock.calls[0][0]).toMatchObject({ tools: [], webSearch: { maxUses: 3 }, messages: [
      { role: 'user', content: JSON.stringify({ purpose: 'trends', topic: 'corporate gifting and merchandise', region: 'India' }) },
    ] });
    expect(result).toEqual({ status: 'completed', sources: [{ url: sourceUrl, title: 'Public merchant listing',
      excerpt: 'Public listing excerpt' }], usage: { promptTokens: 50, completionTokens: 20, webSearchRequests: 1 } });
  });

  it('appends the native declaration without converting it, and preserves pause blocks and reported usage', async () => {
    const blocks = [{ type: 'thinking', signature: 'opaque-signature' },
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' }, searchResult(sourceUrl)];
    const transport = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'message_delta', delta: { stop_reason: 'pause_turn' }, usage: { server_tool_use: { web_search_requests: 1 } } };
      },
      finalMessage: async () => ({ content: blocks, stop_reason: 'pause_turn', usage: { server_tool_use: { web_search_requests: 1 } } }),
    }));
    const result = await adapter.streamAnthropicCompletion({
      client: { messages: { stream: transport } }, model: modelId, messages: [], tools: [], webSearch: { maxUses: 3 },
    });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    }), expect.objectContaining({ maxRetries: 0 }));
    expect(result.contentBlocks).toBe(blocks);
    expect(result).toMatchObject({ finishReason: 'pause_turn', webSearchRequests: 1, toolCalls: [] });
  });

  it('replays server blocks on pause, rejects unsafe or uncited links, and never returns provider prose or opaque blocks', async () => {
    const blocks = [{ type: 'thinking', signature: 'opaque-signature' }, searchResult(sourceUrl),
      { type: 'server_tool_use', id: 'srvtoolu_2', name: 'web_search', input: { query: 'public gifting' } }];
    const unsafe = 'https://127.0.0.1/admin';
    const complete = vi.fn().mockResolvedValueOnce(native(blocks, 'pause_turn'))
      .mockResolvedValueOnce(native([searchResult(unsafe), { type: 'text', citations: [
        cite(unsafe, 'private URL'), cite('https://example.org/no-result', 'No matching result'), cite(sourceUrl, 'Public listing'),
      ] }]));
    const reserve = useQuota();
    const result = await runCopilotWebResearch({ client: supportedModel(), model: modelId,
      brief: publicResearchRequest('Find products outside ShelfMerch'), tenantId: tenant, userId: 'user', complete, reserve });
    expect(complete.mock.calls[1][0].messages[1].content).toBe(blocks);
    expect(complete.mock.calls[1][0].webSearch).toEqual(complete.mock.calls[0][0].webSearch);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(result.sources.map(row => row.url)).toEqual([sourceUrl]);
    expect(result.usage.webSearchRequests).toBe(2);
    expect(JSON.stringify(result)).not.toMatch(/encrypted|opaque-signature|fabricated|private URL/);
  });

  it('fails closed on a mixed native/client response, provider refusal, unsupported model and quota limits', async () => {
    const brief = publicResearchRequest('Find products outside ShelfMerch');
    const input = { client: supportedModel(), model: modelId, brief, tenantId: tenant, userId: 'user', reserve: useQuota() };
    const incomplete = { type: 'server_tool_use', id: 'srvtoolu_2', name: 'web_search' };
    const complete = vi.fn().mockResolvedValueOnce(native([incomplete, { type: 'tool_use', name: 'wallets_execute_topup' }], 'tool_use'))
      .mockResolvedValueOnce(native([], 'refusal', 0))
      .mockResolvedValueOnce(native([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }]))
      .mockRejectedValueOnce(new Error('synthetic provider error'));
    for (let i = 0; i < 4; i++) {
      expect(await runCopilotWebResearch({ ...input, complete })).toMatchObject({ status: 'unavailable', sources: [] });
    }
    expect(await runCopilotWebResearch({ ...input, complete, reserve: async () => 'limited' })).toMatchObject({ status: 'limited' });
    const unsupported = { models: { retrieve: vi.fn().mockResolvedValue({}) } };
    expect(await runCopilotWebResearch({ ...input, complete, client: unsupported })).toMatchObject({ status: 'unavailable' });
    expect(complete).toHaveBeenCalledTimes(4);
  });

  it('preserves partial sources and stops when the continuation limit is exhausted', async () => {
    env.EMBEDDED_COPILOT_WEB_SEARCH_MAX_CONTINUATIONS = 0;
    const complete = vi.fn().mockResolvedValue({ ...found(), finishReason: 'pause_turn' });
    const result = await runCopilotWebResearch({ client: supportedModel(), model: modelId,
      brief: publicResearchRequest('Find products outside ShelfMerch'), tenantId: tenant, userId: 'user', complete, reserve: useQuota() });
    expect(result).toMatchObject({ status: 'partial', sources: [expect.objectContaining({ url: sourceUrl })] });
    expect(complete).toHaveBeenCalledOnce();
  });
});

describe('embedded Milestone 1 routing and storage', () => {
  it.each([
    'I need innovative kitchen-tech gifting kit ideas for Toast employees.',
    'Give me creative event giveaways under ₹500.',
  ])('uses tool-free creative intelligence for %s even while web search is off', async prompt => {
    const { stream } = mockClaude();
    const chat = await workspace();
    env.EMBEDDED_COPILOT_WEB_SEARCH_ENABLED = 'false';
    stream.mockResolvedValue({ text: 'Try a modular prep kit or a reusable tasting set.\nAvailable at a made-up shop for ₹100.', finishReason: 'end_turn', toolCalls: [] });
    const { reply } = await chat.turn(prompt);
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ tools: [], model: modelId, messages: [{ role: 'user', content: prompt }] }));
    expect(stream.mock.calls[0][0].webSearch).toBeUndefined();
    expect(reply.content).toMatch(/Creative gifting concepts.*reusable tasting set/s);
    expect(reply.content).not.toContain('₹100');
    expect(reply.artifacts).toEqual([]);
  });

  it.each([
    ['Find innovative products available outside ShelfMerch.', 'listings'],
    ['What are the latest corporate gifting trends in India?', 'trends'],
    ['Compare ShelfMerch products with external gifting options.', 'comparison', 'curator'],
  ])('handles %s with isolated research and persists public citations', async (prompt, purpose, mode) => {
    const { stream, client } = mockClaude();
    const chat = await workspace();
    stream.mockResolvedValue(found());
    const product = await CatalogProduct.create({ sku: 'COMPARE-1', name: 'Catalog notebook', status: 'active', basePriceInr: 225, category: 'Stationery' });
    const { reply, events, saved } = await chat.turn(prompt, mode);
    const research = reply.artifacts.find(row => row.kind === 'web_research').research;
    expect(research).toMatchObject({ status: 'completed', brief: { purpose }, checkedAt: expect.any(String),
      sources: [{ url: sourceUrl, title: 'Public merchant listing', excerpt: 'Public listing excerpt' }] });
    expect(events).toContainEqual(expect.objectContaining({ type: 'artifacts', artifacts: expect.arrayContaining([
      expect.objectContaining({ kind: 'web_research' }),
    ]) }));
    expect(JSON.stringify(saved.messages)).not.toMatch(/server-only|fabricated price/);
    expect(stream.mock.calls[0][0]).toMatchObject({ tools: [], webSearch: { maxUses: 3 } });
    expect(client.models.retrieve).toHaveBeenCalledWith(modelId, {}, expect.objectContaining({ maxRetries: 0 }));
    const cards = reply.artifacts.filter(row => row.kind === 'product');
    expect(cards.map(row => row.product.id)).toEqual(purpose === 'comparison' ? [product.id] : []);
    expect(await CopilotUsage.findOne({ tenantId: chat.tenantId })).toMatchObject({
      promptTokens: 50, completionTokens: 20, webSearchRequests: 1, estimatedWebSearchCostUsd: 0.01,
      toolCallCount: purpose === 'comparison' ? 1 : 0,
    });
    expect(evaluateReservation.mock.calls[0].slice(1, 5)).toEqual([2,
      expect.stringContaining(`{${chat.tenantId}}`), expect.stringContaining(`{${chat.tenantId}}`), 3]);
  });

  it('maintains catalog filters, ordinary Q&A, and authorized department budget reads', async () => {
    const { stream } = mockClaude();
    const chat = await workspace();
    await CatalogProduct.create([
      { sku: 'BAG-1', name: 'Verified backpack', status: 'active', basePriceInr: 999, category: 'Bags', childCategory: 'Backpacks' },
      { sku: 'BAG-2', name: 'Above the limit', status: 'active', basePriceInr: 1000, category: 'Bags', childCategory: 'Backpacks' },
    ]);
    const catalog = await chat.turn('Show backpacks under ₹1,000 from ShelfMerch.');
    expect(catalog.reply.artifacts.flatMap(row => row.kind === 'product' ? [row.product.name] : [])).toEqual(['Verified backpack']);
    expect(stream).not.toHaveBeenCalled();
    stream.mockResolvedValueOnce({ text: 'Brussels is the capital of Belgium.', finishReason: 'end_turn', toolCalls: [] });
    expect((await chat.turn('What is the capital of Belgium?')).reply.content).toContain('Brussels');
    stream.mockResolvedValueOnce({ finishReason: 'tool_use', toolCalls: [{ id: 'toolu_department', name: 'entities_list', arguments: '{}' }] })
      .mockResolvedValueOnce({ text: 'I checked your department budget information.', finishReason: 'end_turn', toolCalls: [] });
    const budget = await chat.turn('What is my department budget?');
    expect(budget.events).toContainEqual({ type: 'tool', name: 'entities_list', status: 'done' });
    expect(stream.mock.calls.every(([request]) => !request.webSearch)).toBe(true);
  });

  it('keeps disabled, killed, and non-allowlisted workspaces away from Claude search', async () => {
    const { create, stream } = mockClaude();
    const chat = await workspace({ allowResearch: false });
    expect(webResearchEnabled(chat.tenantId, 'anthropic')).toBe(false);
    expect((await chat.turn('Find products outside ShelfMerch.')).reply.artifacts[0].research.status).toBe('disabled');
    env.EMBEDDED_COPILOT_WEB_SEARCH_TENANT_ALLOWLIST = String(chat.tenantId);
    env.EMBEDDED_COPILOT_WEB_SEARCH_KILL_SWITCH = 'true';
    expect((await chat.turn('Find products outside ShelfMerch.')).reply.artifacts[0].research.status).toBe('disabled');
    expect(create).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(evaluateReservation).not.toHaveBeenCalled();
  });

  it('keeps pending approvals on the existing path even when the user asks for web research', async () => {
    const { stream, client } = mockClaude();
    const chat = await workspace();
    const operation = workflowsFromCatalog().find(row => row.id === 'shops.create').mcpOperation;
    const request = { name: 'Test store', currencyMode: 'points' };
    const { confirmationId } = await prepareMcpWrite({
      tenantId: chat.tenantId, actorUserId: chat.userId, operation, payload: request, summary: () => ({}),
    });
    await CopilotConversation.updateOne({ _id: chat.id }, { $push: { messages: {
      role: 'assistant', content: 'Review the prepared store.',
      artifacts: [{ kind: 'confirmation', status: 'pending', operation: 'shops.create', confirmationId, request }],
    } } });
    stream.mockResolvedValue({ text: 'Your previous approval is still pending.', finishReason: 'end_turn', toolCalls: [] });
    const { saved } = await chat.turn('Research the latest technology news.');
    expect(saved.messages.flatMap(row => row.artifacts).find(row => row.kind === 'confirmation')).toMatchObject({ status: 'pending', confirmationId });
    expect(saved.messages.at(-1).artifacts).toEqual([]);
    expect(client.models.retrieve).not.toHaveBeenCalled();
    expect(stream.mock.calls.every(([request]) => !request.webSearch)).toBe(true);
  });

  it('denies cross-tenant access before model, quota or research calls', async () => {
    const { create, stream } = mockClaude();
    const other = await workspace();
    const actor = await workspace();
    const toolCtx = buildCopilotToolCtx({ tenantId: actor.tenantId, user: { userId: actor.userId, role: actor.role } });
    await expect(streamAssistantTurn({
      tenantId: actor.tenantId, userId: actor.userId, role: actor.role, conversationId: other.id, toolCtx,
      mode: 'chat', content: 'Find products outside ShelfMerch',
    })).rejects.toMatchObject({ code: 'COPILOT_NOT_FOUND' });
    expect(create).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(evaluateReservation).not.toHaveBeenCalled();
  });
});
