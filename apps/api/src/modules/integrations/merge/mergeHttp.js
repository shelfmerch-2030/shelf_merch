import { env, mergeConfigured } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
export const MERGE_PAGINATION_MAX_PAGES = 200;

function emptyPaginateSnapshot({ items = [], pageCount = 0, truncated = false, malformed = false, complete = false } = {}) {
  return { items, complete, pageCount, truncated, malformed };
}

export function requireMergeConfigured() {
  if (!mergeConfigured()) {
    throw new ApiError(503, 'Merge integration is not configured', 'MERGE_NOT_CONFIGURED');
  }
}

/** Detect Merge "scopes disabled / endpoint inaccessible" responses (safe, no secrets). */
export function isMergeScopesDisabledPayload(payload) {
  const chunks = [];
  if (Array.isArray(payload?.non_field_errors)) {
    for (const item of payload.non_field_errors) {
      if (typeof item === 'string') chunks.push(item);
    }
  }
  if (typeof payload?.detail === 'string') chunks.push(payload.detail);
  if (typeof payload?.title === 'string') chunks.push(payload.title);
  const text = chunks.join(' ').toLowerCase();
  if (!text) return false;
  return (
    text.includes('scope') ||
    text.includes('inaccessible') ||
    text.includes('enable the relevant')
  );
}

/**
 * Low-level Merge HTTP helper. Never logs Authorization or X-Account-Token.
 */
export async function mergeRequest(
  url,
  {
    method = 'GET',
    accountToken,
    body,
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logContext = {},
  } = {},
) {
  requireMergeConfigured();

  const target = new URL(url);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === '') continue;
      target.searchParams.set(key, String(value));
    }
  }

  const headers = {
    Authorization: `Bearer ${env.MERGE_API_KEY}`,
    Accept: 'application/json',
  };
  if (accountToken) headers['X-Account-Token'] = accountToken;
  if (body != null) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(target.toString(), {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    logger.error(
      {
        ...logContext,
        errMessage: err?.name === 'AbortError' ? 'timeout' : err?.message,
      },
      'Merge request network failure',
    );
    throw new ApiError(502, 'Could not reach Merge', 'MERGE_UNREACHABLE');
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
    const scopesDisabled =
      response.status === 403 && isMergeScopesDisabledPayload(payload);

    logger.warn(
      {
        ...logContext,
        mergeStatus: response.status,
        path: target.pathname,
        scopesDisabled: scopesDisabled || undefined,
      },
      'Merge request failed',
    );

    if (scopesDisabled) {
      throw new ApiError(
        502,
        'This HRIS connection is valid, but required Merge data scopes are disabled.',
        'MERGE_SCOPES_DISABLED',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ApiError(502, 'Merge rejected credentials for this connection', 'MERGE_AUTH_FAILED');
    }
    if (response.status === 429) {
      throw new ApiError(502, 'Merge rate limit exceeded — try again shortly', 'MERGE_RATE_LIMITED');
    }
    if (response.status >= 400 && response.status < 500) {
      throw new ApiError(502, 'Merge rejected the request', 'MERGE_REQUEST_REJECTED');
    }
    throw new ApiError(502, 'Merge is temporarily unavailable', 'MERGE_UPSTREAM_ERROR');
  }

  return payload;
}

/**
 * Cursor-paginate a Merge list endpoint until `next` is empty.
 * Returns a snapshot: { items, complete, pageCount, truncated, malformed }.
 * complete=false means the caller must not treat this as a canonical HRIS snapshot
 * (do not prune local rows).
 */
export async function mergePaginateAll(
  url,
  { accountToken, query = {}, logContext = {}, maxPages = MERGE_PAGINATION_MAX_PAGES } = {},
) {
  const items = [];
  let cursor = query.cursor || null;
  let pages = 0;
  const pageCap = Math.max(1, Number(maxPages) || MERGE_PAGINATION_MAX_PAGES);

  while (pages < pageCap) {
    pages += 1;
    const pageQuery = {
      ...query,
      page_size: query.page_size || 100,
    };
    if (cursor) pageQuery.cursor = cursor;
    else delete pageQuery.cursor;

    const payload = await mergeRequest(url, {
      accountToken,
      query: pageQuery,
      logContext: { ...logContext, page: pages },
    });

    if (!Array.isArray(payload?.results)) {
      logger.warn(
        { ...logContext, pages, path: new URL(url).pathname },
        'Merge pagination page missing results array',
      );
      return emptyPaginateSnapshot({
        items,
        pageCount: pages,
        truncated: false,
        malformed: true,
        complete: false,
      });
    }

    items.push(...payload.results);

    const next = payload?.next;
    if (!next || typeof next !== 'string') {
      return emptyPaginateSnapshot({
        items,
        pageCount: pages,
        truncated: false,
        malformed: false,
        complete: true,
      });
    }
    cursor = next;
  }

  logger.warn({ ...logContext, pages }, 'Merge pagination hit page cap');
  return emptyPaginateSnapshot({
    items,
    pageCount: pages,
    truncated: true,
    malformed: false,
    complete: false,
  });
}
