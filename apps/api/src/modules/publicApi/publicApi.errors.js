import { ApiError } from '../../utils/errors.js';
import { logger, safeRequestPath } from '../../config/logger.js';
import { captureException } from '../../config/observability.js';

/**
 * Public API error envelope (documented contract):
 *   { "error": { "type", "code", "message", "param"?, "details"?, "request_id" } }
 * `code` is lower snake_case and stable; `type` groups codes by HTTP class.
 */
const TYPE_BY_STATUS = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  402: 'payment_error',
  403: 'permission_error',
  404: 'not_found_error',
  409: 'conflict_error',
  413: 'invalid_request_error',
  422: 'invalid_request_error',
  429: 'rate_limit_error',
};

export class PublicApiError extends ApiError {
  /** `details`: [{ param, code, message }] for field-level problems. */
  constructor(status, code, message, { param, details } = {}) {
    super(status, message, code);
    this.param = param;
    this.publicDetails = details;
  }
}

function lowerCode(code) {
  return String(code ?? 'error').toLowerCase();
}

/** Mounted at the end of the public router so every error uses the public envelope. */
// eslint-disable-next-line no-unused-vars
export function publicApiErrorHandler(err, req, res, _next) {
  let status = 500;
  let body;
  if (err instanceof ApiError) {
    status = err.status;
    let details = err.publicDetails;
    let param = err.param;
    // validate() middleware: details = [{ in, path, message }]
    if (!details && err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      details = err.details.map((d) => ({ param: d.path || d.in, code: 'invalid', message: d.message }));
      param = details[0]?.param;
    }
    body = {
      type: TYPE_BY_STATUS[status] ?? (status >= 500 ? 'api_error' : 'invalid_request_error'),
      code: err.code === 'VALIDATION_ERROR' ? 'validation_failed' : lowerCode(err.code),
      message: err.message,
      ...(param ? { param } : {}),
      ...(details?.length ? { details } : {}),
    };
    if (err.code === 'RATE_LIMITED' && err.details?.retryAfterSec) body.retry_after = err.details.retryAfterSec;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { type: 'invalid_request_error', code: 'invalid_json', message: 'Request body must be valid JSON' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { type: 'invalid_request_error', code: 'payload_too_large', message: 'Request body is too large' };
  } else if (err?.name === 'CastError') {
    status = 404;
    body = { type: 'not_found_error', code: 'resource_missing', message: 'No such resource' };
  } else {
    logger.error({ err, path: safeRequestPath(req) }, 'Public API unhandled error');
    captureException(err, { path: safeRequestPath(req), requestId: req.requestId, tenantId: req.tenantId });
    body = { type: 'api_error', code: 'internal_error', message: 'Something went wrong on our side. Retry with the same Idempotency-Key.' };
  }
  res.status(status).json({ error: { ...body, request_id: req.requestId ?? null } });
}

export function publicNotFound(req, res) {
  res.status(404).json({
    error: {
      type: 'not_found_error',
      code: 'route_not_found',
      message: `No route for ${req.method} ${req.baseUrl}${req.path}`,
      request_id: req.requestId ?? null,
    },
  });
}
