import crypto from 'node:crypto';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { resolveEncryptionKey } from '../../utils/tokenEncryption.js';
import { ApiKey, publicApiKey } from './apiKey.model.js';

const TOKEN_RE = /^smk_(live|test)_([0-9a-f]{16})_([0-9a-f]{48})$/;
const MAX_ACTIVE_KEYS = 20;

/** HMAC key derived from TOKEN_ENCRYPTION_KEY, dedicated to API key hashing. */
function hashingKey() {
  return Buffer.from(crypto.hkdfSync('sha256', resolveEncryptionKey(), Buffer.alloc(0), 'shelfmerch-api-key-v1', 32));
}

export function hashSecret(secret) {
  return crypto.createHmac('sha256', hashingKey()).update(secret).digest('hex');
}

export function parseToken(token) {
  const m = TOKEN_RE.exec(String(token ?? '').trim());
  return m ? { mode: m[1], publicId: m[2], secret: m[3] } : null;
}

/** Creates a key. Returns { apiKey (public), token } — the token is never retrievable again. */
export async function createApiKey({ tenantId, name, mode, scopes, expiresAt = null, userId = null }) {
  const active = await ApiKey.countDocuments({ tenantId, revokedAt: null });
  if (active >= MAX_ACTIVE_KEYS) {
    throw new ApiError(422, `A workspace can have at most ${MAX_ACTIVE_KEYS} active API keys`, 'API_KEY_LIMIT');
  }
  const publicId = crypto.randomBytes(8).toString('hex');
  const secret = crypto.randomBytes(24).toString('hex');
  const doc = await ApiKey.create({
    tenantId,
    name,
    mode,
    publicId,
    secretHash: hashSecret(secret),
    last4: secret.slice(-4),
    ...(scopes?.length ? { scopes } : {}),
    expiresAt,
    createdByUserId: userId,
  });
  return { apiKey: publicApiKey(doc), token: `smk_${mode}_${publicId}_${secret}` };
}

/**
 * Look up and verify a presented token. Returns the ApiKey doc or a reason
 * string. Timing-safe on the secret; same answer for unknown id and wrong secret.
 */
export async function verifyToken(token, now = new Date()) {
  const parsed = parseToken(token);
  if (!parsed) return { reason: 'malformed' };
  const doc = await ApiKey.findOne({ publicId: parsed.publicId })
    .setOptions({ skipTenantGuard: true })
    .select('+secretHash');
  const expected = Buffer.from(doc?.secretHash ?? '0'.repeat(64), 'hex');
  const given = Buffer.from(hashSecret(parsed.secret), 'hex');
  const match = crypto.timingSafeEqual(expected, given);
  if (!doc || !match || doc.mode !== parsed.mode) return { reason: 'invalid' };
  if (doc.revokedAt) return { reason: 'revoked' };
  if (doc.expiresAt && doc.expiresAt <= now) return { reason: 'expired' };
  return { apiKey: doc };
}

export async function listApiKeys({ tenantId, includeRevoked = false }) {
  const filter = { tenantId };
  if (!includeRevoked) filter.revokedAt = null;
  const rows = await ApiKey.find(filter).sort({ createdAt: -1 }).lean();
  return rows.map(publicApiKey);
}

export async function revokeApiKey({ tenantId, apiKeyId, userId = null }) {
  const doc = await ApiKey.findOneAndUpdate(
    { _id: apiKeyId, tenantId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedByUserId: userId } },
    { returnDocument: 'after' },
  );
  if (!doc) throw new NotFoundError('API key not found or already revoked');
  return publicApiKey(doc);
}

/** Record use at most once a minute per key (avoids a write per request). */
export function touchApiKey(doc, now = new Date()) {
  if (doc.lastUsedAt && now - doc.lastUsedAt < 60_000) return;
  void ApiKey.updateOne({ _id: doc._id, tenantId: doc.tenantId }, { $set: { lastUsedAt: now } }).catch(() => {});
}
