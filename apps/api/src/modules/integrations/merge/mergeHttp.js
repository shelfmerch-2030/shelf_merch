import { env, mergeConfigured } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import {
  MERGE_HTTP_MAX_ATTEMPTS,
  MERGE_HTTP_RETRY_AFTER_MAX_MS,
  MERGE_HTTP_RETRY_BASE_MS,
  MERGE_HTTP_RETRY_MAX_MS,
} from './merge.constants.js';

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

const RETRYABLE_MERGE_HTTP_CODES = new Set([
  'MERGE_UNREACHABLE',
  'MERGE_RATE_LIMITED',
  'MERGE_UPSTREAM_ERROR',
]);

function delay(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Seconds or HTTP-date. Capped so one request cannot sleep for minutes. */
export function mergeRetryAfterMs(response) {
  const raw = response?.headers?.get?.('retry-after') ?? response?.headers?.['retry-after'];
  if (raw == null || raw === '') return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(0, seconds * 1000), MERGE_HTTP_RETRY_AFTER_MAX_MS);
  }
  const at = Date.parse(String(raw));
  if (Number.isFinite(at)) {
    return Math.min(Math.max(0, at - Date.now()), MERGE_HTTP_RETRY_AFTER_MAX_MS);
  }
  return null;
}

function httpBackoffMs(attempt, retryAfterMs) {
  if (retryAfterMs != null) return retryAfterMs;
  const exp = MERGE_HTTP_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 50);
  return Math.min(exp + jitter, MERGE_HTTP_RETRY_MAX_MS);
}

function attachRetryAfter(error, response) {
  const retryAfterMs = mergeRetryAfterMs(response);
  if (retryAfterMs != null) error.retryAfterMs = retryAfterMs;
  return error;
}

/**
 * One Merge HTTP call. Never logs Authorization or X-Account-Token.
 * 429, 5xx, and network timeouts are retried up to MERGE_HTTP_MAX_ATTEMPTS.
 * 401/403 and other 4xx are not retried. BullMQ retries the whole job separately.
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
    onRateLimit,
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

  const safeLog = {
    ...logContext,
    path: target.pathname,
    method,
  };

  let lastError;
  for (let attempt = 1; attempt <= MERGE_HTTP_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
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
            ...safeLog,
            attempt,
            errMessage: err?.name === 'AbortError' ? 'timeout' : 'network',
          },
          'Merge request network failure',
        );
        throw new ApiError(502, 'Could not reach Merge', 'MERGE_UNREACHABLE');
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
            ...safeLog,
            attempt,
            mergeStatus: response.status,
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
          try {
            onRateLimit?.();
          } catch {
            // Metrics must not change the request outcome.
          }
          throw attachRetryAfter(
            new ApiError(502, 'Merge rate limit exceeded — try again shortly', 'MERGE_RATE_LIMITED'),
            response,
          );
        }
        if (response.status >= 400 && response.status < 500) {
          throw new ApiError(502, 'Merge rejected the request', 'MERGE_REQUEST_REJECTED');
        }
        throw attachRetryAfter(
          new ApiError(502, 'Merge is temporarily unavailable', 'MERGE_UPSTREAM_ERROR'),
          response,
        );
      }

      return payload;
    } catch (err) {
      lastError = err;
      const retryable = RETRYABLE_MERGE_HTTP_CODES.has(err?.code);
      if (!retryable || attempt >= MERGE_HTTP_MAX_ATTEMPTS) throw err;
      const waitMs = httpBackoffMs(attempt, err.retryAfterMs);
      logger.warn(
        { ...safeLog, attempt, waitMs, code: err.code },
        'Merge request retrying',
      );
      await delay(waitMs);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
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

/**
 * One Merge page at a time. Does not retain earlier pages.
 * `next` is an opaque cursor for the following request in this walk only.
 * Merge does not document that a cursor stays valid across a later job, so
 * callers must not persist it as a cross-job checkpoint.
 * Other query parameters stay fixed; only `cursor` changes between pages.
 */
export async function mergePaginateEach(
  url,
  { accountToken, query = {}, logContext = {}, maxPages = MERGE_PAGINATION_MAX_PAGES, onPage, onRateLimit } = {},
) {
  let cursor = null;
  let pages = 0;
  let recordsProcessed = 0;
  const pageCap = Math.max(1, Number(maxPages) || MERGE_PAGINATION_MAX_PAGES);

  while (pages < pageCap) {
    const pageNumber = pages + 1;
    const pageQuery = {
      ...query,
      page_size: query.page_size || 100,
    };
    if (cursor) pageQuery.cursor = cursor;
    else delete pageQuery.cursor;

    const payload = await mergeRequest(url, {
      accountToken,
      query: pageQuery,
      onRateLimit,
      logContext: { ...logContext, page: pageNumber, event: 'merge_page_fetch' },
    });

    if (!Array.isArray(payload?.results)) {
      logger.warn(
        { ...logContext, pageNumber, event: 'merge_page_malformed', path: new URL(url).pathname },
        'merge_page_malformed',
      );
      return {
        complete: false,
        truncated: false,
        malformed: true,
        pageCount: pages,
        recordsProcessed,
      };
    }

    const next = typeof payload.next === 'string' && payload.next ? payload.next : null;
    await onPage?.(payload.results, { pageNumber, nextCursor: next });
    pages = pageNumber;
    recordsProcessed += payload.results.length;
    logger.info(
      {
        ...logContext,
        event: 'merge_page_completed',
        pageNumber,
        records: payload.results.length,
      },
      'merge_page_completed',
    );

    if (!next) {
      return { complete: true, truncated: false, malformed: false, pageCount: pages, recordsProcessed };
    }
    cursor = next;
  }

  logger.warn({ ...logContext, pages, event: 'merge_page_capped' }, 'merge_page_capped');
  return { complete: false, truncated: true, malformed: false, pageCount: pages, recordsProcessed };
}
