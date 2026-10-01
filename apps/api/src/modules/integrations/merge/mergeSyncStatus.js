import {
  MERGE_HRIS_MODEL_IDS,
  MERGE_HRIS_SYNC_STATUS_URL,
  MERGE_SYNC_STATUS_PAGE_SIZE,
} from './merge.constants.js';
import { mergePaginateAll } from './mergeHttp.js';

const MODEL_KEYS = Object.freeze(['employee', 'employment', 'group', 'location']);

const MODEL_ID_TO_KEY = Object.freeze(
  Object.fromEntries(
    Object.entries(MERGE_HRIS_MODEL_IDS).map(([key, modelId]) => [modelId.toLowerCase(), key]),
  ),
);

function asString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emptyModels() {
  return { employee: null, employment: null, group: null, location: null };
}

/**
 * Normalize one Merge SyncStatus row.
 * Identity is model_id (hris.Employee, …), not model_name.
 */
export function normalizeMergeSyncStatusRow(row) {
  if (!row || typeof row !== 'object') return null;
  const modelId = asString(row.model_id);
  if (!modelId) return null;
  const status = asString(row.status).toUpperCase();
  const lastSyncResult = asString(row.last_sync_result).toUpperCase();
  const reason = asString(row.sync_status_reason).toUpperCase();
  return {
    modelId,
    modelName: asString(row.model_name),
    status,
    lastSyncResult,
    lastSyncStart: asDate(row.last_sync_start),
    lastSyncFinished: asDate(row.last_sync_finished),
    dataFreshAsOf: asDate(row.data_fresh_as_of),
    syncStatusReason: reason,
    isInitialSync: typeof row.is_initial_sync === 'boolean' ? row.is_initial_sync : null,
  };
}

export function modelKeyForMergeModelId(modelId) {
  return MODEL_ID_TO_KEY[asString(modelId).toLowerCase()] || null;
}

/**
 * A common model is an authoritative snapshot only when Merge reports the
 * current status and the last finished result as DONE, and the initial sync
 * is no longer running.
 * SYNCING, PAUSED, FAILED, DISABLED, PARTIALLY_SYNCED, a missing row, or
 * is_initial_sync true are not authoritative.
 */
export function isMergeModelSnapshotAuthoritative(model) {
  if (!model) return false;
  if (model.status !== 'DONE') return false;
  if (model.lastSyncResult !== 'DONE') return false;
  if (model.isInitialSync !== false) return false;
  return true;
}

export function isMergeModelSyncInProgress(model) {
  if (!model) return false;
  return model.status === 'SYNCING' || model.isInitialSync === true;
}

export function normalizeMergeSyncStatusSnapshot(snapshot) {
  const models = emptyModels();
  const listComplete = Boolean(snapshot?.complete);
  if (listComplete && Array.isArray(snapshot?.items)) {
    for (const row of snapshot.items) {
      const normalized = normalizeMergeSyncStatusRow(row);
      if (!normalized) continue;
      const key = modelKeyForMergeModelId(normalized.modelId);
      if (!key) continue;
      models[key] = normalized;
    }
  }
  return { listComplete, models };
}

/**
 * GET /hris/v1/sync-status for one linked account.
 * Follows cursors. page_size is Merge's maximum of 100.
 * Does not log the account token.
 */
export async function getMergeSyncStatus(accountToken, { logContext = {} } = {}) {
  const snapshot = await mergePaginateAll(MERGE_HRIS_SYNC_STATUS_URL, {
    accountToken,
    query: { page_size: MERGE_SYNC_STATUS_PAGE_SIZE },
    logContext: { ...logContext, model: 'sync-status' },
  });
  return normalizeMergeSyncStatusSnapshot(snapshot);
}

export function storedMergeModelSync(models, { fetchedAt = new Date(), listComplete = false } = {}) {
  const stored = { fetchedAt, listComplete: Boolean(listComplete) };
  for (const key of MODEL_KEYS) {
    const model = models?.[key];
    if (!model) {
      stored[key] = null;
      continue;
    }
    stored[key] = {
      modelId: model.modelId || '',
      modelName: model.modelName || '',
      status: model.status || '',
      lastSyncResult: model.lastSyncResult || '',
      lastSyncStart: model.lastSyncStart || null,
      lastSyncFinished: model.lastSyncFinished || null,
      dataFreshAsOf: model.dataFreshAsOf || null,
      syncStatusReason: model.syncStatusReason || '',
      ...(typeof model.isInitialSync === 'boolean' ? { isInitialSync: model.isInitialSync } : {}),
    };
  }
  return stored;
}

export function mergeModelSyncLogFields(models) {
  const employee = models?.employee;
  const employment = models?.employment;
  return {
    employeeStatus: employee?.status || null,
    employeeLastSyncResult: employee?.lastSyncResult || null,
    employeeIsInitialSync: typeof employee?.isInitialSync === 'boolean' ? employee.isInitialSync : null,
    employmentStatus: employment?.status || null,
    employmentLastSyncResult: employment?.lastSyncResult || null,
    employmentIsInitialSync:
      typeof employment?.isInitialSync === 'boolean' ? employment.isInitialSync : null,
    groupStatus: models?.group?.status || null,
    locationStatus: models?.location?.status || null,
  };
}
