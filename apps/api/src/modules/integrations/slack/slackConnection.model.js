import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../plugins/tenantScope.plugin.js';
import { SLACK_CONNECTION_STATUSES } from './slack.constants.js';

/**
 * One Slack workspace install per (tenant, teamId).
 * Bot tokens are AES-256-GCM encrypted; never expose to clients.
 */
const slackConnectionSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, index: true },
    teamName: { type: String, default: '' },
    enterpriseId: { type: String, default: '' },
    enterpriseName: { type: String, default: '' },
    encryptedBotToken: { type: String, default: '' },
    botUserId: { type: String, default: '' },
    installedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    installedBySlackUserId: { type: String, default: '' },
    defaultChannelId: { type: String, default: '' },
    defaultChannelName: { type: String, default: '' },
    status: {
      type: String,
      enum: SLACK_CONNECTION_STATUSES,
      default: 'disconnected',
      index: true,
    },
    connectedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    /** @deprecated Prefer notifications.orderDispatched */
    notifyOrderDispatched: { type: Boolean, default: true },
    notifications: {
      walletApproved: { type: Boolean, default: true },
      budgetAssigned: { type: Boolean, default: true },
      lowBudget: { type: Boolean, default: true },
      pointsDistributed: { type: Boolean, default: true },
      kitsAssigned: { type: Boolean, default: true },
      orderDispatched: { type: Boolean, default: true },
      deliveryFailed: { type: Boolean, default: true },
      shopLaunched: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

slackConnectionSchema.plugin(tenantScopePlugin);

slackConnectionSchema.index({ tenantId: 1, teamId: 1 }, { unique: true });

/** Safe JSON — never includes bot tokens. */
slackConnectionSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    teamId: this.teamId,
    teamName: this.teamName || null,
    enterpriseId: this.enterpriseId || null,
    enterpriseName: this.enterpriseName || null,
    botUserId: this.botUserId || null,
    status: this.status,
    defaultChannelId: this.defaultChannelId || null,
    defaultChannelName: this.defaultChannelName || null,
    notifyOrderDispatched: this.notifyOrderDispatched !== false,
    notifications: {
      walletApproved: this.notifications?.walletApproved !== false,
      budgetAssigned: this.notifications?.budgetAssigned !== false,
      lowBudget: this.notifications?.lowBudget !== false,
      pointsDistributed: this.notifications?.pointsDistributed !== false,
      kitsAssigned: this.notifications?.kitsAssigned !== false,
      orderDispatched:
        this.notifications?.orderDispatched !== false && this.notifyOrderDispatched !== false,
      deliveryFailed: this.notifications?.deliveryFailed !== false,
      shopLaunched: this.notifications?.shopLaunched !== false,
    },
    connectedAt: this.connectedAt,
    installedByUserId: this.installedByUserId ? String(this.installedByUserId) : null,
    updatedAt: this.updatedAt,
  };
};

export const SlackConnection = mongoose.model('SlackConnection', slackConnectionSchema);
