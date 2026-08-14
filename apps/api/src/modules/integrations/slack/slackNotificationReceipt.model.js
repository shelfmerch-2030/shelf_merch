import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../plugins/tenantScope.plugin.js';
import { SLACK_RECEIPT_STATUSES } from './slack.events.js';

/**
 * Idempotent Slack notification claims.
 * Unique per (tenantId, eventKey) — claim before send; mark sent/failed after.
 */
const slackNotificationReceiptSchema = new mongoose.Schema(
  {
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SlackConnection',
      default: null,
    },
    eventType: { type: String, required: true, index: true },
    resourceType: { type: String, default: '' },
    resourceId: { type: String, default: '' },
    eventKey: { type: String, required: true },
    status: {
      type: String,
      enum: SLACK_RECEIPT_STATUSES,
      default: 'pending',
      index: true,
    },
    sentAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: '' },
  },
  { timestamps: true },
);

slackNotificationReceiptSchema.plugin(tenantScopePlugin);
slackNotificationReceiptSchema.index({ tenantId: 1, eventKey: 1 }, { unique: true });

export const SlackNotificationReceipt = mongoose.model(
  'SlackNotificationReceipt',
  slackNotificationReceiptSchema,
);