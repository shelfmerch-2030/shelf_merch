import { ApiError } from '../../utils/errors.js';
import { Tenant } from '../tenants/tenant.model.js';
import { applyTenantGuardrails } from '../../services/tenantGuardrails.service.js';
import { setRequestContext } from '../../config/requestContext.js';
import { touchApiKey, verifyToken } from './apiKeys.service.js';

const REASONS = {
  malformed: 'Invalid API key format — expected "Authorization: Bearer smk_live_…" or "smk_test_…"',
  invalid: 'Invalid API key',
  revoked: 'This API key has been revoked',
  expired: 'This API key has expired',
};

/**
 * Public API authentication. On success sets:
 *   req.apiKey   — the ApiKey document
 *   req.tenantId — the key's tenant
 *   req.user     — a machine principal so tenant-scoped helpers (idempotency,
 *                  audit) work unchanged: { userId: null, apiKeyId, tenantId, role: 'api_key' }
 */
export async function apiKeyAuth(req, res, next) {
  try {
    const header = String(req.headers.authorization ?? '');
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      res.set('WWW-Authenticate', 'Bearer realm="ShelfMerch API"');
      return next(new ApiError(401, 'Missing API key — send "Authorization: Bearer <key>"', 'API_KEY_MISSING'));
    }
    const { apiKey, reason } = await verifyToken(token);
    if (!apiKey) {
      res.set('WWW-Authenticate', 'Bearer realm="ShelfMerch API", error="invalid_token"');
      return next(new ApiError(401, REASONS[reason] ?? REASONS.invalid, `API_KEY_${String(reason).toUpperCase()}`));
    }

    const tenant = await Tenant.findOne({ _id: apiKey.tenantId }).select('status').lean();
    if (!tenant || ['suspended', 'archived'].includes(tenant.status)) {
      return next(new ApiError(403, 'This workspace is not active — contact ShelfMerch support', 'TENANT_INACTIVE'));
    }

    req.apiKey = apiKey;
    req.tenantId = apiKey.tenantId;
    req.user = {
      userId: null,
      apiKeyId: String(apiKey._id),
      tenantId: apiKey.tenantId,
      role: 'api_key',
      scopeType: 'tenant',
      assignedEntityIds: [],
    };
    setRequestContext({ tenantId: req.tenantId });
    touchApiKey(apiKey);

    const quota = await applyTenantGuardrails(req.tenantId);
    if (!quota.allowed) {
      res.set('Retry-After', String(quota.retryAfterSec));
      return next(new ApiError(429, 'Workspace request quota exceeded — slow down', 'RATE_LIMITED', { retryAfterSec: quota.retryAfterSec }));
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Route guard: the key must carry `scope`. */
export function requireApiScope(scope) {
  return (req, _res, next) => {
    if (!req.apiKey?.scopes?.includes(scope)) {
      return next(new ApiError(403, `This API key lacks the "${scope}" scope`, 'INSUFFICIENT_SCOPE', { scope }));
    }
    next();
  };
}
