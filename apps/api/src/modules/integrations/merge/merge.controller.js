import {
  createMergeLinkToken,
  exchangeMergePublicToken,
  listMergeConnections,
  disconnectMergeConnection,
  getOwnedMergeConnection,
} from './merge.service.js';
import { listMergeHrisEmployees } from './mergeSync.service.js';
import { getMergeSyncStatus } from './mergeSyncRun.service.js';
import { enqueueMergeHrisSync } from '../../../jobs/queues.js';
import { ApiError } from '../../../utils/errors.js';
import { handleMergeWebhook } from './mergeWebhook.js';

export async function createLinkToken(req, res) {
  const { linkToken } = await createMergeLinkToken({
    tenantId: req.tenantId,
    userId: req.user.userId,
    integration: req.body?.integration,
  });

  res.json({
    success: true,
    linkToken,
  });
}

export async function exchangeToken(req, res) {
  const { connection } = await exchangeMergePublicToken({
    tenantId: req.tenantId,
    userId: req.user.userId,
    publicToken: req.body.publicToken,
    integration: req.body.integration,
  });

  res.json({
    success: true,
    connection,
  });
}

export async function listConnections(req, res) {
  const { connections } = await listMergeConnections({ tenantId: req.tenantId });
  res.json({
    success: true,
    connections,
  });
}

export async function syncConnection(req, res) {
  const connection = await getOwnedMergeConnection({
    tenantId: req.tenantId,
    connectionId: req.params.connectionId,
  });
  if (connection.status !== 'connected' && connection.status !== 'needs_attention') {
    throw new ApiError(400, 'Merge connection is not active', 'MERGE_CONNECTION_INACTIVE');
  }
  if (!connection.encryptedAccountToken) {
    throw new ApiError(400, 'Merge account token is missing', 'MERGE_TOKEN_MISSING');
  }

  const result = await enqueueMergeHrisSync({
    tenantId: String(req.tenantId),
    connectionId: String(connection._id),
    requestedByUserId: req.user?.userId ? String(req.user.userId) : null,
    reason: 'manual',
  });

  res.status(202).json({
    success: true,
    queued: result.queued,
    alreadyQueuedOrRunning: result.alreadyQueuedOrRunning,
    connectionId: result.connectionId,
    jobId: result.jobId,
    syncStatus: result.syncStatus,
  });
}

export async function disconnectConnection(req, res) {
  const result = await disconnectMergeConnection({
    tenantId: req.tenantId,
    connectionId: req.params.connectionId,
  });

  res.json({
    success: true,
    connection: result.connection,
  });
}

export async function mergeWebhook(req, res) {
  const header = req.headers['x-merge-webhook-signature'];
  const signature = Array.isArray(header) ? header[0] : header;
  const result = await handleMergeWebhook(req.body, signature);
  res.status(200).json(result);
}

export async function getConnectionSyncRuns(req, res) {
  const status = await getMergeSyncStatus({
    tenantId: req.tenantId,
    connectionId: req.params.connectionId,
  });
  res.json({
    success: true,
    ...status,
  });
}

export async function listEmployees(req, res) {
  const result = await listMergeHrisEmployees({
    tenantId: req.tenantId,
    connectionId: req.query.connectionId,
    limit: req.query.limit,
  });
  res.json({
    success: true,
    ...result,
  });
}
