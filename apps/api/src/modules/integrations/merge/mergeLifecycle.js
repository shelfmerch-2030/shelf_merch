import { logger } from '../../../config/logger.js';
import { MergeConnection } from './mergeConnection.model.js';
import {
  enqueueMergeConnectionSync,
  reconcileMergeConnectionHealth,
  sanitizeMergeIssueText,
} from './merge.service.js';
import { applyMergeNeedsAttention } from './mergeConnectionState.js';

const ISSUE_EVENTS = new Set(['Issue.new', 'Issue.reopened', 'Issue.resolved', 'Issue.muted']);

export function isMergeIssueEvent(event) {
  return ISSUE_EVENTS.has(String(event || ''));
}

export function isMergeLinkedLifecycleEvent(event) {
  const name = String(event || '');
  return name === 'LinkedAccount.linked' || name === 'LinkedAccount.deleted';
}

async function findHrisConnection(linkedAccountId) {
  if (!linkedAccountId) return { connection: null, ambiguous: false };
  const matches = await MergeConnection.find({
    mergeLinkedAccountId: linkedAccountId,
    category: 'hris',
  })
    .setOptions({ skipTenantGuard: true })
    .limit(2);
  if (matches.length !== 1) return { connection: null, ambiguous: matches.length > 1, matches: matches.length };
  return { connection: matches[0], ambiguous: false, matches: 1 };
}

function ignored(extra = {}) {
  return { success: true, ignored: true, queued: false, alreadyQueuedOrRunning: false, ...extra };
}

function actionable(connection) {
  return (
    connection &&
    !connection.disconnectedByUser &&
    connection.status !== 'disconnected' &&
    Boolean(connection.encryptedAccountToken)
  );
}

async function markNeedsAttention(connection, { description, code }) {
  if (!applyMergeNeedsAttention(connection, { code })) return;
  connection.mergeIssueStatus = 'ONGOING';
  connection.mergeIssueError = sanitizeMergeIssueText(description);
  connection.mergeIssueLastSeenAt = new Date();
  if (code && /^[A-Z0-9_]{1,80}$/.test(code)) connection.lastError = code;
  await connection.save();
  logger.info(
    {
      event: code || 'ISSUE',
      linkedAccountId: connection.mergeLinkedAccountId,
      connectionId: String(connection._id),
      status: connection.status,
    },
    'Merge connection needs attention',
  );
}

/**
 * Issue and Linked Account lifecycle. Does not import HRIS data.
 * Never logs webhook data (Issue text and LinkedAccount.linked tokens stay out of logs).
 */
export async function handleMergeLifecycleEvent(payload, { enqueue } = {}) {
  const event = typeof payload?.hook?.event === 'string' ? payload.hook.event : '';
  const linkedAccountId =
    typeof payload?.linked_account?.id === 'string' ? payload.linked_account.id : '';
  const category = String(payload?.linked_account?.category || '').toLowerCase();
  if (category && category !== 'hris') return ignored();
  if (!linkedAccountId) return ignored();

  const found = await findHrisConnection(linkedAccountId);
  if (found.ambiguous || !found.connection) {
    logger.info(
      { event, linkedAccountId, matches: found.matches || 0 },
      'Merge lifecycle webhook connection not resolved',
    );
    return ignored();
  }
  const connection = found.connection;

  if (event === 'Issue.new' || event === 'Issue.reopened') {
    if (!actionable(connection) && connection.status !== 'needs_attention') return ignored();
    if (connection.disconnectedByUser || connection.status === 'disconnected') return ignored();
    await markNeedsAttention(connection, { description: payload?.data?.error_description });
    return { success: true, ignored: false, queued: false, alreadyQueuedOrRunning: false };
  }

  if (event === 'Issue.muted') {
    if (connection.disconnectedByUser || connection.status === 'disconnected') return ignored();
    connection.mergeIssueStatus = 'MUTED';
    connection.mergeIssueLastSeenAt = new Date();
    await connection.save();
    logger.info(
      { event, linkedAccountId, connectionId: String(connection._id), status: connection.status },
      'Merge issue muted',
    );
    return { success: true, ignored: false, queued: false, alreadyQueuedOrRunning: false };
  }

  if (event === 'Issue.resolved') {
    if (connection.disconnectedByUser || connection.status === 'disconnected') return ignored();
    const before = connection.status;
    await reconcileMergeConnectionHealth(connection, { requireIssues: true });
    logger.info(
      {
        event,
        linkedAccountId,
        connectionId: String(connection._id),
        status: connection.status,
        previousStatus: before,
      },
      'Merge issue resolved reconciled',
    );
    return { success: true, ignored: false, queued: false, alreadyQueuedOrRunning: false };
  }

  if (event === 'LinkedAccount.deleted') {
    if (connection.disconnectedByUser) return ignored();
    connection.status = 'disconnected';
    connection.encryptedAccountToken = '';
    connection.lastError = '';
    await connection.save();
    logger.info(
      { event, linkedAccountId, connectionId: String(connection._id), status: 'disconnected' },
      'Merge linked account deleted',
    );
    return { success: true, ignored: false, queued: false, alreadyQueuedOrRunning: false };
  }

  if (event === 'LinkedAccount.linked') {
    return handleLinkedAccount(connection, payload, { enqueue });
  }

  return ignored();
}

async function handleLinkedAccount(connection, payload, { enqueue }) {
  const linkedAccountId = payload.linked_account.id;
  const relink = payload?.data?.is_relink === true;
  if (connection.disconnectedByUser) {
    logger.info(
      { event: 'LinkedAccount.linked', linkedAccountId, connectionId: String(connection._id) },
      'Merge link webhook ignored for user-disconnected connection',
    );
    return ignored();
  }

  if (!relink) {
    if (connection.status === 'disconnected' || !connection.encryptedAccountToken) return ignored();
    const neverImported = !connection.lastSyncAt && connection.lastSyncStatus !== 'success';
    if (!neverImported || connection.category !== 'hris') {
      return { success: true, ignored: false, queued: false, alreadyQueuedOrRunning: false };
    }
    const result = await enqueueMergeConnectionSync(connection, { reason: 'initial', enqueue });
    return {
      success: true,
      ignored: false,
      queued: result.queued === true,
      alreadyQueuedOrRunning: result.alreadyQueuedOrRunning === true,
    };
  }

  if (connection.status === 'disconnected' || !connection.encryptedAccountToken) return ignored();
  await reconcileMergeConnectionHealth(connection, { requireIssues: true });
  if (connection.status !== 'connected') {
    return { success: true, ignored: false, queued: false, alreadyQueuedOrRunning: false };
  }
  const reason = connection.lastSyncAt ? 'manual' : 'initial';
  const result = await enqueueMergeConnectionSync(connection, { reason, enqueue });
  logger.info(
    {
      event: 'LinkedAccount.linked',
      linkedAccountId,
      connectionId: String(connection._id),
      status: connection.status,
      reason,
    },
    'Merge relink reconciled',
  );
  return {
    success: true,
    ignored: false,
    queued: result.queued === true,
    alreadyQueuedOrRunning: result.alreadyQueuedOrRunning === true,
  };
}
