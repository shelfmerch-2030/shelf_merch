import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../plugins/tenantScope.plugin.js';
import { MERGE_SYNC_REASONS, MERGE_SYNC_RUN_STATUSES } from './merge.constants.js';

const modelProgressSchema = new mongoose.Schema(
  {
    status: { type: String, default: 'queued' },
    pagesProcessed: { type: Number, default: 0 },
    recordsProcessed: { type: Number, default: 0 },
    lastPageCompletedAt: { type: Date, default: null },
    errorCode: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * One logical HRIS import. BullMQ retries update workerAttempt on this row.
 * Pagination cursors are not stored: Merge does not guarantee they survive a later job.
 */
const mergeSyncRunSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    jobId: { type: String, default: '' },
    reason: { type: String, enum: MERGE_SYNC_REASONS, default: 'manual' },
    mode: { type: String, default: '' },
    status: { type: String, enum: MERGE_SYNC_RUN_STATUSES, default: 'running', index: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastProgressAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    retryCount: { type: Number, default: 0 },
    workerAttempt: { type: Number, default: 1 },
    rateLimitCount: { type: Number, default: 0 },
    errorCode: { type: String, default: '' },
    failedModel: { type: String, default: '' },
    models: {
      employee: { type: modelProgressSchema, default: () => ({}) },
      employment: { type: modelProgressSchema, default: () => ({}) },
      group: { type: modelProgressSchema, default: () => ({}) },
      location: { type: modelProgressSchema, default: () => ({}) },
      contact: { type: modelProgressSchema, default: () => ({}) },
    },
  },
  { timestamps: true },
);

mergeSyncRunSchema.plugin(tenantScopePlugin);
mergeSyncRunSchema.index({ tenantId: 1, connectionId: 1, startedAt: -1 });

function publicModel(model) {
  if (!model) return null;
  return {
    status: model.status || 'queued',
    pagesProcessed: model.pagesProcessed || 0,
    recordsProcessed: model.recordsProcessed || 0,
    lastPageCompletedAt: model.lastPageCompletedAt || null,
    errorCode: model.errorCode || null,
  };
}

mergeSyncRunSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    connectionId: String(this.connectionId),
    reason: this.reason,
    mode: this.mode || null,
    status: this.status,
    startedAt: this.startedAt,
    finishedAt: this.finishedAt,
    lastProgressAt: this.lastProgressAt,
    durationMs: this.durationMs,
    retryCount: this.retryCount || 0,
    workerAttempt: this.workerAttempt || 1,
    rateLimitCount: this.rateLimitCount || 0,
    errorCode: this.errorCode || null,
    failedModel: this.failedModel || null,
    models: {
      employee: publicModel(this.models?.employee),
      employment: publicModel(this.models?.employment),
      group: publicModel(this.models?.group),
      location: publicModel(this.models?.location),
      contact: publicModel(this.models?.contact),
    },
  };
};

export const MergeSyncRun = mongoose.model('MergeSyncRun', mergeSyncRunSchema);
