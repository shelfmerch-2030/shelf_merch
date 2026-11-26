/** Events a client can subscribe to. `order.<status>` follows the public status contract. */
export const WEBHOOK_EVENT_TYPES = [
  'order.received',
  'order.updated',
  'order.in_production',
  'order.shipped',
  'order.delivered',
  'order.on_hold',
  'order.cancelled',
  ...[
    'catalog.product.updated',
    'catalog.product.price_changed',
    'catalog.product.availability_changed',
    'catalog.product.discontinued',
  ],
];

/**
 * Catalog events (for products the client imported) are opt-in: an endpoint with an empty event list
 * ("all events") keeps receiving only order events, so existing integrations are not flooded.
 */
export const CATALOG_EVENT_TYPES = WEBHOOK_EVENT_TYPES.filter((t) => t.startsWith('catalog.'));

/** Scheduled job on the webhook queue that turns catalog changes into events. */
export const CATALOG_SWEEP_JOB = 'catalog-change-sweep';
export const CATALOG_SWEEP_EVERY_MS = 2 * 60 * 1000;
/** Sent only by "Send test event"; endpoints always accept it. */
export const WEBHOOK_TEST_EVENT = 'webhook.test';

export const WEBHOOK_MODES = ['live', 'test'];
export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'succeeded', 'failed'];
export const MAX_ENDPOINTS_PER_TENANT = 10;

/**
 * Seconds to wait before retry N (N = attempts already made).
 * 1m, 5m, 30m, 2h, 5h, then every 10h — about 3 days of retries in total.
 */
export const RETRY_SCHEDULE_SEC = [60, 300, 1800, 7200, 18000, 36000, 36000, 36000, 36000, 36000, 36000];
export const MAX_ATTEMPTS = RETRY_SCHEDULE_SEC.length + 1;
/** An endpoint failing continuously for this long is disabled (and admins notified). */
export const DISABLE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const DELIVERY_TIMEOUT_MS = 10_000;
export const DELIVERY_LOCK_MS = 60_000;
export const RESPONSE_SNIPPET_BYTES = 1024;
/** Signed timestamps older than this should be rejected by receivers (documented). */
export const SIGNATURE_TOLERANCE_SEC = 300;

export const WEBHOOK_QUEUE = 'webhook-delivery';
export const WEBHOOK_DELIVER_JOB = 'deliver';
export const WEBHOOK_SWEEP_JOB = 'sweep';
export const WEBHOOK_SWEEP_EVERY_MS = 30_000;
export const RETENTION_DAYS = 30;
