import { slackConfigured } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export function requireSlackConfigured() {
  if (!slackConfigured()) {
    throw new ApiError(503, 'Slack integration is not configured', 'SLACK_NOT_CONFIGURED');
  }
}

/**
 * Map Slack Web API `error` strings to safe ApiError codes.
 * Never includes tokens or raw payloads in the message.
 */
export function mapSlackApiError(slackError, { operation = 'request' } = {}) {
  const code = typeof slackError === 'string' ? slackError : '';
  switch (code) {
    case 'invalid_auth':
    case 'not_authed':
    case 'account_inactive':
    case 'token_revoked':
    case 'token_expired':
      return new ApiError(502, 'Slack rejected credentials for this connection', 'SLACK_AUTH_FAILED');
    case 'not_in_channel':
      return new ApiError(
        400,
        'Slack could not post to that channel. Try another public channel, or reconnect Slack if permissions changed.',
        'SLACK_NOT_IN_CHANNEL',
      );
    case 'channel_not_found':
      return new ApiError(400, 'That Slack channel was not found', 'SLACK_CHANNEL_NOT_FOUND');
    case 'missing_scope':
      return new ApiError(
        502,
        'Slack app is missing a required permission scope',
        'SLACK_MISSING_SCOPE',
      );
    case 'ratelimited':
    case 'rate_limited':
      return new ApiError(429, 'Slack rate limit exceeded — try again shortly', 'SLACK_RATE_LIMITED');
    case 'access_denied':
      return new ApiError(400, 'Slack authorization was denied', 'SLACK_ACCESS_DENIED');
    default:
      return new ApiError(502, `Slack ${operation} failed`, 'SLACK_API_ERROR');
  }
}

export function isSlackAuthErrorCode(code) {
  return (
    code === 'SLACK_AUTH_FAILED' ||
    code === 'invalid_auth' ||
    code === 'not_authed' ||
    code === 'account_inactive' ||
    code === 'token_revoked' ||
    code === 'token_expired'
  );
}

/**
 * Low-level Slack Web API helper. Never logs Authorization or tokens.
 * Slack returns HTTP 200 with `{ ok: false, error }` for most failures.
 */
export async function slackRequest(
  url,
  {
    method = 'GET',
    token,
    body,
    form,
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logContext = {},
    requireConfigured = true,
  } = {},
) {
  if (requireConfigured) requireSlackConfigured();

  const target = new URL(url);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === '') continue;
      target.searchParams.set(key, String(value));
    }
  }

  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payloadBody;
  if (form && typeof form === 'object') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payloadBody = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (value == null) continue;
      payloadBody.set(key, String(value));
    }
  } else if (body != null) {
    headers['Content-Type'] = 'application/json';
    payloadBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(target.toString(), {
      method,
      headers,
      body: payloadBody,
      signal: controller.signal,
    });
  } catch (err) {
    logger.error(
      {
        ...logContext,
        errMessage: err?.name === 'AbortError' ? 'timeout' : err?.message,
      },
      'Slack request network failure',
    );
    throw new ApiError(502, 'Could not reach Slack', 'SLACK_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    logger.warn(
      { ...logContext, slackStatus: response.status, path: target.pathname },
      'Slack HTTP request failed',
    );
    if (response.status === 429) {
      throw new ApiError(429, 'Slack rate limit exceeded — try again shortly', 'SLACK_RATE_LIMITED');
    }
    throw new ApiError(502, 'Slack is temporarily unavailable', 'SLACK_UPSTREAM_ERROR');
  }

  if (payload && payload.ok === false) {
    const slackError = typeof payload.error === 'string' ? payload.error : 'unknown_error';
    logger.warn(
      { ...logContext, slackError, path: target.pathname },
      'Slack API returned ok:false',
    );
    throw mapSlackApiError(slackError, { operation: target.pathname });
  }

  return payload;
}
