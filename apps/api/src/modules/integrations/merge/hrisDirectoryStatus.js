/**
 * Directory banner state for the current HRIS connections.
 *
 * lastSyncAt is the latest successful import. The shared sync job writes it
 * only when a run completes successfully, for initial, webhook, scheduled,
 * and manual reasons. A later failure or an in-progress run leaves it in place.
 * Disconnected rows are ignored while any current connection exists.
 */

const PROBLEM_STATUSES = new Set(['needs_attention', 'error', 'expired']);
const IN_PROGRESS_SYNC = new Set(['queued', 'syncing']);

function syncTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestSuccessfulSyncAt(connections) {
  let best = null;
  for (const connection of connections) {
    const date = syncTime(connection?.lastSyncAt);
    if (date && (!best || date > best)) best = date;
  }
  return best ? best.toISOString() : null;
}

export function deriveHrisDirectoryStatus(connections) {
  const rows = Array.isArray(connections) ? connections.filter(Boolean) : [];
  const current = rows.filter((connection) => connection.status !== 'disconnected');
  const disconnected = rows.filter((connection) => connection.status === 'disconnected');
  const syncing = current.filter((connection) =>
    IN_PROGRESS_SYNC.has(String(connection.lastSyncStatus || '')),
  );
  const connected = current.filter((connection) => connection.status === 'connected');
  const problem = current.filter((connection) => PROBLEM_STATUSES.has(connection.status));

  if (syncing.length) {
    return {
      state: 'syncing',
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(current),
      retainSnapshot: false,
    };
  }
  if (connected.length) {
    return {
      state: 'connected',
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(connected),
      retainSnapshot: false,
    };
  }
  if (problem.length) {
    return {
      state: 'error',
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(problem),
      retainSnapshot: false,
    };
  }
  if (disconnected.length) {
    return {
      state: 'disconnected',
      lastSuccessfulSyncAt: latestSuccessfulSyncAt(disconnected),
      retainSnapshot: true,
    };
  }
  return {
    state: 'empty',
    lastSuccessfulSyncAt: null,
    retainSnapshot: false,
  };
}
