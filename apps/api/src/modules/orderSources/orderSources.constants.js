export const ORDER_SOURCE_PROVIDERS = ['shopify', 'custom_rest'];
export const ORDER_SOURCE_STATUSES = ['active', 'paused', 'error'];
export const ORDER_SOURCE_SYNC_REASONS = ['manual', 'scheduled', 'initial'];
export const ORDER_SOURCE_WEBHOOK_STATUSES = ['none', 'registered', 'failed', 'manual'];
export const EXTERNAL_ORDER_MAPPING_STATUSES = [
  'pending',
  'mapped',
  'unmapped_sku',
  'invalid_address',
  'skipped',
];
export const FULFILLMENT_PUSH_STATUSES = ['none', 'pending', 'pushed', 'failed', 'unsupported'];

export const ORDER_SOURCE_SYNC_QUEUE = 'order-source-sync';
export const ORDER_SOURCE_SCHEDULE_JOB_NAME = 'order-source-sweep';
export const ORDER_SOURCE_SCHEDULE_JOB_ID = 'order-source-sweep';
/** Job names on the order-source-sync queue besides the poll ("sync") and sweep. */
export const ORDER_SOURCE_WEBHOOK_JOB_NAME = 'webhook-order';
export const ORDER_SOURCE_FULFILLMENT_JOB_NAME = 'push-fulfillment';
/** Sweep cadence. Each connection is only polled when its own interval has passed. */
export const ORDER_SOURCE_SCHEDULE_EVERY_MS = 5 * 60 * 1000;
export const ORDER_SOURCE_DEFAULT_POLL_MIN = 15;
/** Re-read this much before the cursor on each poll; dedupe makes the overlap safe. */
export const ORDER_SOURCE_POLL_OVERLAP_MS = 10 * 60 * 1000;
/** First sync of a new connection looks back this far. */
export const ORDER_SOURCE_INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const ORDER_SOURCE_SYNC_LOCK_MS = 10 * 60 * 1000;
export const ORDER_SOURCE_JOB_ATTEMPTS = 3;
export const ORDER_SOURCE_JOB_BACKOFF_MS = 60 * 1000;
export const ORDER_SOURCE_FULFILLMENT_ATTEMPTS = 5;
/** Safety cap on pages per sync run; the next run continues from the cursor. */
export const ORDER_SOURCE_MAX_PAGES = 20;
/** Shopify order topics we subscribe to. */
export const SHOPIFY_WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED'];
/** Header a custom client must sign webhook bodies with (hex HMAC-SHA256 of the raw body). */
export const CUSTOM_WEBHOOK_SIGNATURE_HEADER = 'x-shelfmerch-signature';
