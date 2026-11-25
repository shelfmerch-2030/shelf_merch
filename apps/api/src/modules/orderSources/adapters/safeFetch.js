import dns from 'node:dns/promises';
import { env } from '../../../config/env.js';
import { ApiError } from '../../../utils/errors.js';
import { resolvePublicHostname } from '../../copilot/copilotExternalListingMedia.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function sourceError(status, code, message, { retryable = false } = {}) {
  const err = new ApiError(status, message, code);
  err.retryable = retryable;
  return err;
}

/**
 * Private hosts (localhost, 10.x, metadata IPs…) are only reachable outside
 * production, so a local mock API can be used in dev and tests.
 */
export function allowPrivateHosts() {
  return env.NODE_ENV !== 'production';
}

/**
 * Validate a client-supplied URL before the server calls it (SSRF guard):
 * http(s) only, https in production, and the host must resolve to public IPs
 * in production. Redirects are refused by safeFetch, so this check holds.
 */
export async function assertFetchableUrl(raw, { lookup = dns.lookup, allowPrivate = allowPrivateHosts() } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw sourceError(422, 'SOURCE_URL_INVALID', `"${raw}" is not a valid URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw sourceError(422, 'SOURCE_URL_INVALID', 'Only http(s) URLs are allowed');
  }
  if (url.username || url.password) {
    throw sourceError(422, 'SOURCE_URL_INVALID', 'Put credentials in the auth settings, not the URL');
  }
  if (allowPrivate) return url;
  if (url.protocol !== 'https:') {
    throw sourceError(422, 'SOURCE_URL_INVALID', 'Client API URLs must use https');
  }
  const addrs = await resolvePublicHostname(url.hostname, lookup);
  if (!addrs) {
    throw sourceError(422, 'SOURCE_URL_BLOCKED', `${url.hostname} does not resolve to a public address`);
  }
  return url;
}

/** fetch() for client-supplied URLs. Returns { status, headers, body (parsed JSON or text) }. */
export async function safeFetch(
  raw,
  { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
  { fetchImpl = fetch, lookup, allowPrivate } = {},
) {
  const url = await assertFetchableUrl(raw, { lookup, allowPrivate });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url.toString(), {
      method,
      headers: { Accept: 'application/json', ...headers },
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (err) {
    throw sourceError(502, 'SOURCE_UNREACHABLE', `Could not reach ${url.host}: ${err.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }

  if (res.status >= 300 && res.status < 400) {
    throw sourceError(422, 'SOURCE_REDIRECT', `${url.host} answered with a redirect; use the final URL`);
  }
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw sourceError(502, 'SOURCE_RESPONSE_TOO_LARGE', 'Client API response is larger than 5 MB; lower the page size');
  }
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }

  if (res.status === 401 || res.status === 403) {
    throw sourceError(422, 'SOURCE_AUTH_FAILED', `${url.host} rejected the credentials (HTTP ${res.status})`);
  }
  if (res.status === 404) {
    throw sourceError(422, 'SOURCE_NOT_FOUND', `${url.pathname} was not found on ${url.host}`);
  }
  if (res.status === 429 || res.status >= 500) {
    throw sourceError(502, 'SOURCE_UNAVAILABLE', `${url.host} returned HTTP ${res.status}`, { retryable: true });
  }
  if (!res.ok) {
    throw sourceError(502, 'SOURCE_ERROR', `${url.host} returned HTTP ${res.status}`);
  }
  return { status: res.status, headers: res.headers, body: parsed };
}
