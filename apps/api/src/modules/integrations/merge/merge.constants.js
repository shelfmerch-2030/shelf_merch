/**
 * Merge directory/HRIS integration slugs (Merge Link `integration` values).
 * Google Workspace is a Merge HRIS-category product; ShelfMerch treats it as
 * sourceCategory `directory` for origin IDs and connection metadata.
 * Verified: https://docs.merge.dev/guides/merge-link/single-integration/
 */
export const MERGE_HRIS_INTEGRATIONS = Object.freeze([
  'workday',
  'bamboohr',
  'gusto',
  'keka',
  'deel',
  'ukg-pro',
  'hibob',
  'google-workspace',
]);

/** Providers stored with connection.category = directory (not classic HRIS). */
export const MERGE_DIRECTORY_PROVIDERS = Object.freeze(['google-workspace']);

export function mergeProviderSourceCategory(provider) {
  return MERGE_DIRECTORY_PROVIDERS.includes(String(provider || '').toLowerCase())
    ? 'directory'
    : 'hris';
}

/** Origin ID segment: tenantId:{segment}:{provider} */
export function mergeProviderOriginSegment(provider) {
  return mergeProviderSourceCategory(provider);
}

export const MERGE_CONNECTION_CATEGORIES = Object.freeze(['hris', 'directory']);

export const MERGE_API_BASE = 'https://api.merge.dev/api';

export const MERGE_CREATE_LINK_TOKEN_URL = `${MERGE_API_BASE}/integrations/create-link-token`;

/** HRIS public_token → account_token exchange (verified Merge docs). */
export const MERGE_ACCOUNT_TOKEN_URL = (publicToken) =>
  `${MERGE_API_BASE}/hris/v1/account-token/${encodeURIComponent(publicToken)}`;

export const MERGE_ACCOUNT_DETAILS_URL = `${MERGE_API_BASE}/hris/v1/account-details`;

/** Ongoing Issues for one Linked Account. Verified HRIS list: status=ONGOING, linked_account_id. */
export const MERGE_HRIS_ISSUES_URL = `${MERGE_API_BASE}/hris/v1/issues`;

/**
 * account-details `status` values (Merge help: Linked Account statuses).
 * COMPLETE is linked. RELINK_NEEDED and INCOMPLETE need the end user.
 * IDLE is inactivity, not a deleted or relink-required account.
 */
export const MERGE_ACCOUNT_STATUS_HEALTHY = 'COMPLETE';
export const MERGE_ACCOUNT_STATUS_RELINK = Object.freeze(['RELINK_NEEDED', 'INCOMPLETE']);

/** Unlink / delete a Merge Linked Account (verified Merge docs). */
export const MERGE_DELETE_ACCOUNT_URL = `${MERGE_API_BASE}/hris/v1/delete-account`;

export const MERGE_HRIS_EMPLOYEES_URL = `${MERGE_API_BASE}/hris/v1/employees`;
export const MERGE_HRIS_EMPLOYMENTS_URL = `${MERGE_API_BASE}/hris/v1/employments`;
/** Departments are Merge Groups with type=DEPARTMENT (no /departments endpoint). */
export const MERGE_HRIS_GROUPS_URL = `${MERGE_API_BASE}/hris/v1/groups`;
export const MERGE_HRIS_LOCATIONS_URL = `${MERGE_API_BASE}/hris/v1/locations`;

/**
 * Linked-account common-model sync state.
 * Verified: https://docs.merge.dev/merge-unified/hris/data-management/sync-status/list
 * `status` and `last_sync_result` share this enum.
 */
export const MERGE_HRIS_SYNC_STATUS_URL = `${MERGE_API_BASE}/hris/v1/sync-status`;

export const MERGE_MODEL_SYNC_STATUSES = Object.freeze([
  'SYNCING',
  'DONE',
  'FAILED',
  'DISABLED',
  'PAUSED',
  'PARTIALLY_SYNCED',
]);

/** Why `status` stays SYNCING without active provider requests. Null when progressing. */
export const MERGE_MODEL_SYNC_STATUS_REASONS = Object.freeze([
  'RATE_LIMITED',
  'WAITING_ON_OTHER_MODELS',
]);

/** Match Merge `model_id`, not display `model_name`. */
export const MERGE_HRIS_MODEL_IDS = Object.freeze({
  employee: 'hris.Employee',
  employment: 'hris.Employment',
  group: 'hris.Group',
  location: 'hris.Location',
});

export const MERGE_SYNC_STATUS_PAGE_SIZE = 100;

export const MERGE_CONNECTION_STATUSES = Object.freeze([
  'connected',
  'expired',
  'error',
  'disconnected',
  'needs_attention',
]);

export const MERGE_SYNC_STATUSES = Object.freeze([
  'idle',
  'queued',
  'syncing',
  'success',
  'failed',
]);

/** Why a Merge import job was enqueued. Phase 2 only produces `manual`. */
export const MERGE_SYNC_REASONS = Object.freeze(['manual', 'initial', 'webhook', 'scheduled']);

export const MERGE_HRIS_SYNC_QUEUE = 'merge-hris-sync';

/**
 * Per-request Merge HTTP retries (429, 5xx, network timeout).
 * The BullMQ job then retries the whole import separately, up to 3 attempts.
 * Worst case for one failing URL: 3 HTTP tries x 3 job attempts.
 * Phase 5 does not add a third retry layer. HTTP retries cover 429/5xx inside
 * a page. BullMQ still replays the job because Merge cursors are not reused
 * across attempts, so a failed page restarts that model with idempotent upserts.
 */
export const MERGE_HTTP_MAX_ATTEMPTS = 3;
export const MERGE_HTTP_RETRY_BASE_MS = 250;
export const MERGE_HTTP_RETRY_MAX_MS = 4_000;
export const MERGE_HTTP_RETRY_AFTER_MAX_MS = 8_000;

export const MERGE_SYNC_JOB_ATTEMPTS = 3;
export const MERGE_SYNC_JOB_BACKOFF_MS = 2_000;

/** Repeatable sweep on the existing merge-hris-sync queue. Not a second worker. */
export const MERGE_SCHEDULE_EVERY_MS = 6 * 60 * 60 * 1000;
/** Connections loaded per scheduled sweep page. Enqueue stays sequential. */
export const MERGE_SCHEDULE_PAGE_SIZE = 50;
export const MERGE_SCHEDULE_JOB_NAME = 'schedule';
export const MERGE_SCHEDULE_JOB_ID = 'merge-hris-schedule';

/**
 * Query this far before the stored watermark so a record written near the
 * previous boundary is fetched again. Upserts make the overlap safe.
 */
export const MERGE_INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;

/** Scheduled and webhook runs do a full authoritative import when the last full sync is older than this. */
export const MERGE_FULL_RECONCILE_MS = 24 * 60 * 60 * 1000;

/**
 * A queued/running import is operationally stale only when progress and the
 * DB lease are both older than this and BullMQ has no live job. A healthy
 * long import is not failed for duration alone.
 */
export const MERGE_SYNC_STALE_AFTER_MS = 15 * 60 * 1000;

/** Support history kept per connection. Older terminal runs are deleted when a run finishes. */
export const MERGE_SYNC_RUN_HISTORY = 20;

export const MERGE_SYNC_RUN_STATUSES = Object.freeze([
  'queued',
  'running',
  'success',
  'failed',
  'cancelled',
  'stale',
]);
