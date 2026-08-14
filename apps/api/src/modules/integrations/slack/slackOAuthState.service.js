import crypto from 'node:crypto';
import { getRedis, ensureRedisReady } from '../../../config/redis.js';
import { ApiError } from '../../../utils/errors.js';

const STATE_TTL_SEC = 10 * 60;
const MEMORY_PREFIX = 'slack:oauth:';

/** Fallback when Redis is unavailable (single-process / tests). */
const memoryStates = new Map();

function pruneMemory() {
  const now = Date.now();
  for (const [key, value] of memoryStates) {
    if (value.expiresAt <= now) memoryStates.delete(key);
  }
}

/** Cryptographically secure OAuth state bound to tenant + initiating user. */
export function generateOAuthState() {
  return crypto.randomBytes(32).toString('hex');
}

export async function storeOAuthState(state, record) {
  const payload = {
    tenantId: String(record.tenantId),
    userId: String(record.userId),
    createdAt: Date.now(),
  };
  const redisOk = await ensureRedisReady(1_500);
  if (redisOk) {
    await getRedis().set(`${MEMORY_PREFIX}${state}`, JSON.stringify(payload), 'EX', STATE_TTL_SEC);
    return;
  }
  pruneMemory();
  memoryStates.set(state, { ...payload, expiresAt: Date.now() + STATE_TTL_SEC * 1000 });
}

/** One-time consume — rejects missing, expired, or replayed state. */
export async function consumeOAuthState(state) {
  if (!state || typeof state !== 'string' || state.length < 16) {
    throw new ApiError(400, 'Invalid OAuth state', 'INVALID_OAUTH_STATE');
  }

  const redisOk = await ensureRedisReady(1_500);
  if (redisOk) {
    const key = `${MEMORY_PREFIX}${state}`;
    const redis = getRedis();
    const raw = await redis.get(key);
    if (!raw) {
      throw new ApiError(400, 'Invalid or expired OAuth state', 'INVALID_OAUTH_STATE');
    }
    await redis.del(key);
    try {
      return JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Invalid OAuth state', 'INVALID_OAUTH_STATE');
    }
  }

  pruneMemory();
  const entry = memoryStates.get(state);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryStates.delete(state);
    throw new ApiError(400, 'Invalid or expired OAuth state', 'INVALID_OAUTH_STATE');
  }
  memoryStates.delete(state);
  return {
    tenantId: entry.tenantId,
    userId: entry.userId,
    createdAt: entry.createdAt,
  };
}

/** Test helper — clear in-memory OAuth states. */
export function clearMemoryOAuthStates() {
  memoryStates.clear();
}
