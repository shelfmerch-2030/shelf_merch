import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import {
  RETENTION_DAYS,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_MODES,
} from './webhooks.constants.js';

const RETENTION_SEC = RETENTION_DAYS * 24 * 60 * 60;

/** A client URL that receives signed event POSTs. */
const webhookEndpointSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, maxlength: 2000 },
    description: { type: String, default: '', maxlength: 200 },
    mode: { type: String, enum: WEBHOOK_MODES, required: true },
    /** Subscribed event types; empty = all. */
    events: { type: [{ type: String, enum: WEBHOOK_EVENT_TYPES }], default: [] },
    encryptedSecret: { type: String, required: true, select: false },
    enabled: { type: Boolean, default: true },
    consecutiveFailures: { type: Number, default: 0 },
    failingSince: { type: Date, default: null },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, default: '' },
    lastSuccessAt: { type: Date, default: null },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
webhookEndpointSchema.plugin(tenantScopePlugin);
webhookEndpointSchema.index({ tenantId: 1, mode: 1, enabled: 1 });

/** One occurrence (e.g. "order 123 shipped"). Shared by all its deliveries; `publicId` is the dedupe key. */
const webhookEventSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    mode: { type: String, enum: WEBHOOK_MODES, required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    /** The full event body as sent (`data.object` is the public order). */
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: RETENTION_SEC },
  },
  { versionKey: false },
);
webhookEventSchema.plugin(tenantScopePlugin);

/** One event → one endpoint. Doubles as the retry outbox. */
const webhookDeliverySchema = new mongoose.Schema(
  {
    endpointId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookEvent', required: true },
    eventPublicId: { type: String, required: true },
    eventType: { type: String, required: true },
    status: { type: String, enum: WEBHOOK_DELIVERY_STATUSES, default: 'pending' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedUntil: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    responseStatus: { type: Number, default: null },
    responseSnippet: { type: String, default: '' },
    durationMs: { type: Number, default: null },
    error: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, expires: RETENTION_SEC },
  },
  { versionKey: false },
);
webhookDeliverySchema.plugin(tenantScopePlugin);
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
webhookDeliverySchema.index({ tenantId: 1, endpointId: 1, createdAt: -1 });

export const WebhookEndpoint = mongoose.model('WebhookEndpoint', webhookEndpointSchema);
export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
export const WebhookDelivery = mongoose.model('WebhookDelivery', webhookDeliverySchema);

export function publicEndpoint(doc) {
  const e = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(e._id),
    url: e.url,
    description: e.description,
    mode: e.mode,
    events: e.events,
    enabled: e.enabled,
    consecutiveFailures: e.consecutiveFailures,
    failingSince: e.failingSince,
    disabledAt: e.disabledAt,
    disabledReason: e.disabledReason,
    lastSuccessAt: e.lastSuccessAt,
    createdAt: e.createdAt,
  };
}
