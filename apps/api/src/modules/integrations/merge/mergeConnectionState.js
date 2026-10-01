/**
 * Connection health and sync execution are separate.
 * These helpers are the only place that decides a health transition.
 * Callers still persist the document or the lock update.
 */

export function refuseConnectionHealthChange(connection) {
  return !connection || connection.disconnectedByUser || connection.status === 'disconnected';
}

/** Issue, relink, or auth failure. Never revives a user disconnect. */
export function applyMergeNeedsAttention(connection, { code } = {}) {
  if (refuseConnectionHealthChange(connection)) return false;
  connection.status = 'needs_attention';
  if (code && /^[A-Z0-9_]{1,80}$/.test(code)) connection.lastError = code;
  return true;
}

/**
 * Only after account details and Issues have both been verified.
 * A user disconnect stays disconnected until an explicit reconnect.
 */
export function applyMergeConnected(connection) {
  if (refuseConnectionHealthChange(connection)) return false;
  connection.status = 'connected';
  return true;
}

/** Sync success must not clear needs_attention. */
export function connectionStatusAfterSyncSuccess(status) {
  return status === 'needs_attention' ? 'needs_attention' : 'connected';
}

/**
 * Employee read is required. Group, location, and employment scopes can be
 * limited without marking the Linked Account unhealthy.
 */
export function scopeFailureChangesConnection(failedModel) {
  return failedModel === 'employee';
}
