import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../plugins/tenantScope.plugin.js';
import { MERGE_HRIS_INTEGRATIONS, MERGE_CONNECTION_CATEGORIES, MERGE_CONNECTION_STATUSES, MERGE_SYNC_STATUSES } from './merge.constants.js';

/**
 * One Merge HRIS Linked Account per (tenant, provider).
 * Account tokens are AES-256-GCM encrypted; never expose to clients.
 */
const mergeConnectionSchema = new mongoose.Schema(
  {
    connectedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    provider: {
      type: String,
      enum: MERGE_HRIS_INTEGRATIONS,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: MERGE_CONNECTION_CATEGORIES,
      default: 'hris',
    },
    mergeLinkedAccountId: { type: String, default: '' },
    integrationName: { type: String, default: '' },
    /** Merge end_user_origin_id — unique per provider so multiple can coexist. */
    endUserOriginId: { type: String, default: '' },
    endUserOrganizationName: { type: String, default: '' },
    encryptedAccountToken: { type: String, default: '' },
    status: {
      type: String,
      enum: MERGE_CONNECTION_STATUSES,
      default: 'disconnected',
      index: true,
    },
    connectedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    lastSyncStatus: {
      type: String,
      enum: MERGE_SYNC_STATUSES,
      default: 'idle',
    },
    lastError: { type: String, default: '' },
    /** Owner token for the in-flight sync lease. Not public. */
    syncLockToken: { type: String, default: '' },
    /** Lease expiry; a crashed process stops renewing so the next acquire can proceed. */
    syncLockUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

mergeConnectionSchema.plugin(tenantScopePlugin);

mergeConnectionSchema.index({ tenantId: 1, provider: 1 }, { unique: true });

/** Safe JSON — never includes account tokens. */
mergeConnectionSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    provider: this.provider,
    category: this.category || 'hris',
    status: this.status,
    integrationName: this.integrationName || null,
    endUserOrganizationName: this.endUserOrganizationName || null,
    mergeLinkedAccountId: this.mergeLinkedAccountId || null,
    connectedAt: this.connectedAt,
    lastSyncAt: this.lastSyncAt,
    lastSyncStatus: this.lastSyncStatus || 'idle',
    lastError: this.lastError || null,
    connectedByUserId: this.connectedByUserId ? String(this.connectedByUserId) : null,
    updatedAt: this.updatedAt,
  };
};

export const MergeConnection = mongoose.model('MergeConnection', mergeConnectionSchema);
