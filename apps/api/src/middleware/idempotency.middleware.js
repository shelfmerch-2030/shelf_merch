import crypto from 'node:crypto';
import { ApiError } from '../utils/errors.js';
import { beginIdempotency, completeIdempotency, releaseIdempotency } from '../services/idempotency.service.js';

/**
 * §3.5 — replayed Idempotency-Key returns the cached response instead of
 * re-executing. Keys are scoped per tenant+user. A concurrent duplicate
 * request (key reserved but response not yet stored) gets a 409.
 *
 * `matchRequest`: the key may only be replayed for the same request (method, path, body). Reusing it for
 * a different request is a 422 instead of silently returning the earlier result — used by the public API,
 * where a client reusing a key for a new order must not get the old order back as a "success".
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}

export function requestFingerprint(req) {
  const body = req.body && typeof req.body === 'object' ? canonical(req.body) : req.body ?? null;
  return crypto.createHash('sha256').update(`${req.method} ${req.originalUrl.split('?')[0]} ${JSON.stringify(body)}`).digest('hex');
}

export function idempotency({ required = false, recover = false, matchRequest = false } = {}) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key) {
      if (required) {
        return next(new ApiError(400, 'Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED'));
      }
      return next();
    }

    // API-key requests have no user: scope by the key's ObjectId (unique across
    // collections, and storable in the Mongo fallback's ObjectId field).
    const scope = {
      key,
      tenantId: req.tenantId ?? null,
      userId: req.user?.userId ?? req.user?.apiKeyId ?? null,
    };

    const fingerprint = matchRequest ? requestFingerprint(req) : null;
    try {
      const result = await beginIdempotency(scope, {
        method: req.method,
        path: req.originalUrl,
        recover,
        ...(fingerprint ? { fingerprint } : {}),
      });

      if (result.action === 'mismatch') {
        return next(
          new ApiError(
            422,
            'This Idempotency-Key was already used for a different request. Send a new key for a new request; reuse a key only to retry the exact same request.',
            'IDEMPOTENCY_KEY_REUSED',
          ),
        );
      }

      if (result.action === 'replay') {
        res.set('Idempotent-Replay', 'true');
        return res.status(result.statusCode).json(result.response);
      }
      if (result.action === 'in_flight') {
        return next(
          new ApiError(409, 'Request with this Idempotency-Key is still in progress', 'IDEMPOTENT_REPLAY_IN_FLIGHT'),
        );
      }
    } catch (err) {
      return next(err);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      // Persist (or release) the idempotency record BEFORE flushing the
      // response, so a replay that arrives the instant the caller receives
      // this response reliably sees a completed key instead of a pending one.
      const persist =
        res.statusCode < 400
          ? completeIdempotency(scope, { statusCode: res.statusCode, response: payload, fingerprint })
          : releaseIdempotency(scope);
      persist.catch(() => {}).finally(() => originalJson(payload));
      return res;
    };
    next();
  };
}
