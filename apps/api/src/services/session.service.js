import { REFRESH_TTL_SEC } from '../config/env.js';
import { ensureRedisReady, getRedis } from '../config/redis.js';

const REFRESH_PREFIX = 'session:refresh:';
const USER_SESSIONS_PREFIX = 'session:user:';

/** Matches the refresh-token lifetime from JWT_REFRESH_TTL. */
export const SESSION_TTL_SEC = REFRESH_TTL_SEC;

export async function isSessionStoreReady() {
  return ensureRedisReady();
}

function refreshKey(tokenHash) {
  return `${REFRESH_PREFIX}${tokenHash}`;
}

function userSessionsKey(userId) {
  return `${USER_SESSIONS_PREFIX}${userId}`;
}

/** @returns {Promise<{ userId: string, ip: string, userAgent: string } | null>} */
export async function getSession(tokenHash) {
  const raw = await getRedis().get(refreshKey(tokenHash));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      userId: String(parsed.userId),
      ip: parsed.ip ?? '',
      userAgent: parsed.userAgent ?? '',
    };
  } catch {
    return null;
  }
}

export async function createSession({ userId, tokenHash, ip = '', userAgent = '' }) {
  const redis = getRedis();
  const uid = String(userId);
  const payload = JSON.stringify({ userId: uid, ip, userAgent });
  const multi = redis.multi();
  multi.set(refreshKey(tokenHash), payload, 'EX', SESSION_TTL_SEC);
  multi.sadd(userSessionsKey(uid), tokenHash);
  await multi.exec();
}

export async function revokeSession({ tokenHash, userId }) {
  const redis = getRedis();
  const multi = redis.multi();
  multi.del(refreshKey(tokenHash));
  if (userId) multi.srem(userSessionsKey(String(userId)), tokenHash);
  await multi.exec();
}

export async function revokeAllUserSessions(userId) {
  const redis = getRedis();
  const uid = String(userId);
  const key = userSessionsKey(uid);
  const hashes = await redis.smembers(key);
  if (!hashes.length) return;
  const multi = redis.multi();
  for (const hash of hashes) multi.del(refreshKey(hash));
  multi.del(key);
  await multi.exec();
}
