/**
 * One classification for Merge sync failures.
 * HTTP retries (429/5xx/network) stay inside mergeHttp. This table is the BullMQ layer.
 * Unknown 4xx is not an auth failure and is not retried.
 */
const NON_RETRYABLE = new Set([
  'MERGE_CONNECTION_NOT_FOUND',
  'MERGE_CONNECTION_INACTIVE',
  'MERGE_TOKEN_MISSING',
  'MERGE_TOKEN_DECRYPT_FAILED',
  'TOKEN_DECRYPT_FAILED',
  'TOKEN_ENCRYPTION_NOT_CONFIGURED',
  'MERGE_AUTH_FAILED',
  'MERGE_NOT_CONFIGURED',
  'MERGE_SYNC_JOB_INVALID',
  'MERGE_REQUEST_REJECTED',
  'MERGE_SCOPES_DISABLED',
  'MERGE_OPTIONAL_SCOPE_DISABLED',
]);

const RETRYABLE = new Set([
  'MERGE_UNREACHABLE',
  'MERGE_RATE_LIMITED',
  'MERGE_UPSTREAM_ERROR',
  'MERGE_SYNC_IN_PROGRESS',
  'MERGE_SYNC_LOCK_LOST',
]);

export function safeMergeJobErrorCode(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (/^[A-Z0-9_]{1,80}$/.test(code)) return code;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (/^[A-Z0-9_]{1,80}$/.test(message)) return message;
  return 'SYNC_FAILED';
}

export function isMergeSyncJobRetryable(err) {
  const code = safeMergeJobErrorCode(err);
  if (NON_RETRYABLE.has(code)) return false;
  if (RETRYABLE.has(code)) return true;
  const status = Number(err?.status);
  if (status >= 400 && status < 500) return false;
  if (status >= 500) return true;
  return false;
}

/**
 * A BullMQ attempt is terminal when the error cannot be retried or the attempt
 * budget is exhausted. Earlier attempts must leave the logical sync run running.
 */
export function isMergeSyncAttemptTerminal(err, { attempt = 1, maxAttempts = 1 } = {}) {
  const attemptNo = Math.max(1, Number(attempt) || 1);
  const budget = Math.max(1, Number(maxAttempts) || 1);
  if (!isMergeSyncJobRetryable(err)) return true;
  return attemptNo >= budget;
}
