import {
  createMergeLinkToken,
  exchangeMergePublicToken,
  listMergeConnections,
  disconnectMergeConnection,
} from './merge.service.js';
import { listMergeHrisEmployees, syncMergeConnection } from './mergeSync.service.js';

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
  const result = await syncMergeConnection({
    tenantId: req.tenantId,
    connectionId: req.params.connectionId,
  });

  res.json({
    success: true,
    connection: result.connection,
    sync: result.sync,
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
