import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../plugins/tenantScope.plugin.js';
import { MERGE_HRIS_INTEGRATIONS, MERGE_CONNECTION_CATEGORIES, MERGE_CONNECTION_STATUSES, MERGE_SYNC_STATUSES } from './merge.constants.js';

/**
 * One Merge common model's sync state. Separate from ShelfMerch lastSyncStatus.
 * Strings are not enum-locked so a new Merge value can be stored without failing the import.
 */
const mergeCommonModelSyncSchema = new mongoose.Schema(
  {
    modelId: { type: String, default: '' },
    modelName: { type: String, default: '' },
    status: { type: String, default: '' },
    lastSyncResult: { type: String, default: '' },
    lastSyncStart: { type: Date, default: null },
    lastSyncFinished: { type: Date, default: null },
    dataFreshAsOf: { type: Date, default: null },
    syncStatusReason: { type: String, default: '' },
    isInitialSync: { type: Boolean },
  },
  { _id: false },
);

function publicModelSync(model) {
  if (!model || (!model.modelId && !model.status && !model.lastSyncResult)) return null;
  return {
    modelId: model.modelId || null,
    status: model.status || null,
    lastSyncResult: model.lastSyncResult || null,
    lastSyncStart: model.lastSyncStart || null,
    lastSyncFinished: model.lastSyncFinished || null,
    dataFreshAsOf: model.dataFreshAsOf || null,
    syncStatusReason: model.syncStatusReason || null,
    isInitialSync: typeof model.isInitialSync === 'boolean' ? model.isInitialSync : null,
  };
}

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
    lastSyncRequestedAt: { type: Date, default: null },
    lastSyncStartedAt: { type: Date, default: null },
    lastSyncFinishedAt: { type: Date, default: null },
    /** Last successful full import. Incremental runs do not update this. */
    lastFullSyncAt: { type: Date, default: null },
    /**
     * Per-model boundary captured before the upstream read that completed.
     * The next incremental query subtracts MERGE_INCREMENTAL_OVERLAP_MS.
     */
    mergeSyncCursors: {
      employee: { type: Date, default: null },
      employment: { type: Date, default: null },
      group: { type: Date, default: null },
      location: { type: Date, default: null },
      contact: { type: Date, default: null },
    },
    lastSyncStatus: {
      type: String,
      enum: MERGE_SYNC_STATUSES,
      default: 'idle',
    },
    lastError: { type: String, default: '' },
    /**
     * ShelfMerch user chose Disconnect. Webhooks must not set this row connected again.
     * Distinct from a Merge Issue or RELINK_NEEDED (those are needs_attention).
     */
    disconnectedByUser: { type: Boolean, default: false },
    /** ONGOING, RESOLVED, or MUTED. Not a copy of the Issue webhook body. */
    mergeIssueStatus: { type: String, default: '' },
    /** Truncated, redacted error_description. No tokens or employee payloads. */
    mergeIssueError: { type: String, default: '' },
    mergeIssueLastSeenAt: { type: Date, default: null },
    /** Owner token for the in-flight sync lease. Not public. */
    syncLockToken: { type: String, default: '' },
    /** Lease expiry; a crashed process stops renewing so the next acquire can proceed. */
    syncLockUntil: { type: Date, default: null },
    /**
     * Merge's per-common-model sync with the HRIS provider.
     * Not ShelfMerch's lastSyncStatus (that is our import job).
     */
    mergeModelSync: {
      employee: { type: mergeCommonModelSyncSchema, default: undefined },
      employment: { type: mergeCommonModelSyncSchema, default: undefined },
      group: { type: mergeCommonModelSyncSchema, default: undefined },
      location: { type: mergeCommonModelSyncSchema, default: undefined },
      fetchedAt: { type: Date, default: null },
      listComplete: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

mergeConnectionSchema.plugin(tenantScopePlugin);

mergeConnectionSchema.index({ tenantId: 1, provider: 1 }, { unique: true });
// Non-unique lookup only. The partial unique index is created by
// src/scripts/merge-linked-account-unique-index.js after a duplicate audit.
mergeConnectionSchema.index({ mergeLinkedAccountId: 1 });

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
    lastSyncRequestedAt: this.lastSyncRequestedAt || null,
    lastSyncStartedAt: this.lastSyncStartedAt || null,
    lastSyncFinishedAt: this.lastSyncFinishedAt || null,
    lastSyncStatus: this.lastSyncStatus || 'idle',
    lastError: this.lastError || null,
    connectedByUserId: this.connectedByUserId ? String(this.connectedByUserId) : null,
    updatedAt: this.updatedAt,
    mergeModelSync: {
      employee: publicModelSync(this.mergeModelSync?.employee),
      employment: publicModelSync(this.mergeModelSync?.employment),
      group: publicModelSync(this.mergeModelSync?.group),
      location: publicModelSync(this.mergeModelSync?.location),
      fetchedAt: this.mergeModelSync?.fetchedAt || null,
      listComplete: Boolean(this.mergeModelSync?.listComplete),
    },
  };
};

export const MergeConnection = mongoose.model('MergeConnection', mergeConnectionSchema);
