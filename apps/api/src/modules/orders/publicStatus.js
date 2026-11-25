/**
 * Public order statuses — the stable contract exposed by the public Orders API
 * and its webhooks. Internal workflow states map onto these and are never
 * exposed, so production steps can change without breaking client integrations.
 */
export const PUBLIC_ORDER_STATUSES = ['received', 'in_production', 'shipped', 'delivered', 'on_hold', 'cancelled'];

const STATUS_MAP = {
  created: 'received',
  approved: 'received',
  mockup_pending: 'in_production',
  mockup_approved: 'in_production',
  in_production: 'in_production',
  qc_pending: 'in_production',
  packed: 'in_production',
  shipped: 'shipped',
  delivered: 'delivered',
  issue_raised: 'on_hold',
  replacement_processing: 'on_hold',
  cancelled: 'cancelled',
};

export function publicStatus(internal) {
  return STATUS_MAP[internal] ?? 'on_hold';
}

/** Internal statuses behind a public one (for list filters). */
export function internalStatusesFor(publicValue) {
  return Object.entries(STATUS_MAP)
    .filter(([, pub]) => pub === publicValue)
    .map(([internal]) => internal);
}
