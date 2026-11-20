import { InvalidTransitionError } from '../utils/errors.js';

/**
 * §3.4 — central state machine. Direct `.status = x` assignment anywhere else
 * in the codebase is forbidden; every status change flows through
 * transitionState().
 */
const TRANSITIONS = {
  // SUPER_ADMIN_FLOW §3.5: any → issue_raised ; any → cancelled ;
  // issue_raised → replacement_processing.
  order: {
    created: ['approved', 'issue_raised', 'cancelled'],
    approved: ['in_production', 'mockup_pending', 'issue_raised', 'cancelled'],
    mockup_pending: ['in_production', 'mockup_approved', 'issue_raised', 'cancelled'],
    mockup_approved: ['in_production', 'issue_raised', 'cancelled'],
    in_production: ['qc_pending', 'issue_raised', 'cancelled'],
    qc_pending: ['packed', 'issue_raised', 'cancelled'],
    packed: ['shipped', 'issue_raised', 'cancelled'],
    shipped: ['delivered', 'issue_raised', 'cancelled'],
    delivered: ['issue_raised'],
    issue_raised: ['replacement_processing', 'cancelled'],
    replacement_processing: [],
    cancelled: [],
  },
  // SUPER_ADMIN_FLOW §3.6 — the factory floor.
  productionTask: {
    created: ['material_pending', 'mockup_pending', 'issue'],
    material_pending: ['mockup_pending', 'issue'],
    mockup_pending: ['mockup_approved', 'issue'],
    mockup_approved: ['in_production', 'issue'],
    in_production: ['printing', 'embroidery', 'qc_pending', 'issue'],
    printing: ['embroidery', 'qc_pending', 'issue'],
    embroidery: ['qc_pending', 'issue'],
    // QC fail loops the task back to in_production with a reason.
    qc_pending: ['packing', 'in_production', 'issue'],
    packing: ['ready_to_ship', 'issue'],
    ready_to_ship: ['completed', 'issue'],
    completed: [],
    issue: ['in_production', 'material_pending'],
  },
  campaign: {
    draft: ['recipients_uploaded'],
    recipients_uploaded: ['credits_allocated'],
    credits_allocated: ['approved'],
    approved: ['launched'],
    launched: ['redemption_open'],
    redemption_open: ['redemption_closed'],
    redemption_closed: ['fulfilled'],
    fulfilled: [],
  },
  wallet: {
    draft: ['wallet_created'],
    wallet_created: ['entities_added'],
    entities_added: ['budget_allocated'],
    budget_allocated: ['managers_assigned'],
    managers_assigned: ['review_pending'],
    review_pending: ['active'],
    active: [],
  },
  redemption: {
    invited: ['opened', 'order_created', 'expired'],
    opened: ['verified', 'expired'],
    verified: ['redeemed', 'expired'],
    redeemed: ['order_created'],
    order_created: [],
    expired: [],
  },
  // SUPER_ADMIN_FLOW §3.7: pending → packed → shipped → in_transit →
  // out_for_delivery → delivered ; any → delayed | rto | lost | damaged.
  shipment: {
    pending: ['packed', 'shipped', 'delayed', 'rto', 'lost', 'damaged'],
    packed: ['shipped', 'delayed', 'rto', 'lost', 'damaged'],
    shipped: ['in_transit', 'delayed', 'rto', 'lost', 'damaged'],
    in_transit: ['out_for_delivery', 'delivered', 'delayed', 'rto', 'lost', 'damaged'],
    out_for_delivery: ['delivered', 'delayed', 'rto', 'lost', 'damaged'],
    delivered: [],
    // A delayed shipment can resume its journey or end in an exception.
    delayed: ['in_transit', 'out_for_delivery', 'delivered', 'rto', 'lost', 'damaged'],
    rto: [],
    lost: [],
    damaged: [],
  },
  // SUPER_ADMIN_FLOW §3.9: open → in_progress → waiting_on_customer →
  // in_progress → resolved → closed (reopen allowed).
  supportTicket: {
    open: ['in_progress', 'closed'],
    in_progress: ['waiting_on_customer', 'resolved', 'closed'],
    waiting_on_customer: ['in_progress', 'closed'],
    resolved: ['closed', 'in_progress'],
    closed: ['in_progress'],
  },
};

export function validNextStatuses(entityType, currentStatus) {
  const machine = TRANSITIONS[entityType];
  if (!machine) throw new Error(`Unknown state machine: "${entityType}"`);
  return machine[currentStatus] ?? [];
}

export function canTransition(entityType, fromStatus, toStatus) {
  return validNextStatuses(entityType, fromStatus).includes(toStatus);
}

/**
 * Mutates `entity.status` (does NOT save — caller persists, usually within a
 * session) and returns the entity. Throws InvalidTransitionError on illegal
 * moves. `actor` is recorded on statusHistory when the schema has one.
 */
export function transitionState(entityType, entity, toStatus, actor = null, note = '') {
  const fromStatus = entity.status;
  if (!canTransition(entityType, fromStatus, toStatus)) {
    throw new InvalidTransitionError(entityType, fromStatus, toStatus);
  }
  entity.status = toStatus;
  if (Array.isArray(entity.statusHistory)) {
    entity.statusHistory.push({
      status: toStatus,
      at: new Date(),
      actorUserId: actor?.userId ?? null,
      note,
    });
  }
  return entity;
}

/**
 * Convenience for wizard-style machines (wallet setup): walks the chain from
 * the current status to `toStatus` through intermediate states, validating
 * each hop. E.g. managers_assigned -> active passes through review_pending.
 */
export function transitionThrough(entityType, entity, toStatus, actor = null) {
  const visited = new Set([entity.status]);
  while (entity.status !== toStatus) {
    const next = validNextStatuses(entityType, entity.status);
    if (next.length !== 1 && !next.includes(toStatus)) {
      throw new InvalidTransitionError(entityType, entity.status, toStatus);
    }
    const hop = next.includes(toStatus) ? toStatus : next[0];
    if (visited.has(hop)) {
      throw new InvalidTransitionError(entityType, entity.status, toStatus);
    }
    visited.add(hop);
    transitionState(entityType, entity, hop, actor);
  }
  return entity;
}
