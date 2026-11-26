import { ensureRedisReady, getRedis } from '../config/redis.js';
import { IdempotencyKey } from '../modules/system/idempotencyKey.model.js';

/** §3.5 — replayed keys return the cached response for 24 hours. */
export const IDEMPOTENCY_TTL_SEC = 86400;
const PENDING_MARKER = '__pending__';
const LEASE_MS = 30 * 1000;

function leaseKeyFor(scope) {
  return buildIdempotencyKey(scope) + ':lease';
}

/**
 * A stored result is only replayed for the same request. Records without a fingerprint (routes that
 * don't opt in, or stored before this check existed) keep replaying as before.
 */
function fingerprintMismatch(stored, incoming) {
  return Boolean(stored && incoming && stored !== incoming);
}

function freshLease() {
  return JSON.stringify({ expiresAt: Date.now() + LEASE_MS });
}

export function buildIdempotencyKey({ key, tenantId, userId }) {
  const tenantPart = tenantId == null ? '_' : String(tenantId);
  const userPart = userId == null ? '_' : String(userId);
  return `idempotency:${key}:${tenantPart}:${userPart}`;
}

async function beginRedis(scope, meta = {}) {
  const redisKey = buildIdempotencyKey(scope);
  const redis = getRedis();
  const reserved = await redis.set(redisKey, PENDING_MARKER, 'NX', 'EX', IDEMPOTENCY_TTL_SEC);
  if (reserved) {
    if (meta.recover) await redis.set(leaseKeyFor(scope), freshLease(), 'EX', IDEMPOTENCY_TTL_SEC);
    return { action: 'proceed' };
  }

  const raw = await redis.get(redisKey);
  if (raw === PENDING_MARKER) {
    if (!meta.recover) return { action: 'in_flight' };
    const leaseRaw = await redis.get(leaseKeyFor(scope));
    let lease = null;
    try { lease = leaseRaw ? JSON.parse(leaseRaw) : null; } catch { lease = null; }
    if (!lease || lease.expiresAt > Date.now()) return { action: 'in_flight' };
    await redis.set(leaseKeyFor(scope), freshLease(), 'EX', IDEMPOTENCY_TTL_SEC);
    return { action: 'proceed' };
  }
  if (raw) {
    try {
      const { statusCode, response, fingerprint } = JSON.parse(raw);
      if (fingerprintMismatch(fingerprint, meta.fingerprint)) return { action: 'mismatch' };
      return { action: 'replay', statusCode, response };
    } catch {
      return { action: 'in_flight' };
    }
  }

  const retry = await redis.set(redisKey, PENDING_MARKER, 'NX', 'EX', IDEMPOTENCY_TTL_SEC);
  return retry ? { action: 'proceed' } : { action: 'in_flight' };
}

async function completeRedis(scope, { statusCode, response, fingerprint = null }) {
  const redisKey = buildIdempotencyKey(scope);
  const record = fingerprint ? { statusCode, response, fingerprint } : { statusCode, response };
  await getRedis().set(redisKey, JSON.stringify(record), 'EX', IDEMPOTENCY_TTL_SEC);
}

async function releaseRedis(scope) {
  await getRedis().del(buildIdempotencyKey(scope));
}

async function beginMongo(scope, meta) {
  const existing = await IdempotencyKey.findOne(scope);
  if (existing) {
    if (existing.response !== null) {
      if (fingerprintMismatch(existing.fingerprint, meta.fingerprint)) return { action: 'mismatch' };
      return { action: 'replay', statusCode: existing.statusCode, response: existing.response };
    }
    const expiresAt = existing.leaseExpiresAt ? new Date(existing.leaseExpiresAt).getTime() : null;
    if (!meta.recover || !expiresAt || expiresAt > Date.now()) return { action: 'in_flight' };
    const taken = await IdempotencyKey.updateOne(
      { _id: existing._id, response: null, leaseExpiresAt: existing.leaseExpiresAt },
      { $set: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } },
    );
    if (!taken.modifiedCount) return { action: 'in_flight' };
    return { action: 'proceed' };
  }

  try {
    await IdempotencyKey.create({
      ...scope,
      ...meta,
      ...(meta.recover ? { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } : {}),
    });
    return { action: 'proceed' };
  } catch (err) {
    if (err.code === 11000) return { action: 'in_flight' };
    throw err;
  }
}

async function completeMongo(scope, { statusCode, response, fingerprint = null }) {
  await IdempotencyKey.updateOne(scope, { statusCode, response, ...(fingerprint ? { fingerprint } : {}) });
}

async function releaseMongo(scope) {
  await IdempotencyKey.deleteOne(scope);
}

export async function isIdempotencyStoreReady() {
  return ensureRedisReady();
}

/** Reserve or replay an idempotency key. Falls back to Mongo when Redis is down. */
export async function beginIdempotency(scope, meta = {}) {
  if (await isIdempotencyStoreReady()) return beginRedis(scope, meta);
  return beginMongo(scope, meta);
}

export async function completeIdempotency(scope, result) {
  if (await isIdempotencyStoreReady()) return completeRedis(scope, result);
  return completeMongo(scope, result);
}

export async function releaseIdempotency(scope) {
  if (await isIdempotencyStoreReady()) return releaseRedis(scope);
  return releaseMongo(scope);
}
