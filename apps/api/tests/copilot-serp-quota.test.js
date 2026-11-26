import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { runSerpShoppingRecommendation } from '../src/modules/copilot/copilotSerpShopping.js';
import {
  SERP_RESERVE,
  readSerpUsage,
  reserveSerpCall,
  serpFeatureState,
  serpQuotaKeys,
} from '../src/modules/copilot/copilotSerpQuota.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';

const redisBox = vi.hoisted(() => ({
  ready: async () => false,
  client: { eval: async () => null, mget: async () => [null, null] },
}));
vi.mock('../src/config/redis.js', async (importOriginal) => ({
  ...await importOriginal(),
  ensureRedisReady: (...args) => redisBox.ready(...args),
  getRedis: () => redisBox.client,
}));

function memoryRedis() {
  const data = new Map();
  let chain = Promise.resolve();
  return {
    data,
    eval(_script, keyCount, ...args) {
      const run = () => {
        const keys = args.slice(0, keyCount);
        const argv = args.slice(keyCount);
        const amount = Number(argv[0]);
        const userCount = Number(data.get(keys[0]) || 0);
        const tenantCount = Number(data.get(keys[1]) || 0);
        if (userCount + amount > Number(argv[1])) return 2;
        if (tenantCount + amount > Number(argv[2])) return 3;
        data.set(keys[0], String(userCount + amount));
        data.set(keys[1], String(tenantCount + amount));
        return 1;
      };
      const next = chain.then(run, run);
      chain = next.then(() => undefined, () => undefined);
      return next;
    },
    mget(...keys) {
      return Promise.resolve(keys.map((key) => (data.has(key) ? String(data.get(key)) : null)));
    },
  };
}

function quotaConfig(extra = {}) {
  return {
    SERPAPI_API_KEY: 'test-key',
    EMBEDDED_COPILOT_SERPAPI_ENABLED: 'true',
    EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH: 'false',
    EMBEDDED_COPILOT_SERPAPI_DAILY_USER_LIMIT: 20,
    EMBEDDED_COPILOT_SERPAPI_DAILY_TENANT_LIMIT: 100,
    EMBEDDED_COPILOT_SERPAPI_MAX_CALLS_PER_TURN: 8,
    ...extra,
  };
}

function listing(title, link) {
  return {
    title,
    link,
    source: 'Amazon.in',
    price: '₹80',
    extracted_price: 80,
    thumbnail: 'https://m.media-amazon.com/images/mug.jpg',
  };
}

function shoppingSearch() {
  return vi.fn(async (query) => ({
    shopping_results: [listing(
      /mug/i.test(query) ? 'Ceramic Coffee Mug' : /pen/i.test(query) ? 'Gel Pen' : 'Hardcover Notebook',
      `https://www.amazon.in/dp/${encodeURIComponent(query).slice(0, 24)}`,
    )],
  }));
}

const reserveWith = (client, config) => (args) => reserveSerpCall({
  ...args, config, redis: () => client, redisReady: async () => true,
});

describe('SerpAPI shopping quotas', () => {
  it('reserves each call atomically and stops at the user limit', async () => {
    const client = memoryRedis();
    const config = quotaConfig({ EMBEDDED_COPILOT_SERPAPI_DAILY_USER_LIMIT: 20 });
    const results = await Promise.all(Array.from({ length: 25 }, () => reserveSerpCall({
      tenantId: 'tenant-a', userId: 'user-a', config, redis: () => client, redisReady: async () => true,
    })));
    expect(results.filter((result) => result === 'reserved')).toHaveLength(20);
    expect(results.filter((result) => result === 'user_limited')).toHaveLength(5);
    expect(client.data.get(serpQuotaKeys('tenant-a', 'user-a').user)).toBe('20');
    expect(SERP_RESERVE.indexOf('return 2')).toBeLessThan(SERP_RESERVE.indexOf('INCRBY'));
    expect(SERP_RESERVE).not.toMatch(/DECR/);
    expect(SERP_RESERVE).toMatch(/EXPIRE', KEYS\[1\], 172800/);
  });

  it('enforces the tenant limit without blocking another tenant', async () => {
    const client = memoryRedis();
    const config = quotaConfig({ EMBEDDED_COPILOT_SERPAPI_DAILY_USER_LIMIT: 10, EMBEDDED_COPILOT_SERPAPI_DAILY_TENANT_LIMIT: 2 });
    const reserve = (tenantId, userId) => reserveSerpCall({
      tenantId, userId, config, redis: () => client, redisReady: async () => true,
    });
    expect(await reserve('tenant-a', 'user-1')).toBe('reserved');
    expect(await reserve('tenant-a', 'user-2')).toBe('reserved');
    expect(await reserve('tenant-a', 'user-3')).toBe('tenant_limited');
    expect(await reserve('tenant-b', 'user-1')).toBe('reserved');
    expect(client.data.has(serpQuotaKeys('tenant-b', 'user-1').user)).toBe(true);
    expect(client.data.get(serpQuotaKeys('tenant-a', 'user-1').tenant)).toBe('2');
  });

  it('starts a fresh allowance at the next UTC midnight', () => {
    const before = serpQuotaKeys('tenant-a', 'user-a', new Date('2026-11-25T23:59:59.000Z'));
    const after = serpQuotaKeys('tenant-a', 'user-a', new Date('2026-11-26T00:00:00.000Z'));
    expect(before.day).toBe('2026-11-25');
    expect(after.day).toBe('2026-11-26');
    expect(before.user).not.toBe(after.user);
    expect(before.resetsAt).toBe('2026-11-26T00:00:00.000Z');
    expect(after.resetsAt).toBe('2026-11-27T00:00:00.000Z');
  });

  it('reads the same used, remaining, and reset values the UI displays', async () => {
    const client = memoryRedis();
    const config = quotaConfig();
    const now = new Date('2026-11-25T15:00:00.000Z');
    for (let i = 0; i < 3; i += 1) {
      expect(await reserveSerpCall({
        tenantId: 'tenant-a', userId: 'user-a', config, now, redis: () => client, redisReady: async () => true,
      })).toBe('reserved');
    }
    const usage = await readSerpUsage({
      tenantId: 'tenant-a', userId: 'user-a', config, now, redis: () => client, redisReady: async () => true,
    });
    expect(usage).toMatchObject({
      label: 'shopping API calls', used: 3, limit: 20, remaining: 17, resetsAt: '2026-11-26T00:00:00.000Z', state: 'ready', exhausted: false,
    });
  });

  it('stops a multi-query search when the allowance runs out and does not refund a failed call', async () => {
    const client = memoryRedis();
    const config = quotaConfig();
    let grants = 0;
    const search = shoppingSearch();
    const partial = await runSerpShoppingRecommendation({
      text: 'show me a notebook, a pen, and a mug under ₹500',
      discover: true,
      config,
      tenantId: 'tenant-a',
      userId: 'user-a',
      search,
      reserve: async () => (grants += 1) <= 1 ? 'reserved' : 'user_limited',
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(partial.products.length).toBeGreaterThan(0);
    expect(partial.content).toMatch(/shopping API allowance/);
    expect(partial.content).not.toMatch(/SerpAPI|Redis|test-key/);

    search.mockClear();
    const failed = await runSerpShoppingRecommendation({
      text: 'show me a mug under ₹250',
      discover: true,
      config,
      tenantId: 'tenant-a',
      userId: 'user-a',
      search: vi.fn(async () => ({ shopping_results: [], failure: 'unauthorized' })),
      reserve: reserveWith(client, config),
    });
    expect(failed.content).toMatch(/could not be authorized/);
    expect(failed.content).not.toMatch(/test-key|SerpAPI|Redis/);
    const usage = await readSerpUsage({
      tenantId: 'tenant-a', userId: 'user-a', config, redis: () => client, redisReady: async () => true,
    });
    expect(usage.used).toBe(1);
    expect(usage.exhausted).toBe(false);
  });

  it('caps SerpAPI calls inside one turn', async () => {
    const search = shoppingSearch();
    const result = await runSerpShoppingRecommendation({
      text: 'show me a notebook, a pen, and a mug under ₹500',
      discover: true,
      config: quotaConfig({ EMBEDDED_COPILOT_SERPAPI_MAX_CALLS_PER_TURN: 2 }),
      tenantId: 'tenant-a',
      userId: 'user-a',
      search,
      reserve: async () => 'reserved',
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.apiCalls).toBe(2);
    expect(result.content).toMatch(/limit for one message/);
  });

  it('blocks new calls as soon as the kill switch or disabled flag is observed', async () => {
    const config = quotaConfig();
    const search = vi.fn();
    expect(serpFeatureState(config)).toBe('ready');
    config.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'true';
    expect(serpFeatureState(config)).toBe('paused');
    const paused = await runSerpShoppingRecommendation({
      text: 'show me a mug under ₹250', discover: true, config, search,
    });
    expect(paused.content).toMatch(/paused/);
    config.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    config.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'false';
    const disabled = await runSerpShoppingRecommendation({
      text: 'show me a mug under ₹250', discover: true, config, search,
    });
    expect(disabled.content).toMatch(/turned off/);
    expect(search).not.toHaveBeenCalled();
  });

  it('fails closed when Redis is down and reports a timeout without refunding it', async () => {
    const search = vi.fn();
    const unavailable = await runSerpShoppingRecommendation({
      text: 'show me a mug under ₹250',
      discover: true,
      config: quotaConfig(),
      tenantId: 'tenant-a',
      userId: 'user-a',
      search,
      reserve: async () => 'unavailable',
    });
    expect(unavailable.content).toMatch(/temporarily unavailable/);
    expect(search).not.toHaveBeenCalled();

    const client = memoryRedis();
    const config = quotaConfig();
    const timedOut = await runSerpShoppingRecommendation({
      text: 'show me a mug under ₹250',
      discover: true,
      config,
      tenantId: 'tenant-a',
      userId: 'user-a',
      search: vi.fn(async () => { throw Object.assign(new Error('slow'), { name: 'TimeoutError' }); }),
      reserve: reserveWith(client, config),
    });
    expect(timedOut.content).toMatch(/took too long/);
    expect(client.data.get(serpQuotaKeys('tenant-a', 'user-a').user)).toBe('1');
  });
});

const envKeys = [
  'EMBEDDED_COPILOT_ENABLED', 'COPILOT_AI_PROVIDER', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
  'SERPAPI_API_KEY', 'EMBEDDED_COPILOT_SERPAPI_ENABLED', 'EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH',
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, env[key]]));

describe('Discover chat while shopping is unavailable', () => {
  beforeAll(connectTestDb);
  beforeEach(async () => {
    vi.restoreAllMocks();
    redisBox.ready = async () => false;
    Object.assign(env, {
      EMBEDDED_COPILOT_ENABLED: 'true',
      COPILOT_AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'synthetic-no-network',
      SERPAPI_API_KEY: 'test-key',
      EMBEDDED_COPILOT_SERPAPI_ENABLED: 'false',
      EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH: 'false',
    });
    vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue({});
    await clearTestDb();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    Object.assign(env, previousEnv);
    await disconnectTestDb();
  });

  async function ask(content, reply) {
    vi.spyOn(adapter, 'streamAnthropicCompletion').mockResolvedValue({
      text: reply, toolCalls: [], usage: { promptTokens: 10, completionTokens: 8 },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const tenant = await makeTenant();
    const { user } = await makeUser(tenant, 'company_admin');
    const conversation = await createConversation({ tenantId: tenant._id, userId: user._id });
    await streamAssistantTurn({
      tenantId: tenant._id,
      userId: user._id,
      role: 'company_admin',
      conversationId: conversation.id,
      content,
      mode: 'chat',
      lane: 'discover',
      toolCtx: buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: user._id, role: 'company_admin' } }),
      onEvent: () => {},
    });
    const saved = await CopilotConversation.findById(conversation.id).lean();
    return { content: saved.messages.at(-1).content, fetchMock };
  }

  it('keeps answering a normal question when shopping is turned off', async () => {
    const result = await ask('What is a welcome kit?', 'A welcome kit is a small set of useful gifts for a new employee.');
    expect(result.content).toMatch(/welcome kit/i);
    expect(result.content).not.toMatch(/turned off|SerpAPI|Redis/i);
    expect(result.fetchMock).not.toHaveBeenCalled();
  });

  it('explains that product search is off without calling SerpAPI', async () => {
    const result = await ask('show me a mug under ₹250', 'I can look for a mug.');
    expect(result.content).toMatch(/turned off/);
    expect(result.content).not.toMatch(/SerpAPI|Redis|test-key/);
    expect(result.fetchMock).not.toHaveBeenCalled();
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'true';
    const paused = await ask('can we just chat about the plan?', 'Yes. Tell me the team size and the budget.');
    expect(paused.content).toMatch(/Tell me the team size/);
    expect(paused.content).not.toMatch(/paused/);
    expect(paused.fetchMock).not.toHaveBeenCalled();
  });

  it('pauses a Discover product search when the kill switch is on and does not call SerpAPI', async () => {
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'true';
    const result = await ask('show me a mug under ₹250', 'I can look for a mug.');
    expect(result.content).toMatch(/paused/);
    expect(result.content).not.toMatch(/SerpAPI|Redis|test-key/);
    expect(result.fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the conversation going when Redis cannot reserve a shopping call', async () => {
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const result = await ask('show me a mug under ₹250', 'I can look for a mug.');
    expect(result.content).toMatch(/temporarily unavailable/);
    expect(result.content).not.toMatch(/Redis|SerpAPI|test-key/);
    expect(result.fetchMock).not.toHaveBeenCalled();
  });
});
