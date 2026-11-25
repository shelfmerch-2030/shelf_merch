import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ensureRedisReady, getRedis } from '../../config/redis.js';

/** One billable SerpAPI request. Both checks and both increments happen in this script. Failed calls are not refunded. */
export const SERP_RESERVE = `
  local amount = tonumber(ARGV[1])
  local userCount = tonumber(redis.call('GET', KEYS[1]) or '0')
  local tenantCount = tonumber(redis.call('GET', KEYS[2]) or '0')
  if userCount + amount > tonumber(ARGV[2]) then return 2 end
  if tenantCount + amount > tonumber(ARGV[3]) then return 3 end
  redis.call('INCRBY', KEYS[1], amount)
  redis.call('EXPIRE', KEYS[1], 172800)
  redis.call('INCRBY', KEYS[2], amount)
  redis.call('EXPIRE', KEYS[2], 172800)
  return 1
`;

export function serpFeatureState(config = env) {
  if (config?.EMBEDDED_COPILOT_SERPAPI_ENABLED !== 'true') return 'disabled';
  if (config?.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH === 'true') return 'paused';
  if (typeof config?.SERPAPI_API_KEY !== 'string' || !config.SERPAPI_API_KEY.trim()) return 'unconfigured';
  return 'ready';
}

export function shoppingUnavailableMessage(reason) {
  switch (reason) {
    case 'disabled':
      return 'Product search is turned off right now. You can keep chatting.';
    case 'paused':
      return 'Product search is paused right now. You can keep chatting.';
    case 'unconfigured':
      return 'Product search is not set up yet. You can keep chatting.';
    case 'user_limited':
      return "You've used today's shopping API allowance. It resets at 00:00 UTC.";
    case 'tenant_limited':
      return "This workspace has used today's shopping API allowance. It resets at 00:00 UTC.";
    case 'unavailable':
      return 'Product search is temporarily unavailable. You can keep chatting.';
    case 'timeout':
      return 'Product search took too long. Please try again.';
    case 'unauthorized':
      return 'Product search could not be authorized. Please try again later.';
    case 'turn':
      return 'This reply reached the shopping API limit for one message.';
    default:
      return 'Product search is unavailable right now. You can keep chatting.';
  }
}

export function serpQuotaKeys(tenantId, userId, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const reset = new Date(`${day}T00:00:00.000Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  const prefix = `copilot:serp:{${tenantId}}:${day}`;
  return {
    day,
    user: `${prefix}:user:${userId}`,
    tenant: `${prefix}:tenant`,
    resetsAt: reset.toISOString(),
  };
}

function limits(config) {
  return {
    user: config.EMBEDDED_COPILOT_SERPAPI_DAILY_USER_LIMIT,
    tenant: config.EMBEDDED_COPILOT_SERPAPI_DAILY_TENANT_LIMIT,
  };
}

function usagePayload({ config, keys, used = 0, tenantUsed = 0, state }) {
  const cap = limits(config);
  const remaining = Math.max(0, cap.user - used);
  const tenantRemaining = Math.max(0, cap.tenant - tenantUsed);
  return {
    label: 'shopping API calls',
    used,
    limit: cap.user,
    remaining,
    tenantUsed,
    tenantLimit: cap.tenant,
    tenantRemaining,
    resetsAt: keys.resetsAt,
    state,
    exhausted: state === 'user_limited' || state === 'tenant_limited',
  };
}

export async function readSerpUsage({ tenantId, userId, config = env, now = new Date(), redisReady = ensureRedisReady, redis = getRedis } = {}) {
  const keys = serpQuotaKeys(tenantId, userId, now);
  const state = serpFeatureState(config);
  if (state !== 'ready') return usagePayload({ config, keys, state });
  if (!tenantId || !userId || !await redisReady(700)) {
    return { ...usagePayload({ config, keys, state: 'unavailable' }), remaining: null, tenantRemaining: null, exhausted: false };
  }
  let timer;
  try {
    const counts = await Promise.race([
      redis().mget(keys.user, keys.tenant),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), 1000); }),
    ]);
    if (!counts) {
      return { ...usagePayload({ config, keys, state: 'unavailable' }), remaining: null, tenantRemaining: null, exhausted: false };
    }
    const used = Number(counts[0] || 0);
    const tenantUsed = Number(counts[1] || 0);
    const cap = limits(config);
    const next = used >= cap.user ? 'user_limited' : tenantUsed >= cap.tenant ? 'tenant_limited' : 'ready';
    return usagePayload({ config, keys, used, tenantUsed, state: next });
  } catch {
    logger.info({ outcome: 'serp_usage_unavailable' }, 'Copilot shopping usage unavailable');
    return { ...usagePayload({ config, keys, state: 'unavailable' }), remaining: null, tenantRemaining: null, exhausted: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function reserveSerpCall({ tenantId, userId, amount = 1, config = env, now = new Date(), redisReady = ensureRedisReady, redis = getRedis } = {}) {
  if (!tenantId || !userId || amount < 1) return 'unavailable';
  if (!await redisReady(700)) return 'unavailable';
  const keys = serpQuotaKeys(tenantId, userId, now);
  const cap = limits(config);
  let timer;
  try {
    const result = await Promise.race([
      redis().eval(SERP_RESERVE, 2, keys.user, keys.tenant, amount, cap.user, cap.tenant),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), 1000); }),
    ]);
    if (result === 1) return 'reserved';
    if (result === 2) return 'user_limited';
    if (result === 3) return 'tenant_limited';
    return 'unavailable';
  } catch {
    logger.info({ outcome: 'serp_quota_unavailable' }, 'Copilot shopping quota unavailable');
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
