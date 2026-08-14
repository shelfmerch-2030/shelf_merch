/**
 * Slack business notification event types + preference keys (v1).
 * Single source of truth — do not scatter string literals.
 */

export const SLACK_EVENT_TYPES = Object.freeze({
  WALLET_APPROVED: 'WALLET_APPROVED',
  BUDGET_ASSIGNED: 'BUDGET_ASSIGNED',
  LOW_BUDGET: 'LOW_BUDGET',
  POINTS_DISTRIBUTED: 'POINTS_DISTRIBUTED',
  KITS_ASSIGNED: 'KITS_ASSIGNED',
  ORDER_DISPATCHED: 'ORDER_DISPATCHED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  SHOP_LAUNCHED: 'SHOP_LAUNCHED',
});

/** Preference field on SlackConnection.notifications → event type(s). */
export const SLACK_NOTIFICATION_PREFERENCE_KEYS = Object.freeze([
  'walletApproved',
  'budgetAssigned',
  'lowBudget',
  'pointsDistributed',
  'kitsAssigned',
  'orderDispatched',
  'deliveryFailed',
  'shopLaunched',
]);

export const SLACK_EVENT_TO_PREFERENCE = Object.freeze({
  WALLET_APPROVED: 'walletApproved',
  BUDGET_ASSIGNED: 'budgetAssigned',
  LOW_BUDGET: 'lowBudget',
  POINTS_DISTRIBUTED: 'pointsDistributed',
  KITS_ASSIGNED: 'kitsAssigned',
  ORDER_DISPATCHED: 'orderDispatched',
  DELIVERY_FAILED: 'deliveryFailed',
  SHOP_LAUNCHED: 'shopLaunched',
});

export const DEFAULT_SLACK_NOTIFICATIONS = Object.freeze({
  walletApproved: true,
  budgetAssigned: true,
  lowBudget: true,
  pointsDistributed: true,
  kitsAssigned: true,
  orderDispatched: true,
  deliveryFailed: true,
  shopLaunched: true,
});

export const SLACK_RECEIPT_STATUSES = Object.freeze(['pending', 'sent', 'failed']);

/** Backward-compat alias used by Phase 2. */
export const SLACK_EVENT_ORDER_DISPATCHED = SLACK_EVENT_TYPES.ORDER_DISPATCHED;