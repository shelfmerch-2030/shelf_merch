import { randomUUID } from 'node:crypto';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { encryptToken, decryptToken } from '../../../utils/tokenEncryption.js';
import { User } from '../../users/user.model.js';
import { Tenant } from '../../tenants/tenant.model.js';
import {
  MERGE_CREATE_LINK_TOKEN_URL,
  MERGE_ACCOUNT_TOKEN_URL,
  MERGE_ACCOUNT_DETAILS_URL,
  MERGE_DELETE_ACCOUNT_URL,
  MERGE_HRIS_ISSUES_URL,
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_ACCOUNT_STATUS_HEALTHY,
  MERGE_ACCOUNT_STATUS_RELINK,
  MERGE_HRIS_INTEGRATIONS,
  mergeProviderOriginSegment,
  mergeProviderSourceCategory,
} from './merge.constants.js';
import { MergeConnection } from './mergeConnection.model.js';
import { mergeRequest, requireMergeConfigured } from './mergeHttp.js';
import { enqueueMergeHrisSync } from '../../../jobs/queues.js';
import { applyMergeConnected, applyMergeNeedsAttention } from './mergeConnectionState.js';

async function resolveEndUserContext({ tenantId, userId }) {
  if (!tenantId) {
    throw new ApiError(400, 'Organization context is required', 'TENANT_REQUIRED');
  }
  if (!userId) {
    throw new ApiError(401, 'Authentication required', 'UNAUTHORIZED');
  }

  const [tenant, user] = await Promise.all([
    Tenant.findById(tenantId).select('name').lean(),
    User.findById(userId).select('email').lean(),
  ]);

  if (!tenant) {
    throw new ApiError(404, 'Organization not found', 'TENANT_NOT_FOUND');
  }
  const organizationName = String(tenant.name || '').trim();
  if (!organizationName) {
    throw new ApiError(400, 'Organization name is missing', 'TENANT_NAME_MISSING');
  }

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }
  const email = String(user.email || '').trim().toLowerCase();
  if (!email) {
    throw new ApiError(400, 'User email is missing', 'USER_EMAIL_MISSING');
  }

  return {
    endUserOrganizationName: organizationName,
    endUserEmailAddress: email,
  };
}

/**
 * Merge allows one Linked Account per (end_user_origin_id, category).
 * Use a distinct origin id per provider so tenants can connect Deel + Workday + Google Workspace.
 * Directory providers (google-workspace) use tenantId:directory:{slug}; HRIS use :hris:.
 * Merge Link still passes categories:['hris'] because Google Workspace is an HRIS product in Merge.
 */
export function buildMergeEndUserOriginId({ tenantId, integration, existingOriginId, hasLegacyConnection }) {
  if (existingOriginId) return existingOriginId;
  // Legacy connections were created with bare tenantId before multi-HRIS support.
  if (hasLegacyConnection) return String(tenantId);
  if (integration) {
    const segment = mergeProviderOriginSegment(integration);
    return `${tenantId}:${segment}:${integration}`;
  }
  return `${tenantId}:hris:${randomUUID()}`;
}

/** True when a stored or Merge-returned origin id belongs to this ShelfMerch tenant. */
export function mergeOriginBelongsToTenant(originId, tenantId) {
  const origin = String(originId || '').trim();
  const id = String(tenantId || '');
  if (!origin || !id) return false;
  if (origin === id) return true;
  return origin.startsWith(`${id}:`);
}

/** Short, secret-free Issue text. Not the webhook body. */
export function sanitizeMergeIssueText(value) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const redacted = text
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
  return redacted.slice(0, 160);
}

/**
 * Create a Merge Link `link_token` for the authenticated ShelfMerch tenant.
 */
export async function createMergeLinkToken({ tenantId, userId, integration }) {
  requireMergeConfigured();

  const endUser = await resolveEndUserContext({ tenantId, userId });

  let existing = null;
  if (integration) {
    existing = await MergeConnection.findOne({ tenantId, provider: integration })
      .select('endUserOriginId status')
      .lean();
  }

  const endUserOriginId = buildMergeEndUserOriginId({
    tenantId,
    integration: integration || null,
    existingOriginId: existing?.endUserOriginId || '',
    hasLegacyConnection: Boolean(existing && !existing.endUserOriginId),
  });

  const body = {
    end_user_origin_id: endUserOriginId,
    end_user_organization_name: endUser.endUserOrganizationName,
    end_user_email_address: endUser.endUserEmailAddress,
    categories: ['hris'],
  };
  if (integration) body.integration = integration;

  logger.info(
    {
      organizationId: String(tenantId),
      endUserOriginId,
      integration: integration || null,
    },
    'Creating Merge link token',
  );

  const payload = await mergeRequest(MERGE_CREATE_LINK_TOKEN_URL, {
    method: 'POST',
    body,
    logContext: { organizationId: String(tenantId), integration: integration || null },
  });

  const linkToken = payload?.link_token;
  if (!linkToken || typeof linkToken !== 'string') {
    throw new ApiError(502, 'Merge returned an unusable link token', 'MERGE_LINK_TOKEN_INVALID');
  }

  return { linkToken };
}

function normalizeProviderSlug(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase();
  if (MERGE_HRIS_INTEGRATIONS.includes(slug)) return slug;
  if (fallback && MERGE_HRIS_INTEGRATIONS.includes(fallback)) return fallback;
  return '';
}

/**
 * Exchange Merge public_token → account_token, encrypt, and upsert connection.
 */
export async function exchangeMergePublicToken({
  tenantId,
  userId,
  publicToken,
  integration,
}) {
  requireMergeConfigured();

  if (integration && !MERGE_HRIS_INTEGRATIONS.includes(integration)) {
    throw new ApiError(400, 'Unsupported integration', 'UNSUPPORTED_INTEGRATION');
  }

  logger.info(
    { organizationId: String(tenantId), integration: integration || null },
    'Exchanging Merge public token',
  );

  const tokenPayload = await mergeRequest(MERGE_ACCOUNT_TOKEN_URL(publicToken), {
    method: 'GET',
    logContext: {
      organizationId: String(tenantId),
      integration: integration || null,
      action: 'account-token',
    },
  });

  const accountToken = tokenPayload?.account_token;
  if (!accountToken || typeof accountToken !== 'string') {
    throw new ApiError(502, 'Merge returned no account token', 'MERGE_ACCOUNT_TOKEN_MISSING');
  }

  const tokenSlugRaw =
    typeof tokenPayload?.integration === 'string'
      ? tokenPayload.integration
      : tokenPayload?.integration?.slug;

  if (
    integration &&
    tokenSlugRaw &&
    typeof tokenSlugRaw === 'string' &&
    MERGE_HRIS_INTEGRATIONS.includes(tokenSlugRaw.toLowerCase()) &&
    tokenSlugRaw.toLowerCase() !== integration
  ) {
    logger.warn(
      {
        organizationId: String(tenantId),
        integration,
        mergeSlug: tokenSlugRaw.toLowerCase(),
      },
      'Merge provider slug mismatch',
    );
    throw new ApiError(
      400,
      'Linked provider does not match the selected integration',
      'MERGE_PROVIDER_MISMATCH',
    );
  }

  let accountDetails = null;
  try {
    accountDetails = await mergeRequest(MERGE_ACCOUNT_DETAILS_URL, {
      method: 'GET',
      accountToken,
      logContext: {
        organizationId: String(tenantId),
        integration: integration || null,
        action: 'account-details',
      },
    });
  } catch (err) {
    logger.warn(
      {
        organizationId: String(tenantId),
        integration: integration || null,
        code: err?.code,
      },
      'Merge account-details unavailable after token exchange',
    );
  }

  if (
    integration &&
    accountDetails?.integration_slug &&
    MERGE_HRIS_INTEGRATIONS.includes(String(accountDetails.integration_slug).toLowerCase()) &&
    String(accountDetails.integration_slug).toLowerCase() !== integration
  ) {
    throw new ApiError(
      400,
      'Linked provider does not match the selected integration',
      'MERGE_PROVIDER_MISMATCH',
    );
  }

  const provider = normalizeProviderSlug(
    accountDetails?.integration_slug || tokenSlugRaw,
    integration,
  );
  if (!provider || !MERGE_HRIS_INTEGRATIONS.includes(provider)) {
    throw new ApiError(
      400,
      'Could not determine a supported Merge directory provider',
      'MERGE_PROVIDER_UNKNOWN',
    );
  }

  const encryptedAccountToken = encryptToken(accountToken);
  const now = new Date();
  const category = mergeProviderSourceCategory(provider);
  const linkedAccountId = String(accountDetails?.id || tokenPayload?.id || '').trim();

  const existing = await MergeConnection.findOne({ tenantId, provider });
  const reportedOrigin = String(accountDetails?.end_user_origin_id || '').trim();
  if (reportedOrigin && !mergeOriginBelongsToTenant(reportedOrigin, tenantId)) {
    throw new ApiError(
      400,
      'Linked account does not belong to this organization',
      'MERGE_ORIGIN_MISMATCH',
    );
  }
  if (existing?.endUserOriginId && reportedOrigin && reportedOrigin !== existing.endUserOriginId) {
    throw new ApiError(
      400,
      'Linked account origin does not match this connection',
      'MERGE_ORIGIN_MISMATCH',
    );
  }

  if (linkedAccountId) {
    const holders = await MergeConnection.find({ mergeLinkedAccountId: linkedAccountId })
      .setOptions({ skipTenantGuard: true })
      .select('_id tenantId provider')
      .limit(3);
    const conflict = holders.find(
      (row) => String(row.tenantId) !== String(tenantId) || row.provider !== provider,
    );
    if (conflict) {
      throw new ApiError(
        409,
        'This Merge Linked Account is already connected',
        'MERGE_LINKED_ACCOUNT_AMBIGUOUS',
      );
    }
  }

  const endUserOriginId =
    reportedOrigin ||
    existing?.endUserOriginId ||
    buildMergeEndUserOriginId({
      tenantId,
      integration: provider,
      existingOriginId: '',
      hasLegacyConnection: Boolean(existing && !existing.endUserOriginId),
    });

  const mergeStatus = String(accountDetails?.status || '').toUpperCase();
  const needsRelink = MERGE_ACCOUNT_STATUS_RELINK.includes(mergeStatus);
  const doc = await MergeConnection.findOneAndUpdate(
    { tenantId, provider },
    {
      $set: {
        connectedByUserId: userId,
        provider,
        category,
        mergeLinkedAccountId: linkedAccountId,
        integrationName: String(
          accountDetails?.integration || tokenPayload?.integration?.name || provider,
        ),
        endUserOriginId,
        endUserOrganizationName: String(accountDetails?.end_user_organization_name || ''),
        encryptedAccountToken,
        status: needsRelink ? 'needs_attention' : 'connected',
        disconnectedByUser: false,
        connectedAt: existing?.connectedAt || now,
        lastError: needsRelink ? mergeStatus : '',
        ...(needsRelink
          ? {
              mergeIssueStatus: 'ONGOING',
              mergeIssueError: sanitizeMergeIssueText(accountDetails?.status_detail),
              mergeIssueLastSeenAt: now,
            }
          : {
              mergeIssueStatus: '',
              mergeIssueError: '',
            }),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(
    {
      organizationId: String(tenantId),
      integration: provider,
      connectionId: String(doc._id),
      status: doc.status,
    },
    'Merge connection stored',
  );

  let queued = null;
  if (category === 'hris' && doc.status === 'connected' && doc.encryptedAccountToken) {
    const reason = doc.lastSyncAt ? 'manual' : 'initial';
    queued = await enqueueMergeConnectionSync(doc, { reason, requestedByUserId: userId });
  }

  const fresh = await MergeConnection.findOne({ _id: doc._id, tenantId });
  return { connection: (fresh || doc).toPublicJSON(), sync: queued };
}

/**
 * One background import for this connection. Deduped by the existing job id.
 * Queue failure does not undo a stored connection and does not import inline.
 */
export async function enqueueMergeConnectionSync(connection, { reason, requestedByUserId = null, enqueue = enqueueMergeHrisSync } = {}) {
  try {
    return await enqueue({
      tenantId: String(connection.tenantId),
      connectionId: String(connection._id),
      requestedByUserId: requestedByUserId ? String(requestedByUserId) : null,
      reason,
    });
  } catch (err) {
    logger.warn(
      {
        organizationId: String(connection.tenantId),
        connectionId: String(connection._id),
        reason,
        code: err?.code || err?.name,
      },
      'Merge connection sync was not queued',
    );
    return { queued: false, alreadyQueuedOrRunning: false, queueError: err?.code || 'MERGE_QUEUE_UNAVAILABLE' };
  }
}

async function rememberIssue(connection, { status, description, code }) {
  connection.mergeIssueStatus = status || connection.mergeIssueStatus || '';
  if (description != null) connection.mergeIssueError = sanitizeMergeIssueText(description);
  connection.mergeIssueLastSeenAt = new Date();
  if (code && /^[A-Z0-9_]{1,80}$/.test(code)) connection.lastError = code;
  await connection.save();
  return connection;
}

function blockingIssues(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.filter(
    (issue) => String(issue?.status || 'ONGOING').toUpperCase() === 'ONGOING' && issue?.is_muted !== true,
  );
}

/**
 * Canonical connection-health check. Does not import employees.
 * User-disconnected and deleted rows are never moved back to connected.
 * Rate limits and upstream 5xx do not change connection status.
 *
 * requireIssues is retained for callers. Any Issues API failure leaves
 * needs_attention in place. A connection is restored to connected only when
 * account details are healthy and the Issues list succeeds with no blocking issue.
 */
export async function reconcileMergeConnectionHealth(connection, { requireIssues = false } = {}) {
  if (!connection) return connection;
  if (connection.disconnectedByUser || connection.status === 'disconnected') return connection;
  if (connection.status !== 'needs_attention' && !requireIssues) return connection;
  if (!connection.encryptedAccountToken) return connection;

  let accountToken;
  try {
    accountToken = decryptToken(connection.encryptedAccountToken);
  } catch {
    return connection;
  }

  const logContext = {
    organizationId: String(connection.tenantId),
    connectionId: String(connection._id),
  };

  let details;
  try {
    details = await mergeRequest(MERGE_ACCOUNT_DETAILS_URL, {
      method: 'GET',
      accountToken,
      logContext: { ...logContext, action: 'reconcile-account-details' },
    });
  } catch (err) {
    if (err?.code === 'MERGE_AUTH_FAILED') {
      applyMergeNeedsAttention(connection, { code: 'MERGE_AUTH_FAILED' });
      await rememberIssue(connection, { status: 'ONGOING', code: 'MERGE_AUTH_FAILED' });
      return connection;
    }
    logger.warn({ ...logContext, code: err?.code }, 'Merge connection reconcile skipped');
    return connection;
  }

  const mergeStatus = String(details?.status || '').toUpperCase();
  if (MERGE_ACCOUNT_STATUS_RELINK.includes(mergeStatus)) {
    applyMergeNeedsAttention(connection, { code: mergeStatus });
    await rememberIssue(connection, {
      status: 'ONGOING',
      description: details?.status_detail,
      code: mergeStatus,
    });
    return connection;
  }
  if (mergeStatus !== MERGE_ACCOUNT_STATUS_HEALTHY) {
    return connection;
  }

  let blocking = null;
  try {
    const issues = await mergeRequest(MERGE_HRIS_ISSUES_URL, {
      method: 'GET',
      accountToken,
      query: {
        linked_account_id: connection.mergeLinkedAccountId || undefined,
        status: 'ONGOING',
        page_size: 20,
        include_muted: 'false',
      },
      logContext: { ...logContext, action: 'reconcile-issues' },
    });
    blocking = blockingIssues(issues);
  } catch (err) {
    if (err?.code === 'MERGE_AUTH_FAILED') {
      applyMergeNeedsAttention(connection, { code: 'MERGE_AUTH_FAILED' });
      await rememberIssue(connection, { status: 'ONGOING', code: 'MERGE_AUTH_FAILED' });
      return connection;
    }
    if (
      err?.code === 'MERGE_RATE_LIMITED' ||
      err?.code === 'MERGE_UPSTREAM_ERROR' ||
      err?.code === 'MERGE_UNREACHABLE'
    ) {
      logger.warn({ ...logContext, code: err.code }, 'Merge issues reconcile skipped');
      return connection;
    }
    logger.warn({ ...logContext, code: err?.code }, 'Merge issues reconcile incomplete');
    return connection;
  }

  if (blocking.length > 0) {
    applyMergeNeedsAttention(connection);
    await rememberIssue(connection, {
      status: 'ONGOING',
      description: blocking[0]?.error_description,
    });
    return connection;
  }

  if (connection.lastError === 'MERGE_SCOPES_DISABLED') {
    try {
      await mergeRequest(MERGE_HRIS_EMPLOYEES_URL, {
        method: 'GET',
        accountToken,
        query: { page_size: 1 },
        logContext: { ...logContext, action: 'reconcile-employee-scope' },
      });
    } catch (err) {
      if (err?.code === 'MERGE_SCOPES_DISABLED' || err?.code === 'MERGE_AUTH_FAILED') {
        applyMergeNeedsAttention(connection, { code: err.code });
        await rememberIssue(connection, { status: 'ONGOING', code: err.code });
        return connection;
      }
      logger.warn({ ...logContext, code: err?.code }, 'Merge employee scope check skipped');
      return connection;
    }
  }

  if (!applyMergeConnected(connection)) return connection;
  if (
    connection.lastError === 'MERGE_AUTH_FAILED' ||
    connection.lastError === 'MERGE_SCOPES_DISABLED' ||
    connection.lastError === 'MERGE_OPTIONAL_SCOPE_DISABLED' ||
    MERGE_ACCOUNT_STATUS_RELINK.includes(connection.lastError)
  ) {
    connection.lastError = '';
  }
  connection.mergeIssueStatus = '';
  connection.mergeIssueError = '';
  await connection.save();
  logger.info(
    { ...logContext, provider: connection.provider },
    'Restored Merge connection to connected after health check',
  );
  return connection;
}

/** List/schedule path: restore needs_attention only when Merge still looks healthy. */
export async function reconcileMergeConnectionIfHealthy(connection) {
  return reconcileMergeConnectionHealth(connection, { requireIssues: false });
}

/** List safe connection records for the authenticated tenant. */
export async function listMergeConnections({ tenantId }) {
  const docs = await MergeConnection.find({ tenantId }).sort({ updatedAt: -1 });
  for (const doc of docs) {
    if (doc.status === 'needs_attention') {
      await reconcileMergeConnectionIfHealthy(doc);
    }
  }
  return {
    connections: docs.map((d) => d.toPublicJSON()),
  };
}

export async function getOwnedMergeConnection({ tenantId, connectionId }) {
  const doc = await MergeConnection.findOne({ _id: connectionId, tenantId });
  if (!doc) {
    throw new ApiError(404, 'Merge connection not found', 'MERGE_CONNECTION_NOT_FOUND');
  }
  if (doc.status === 'needs_attention') {
    await reconcileMergeConnectionIfHealthy(doc);
  }
  return doc;
}

/**
 * Disconnect one provider Linked Account for this tenant.
 * Preserves imported HRIS employee rows and other provider connections.
 * Keeps endUserOriginId so reconnect reuses the same Merge origin id.
 */
export async function disconnectMergeConnection({ tenantId, connectionId }) {
  requireMergeConfigured();

  const connection = await getOwnedMergeConnection({ tenantId, connectionId });

  if (connection.status === 'disconnected' && !connection.encryptedAccountToken) {
    return { connection: connection.toPublicJSON() };
  }

  let accountToken = '';
  if (connection.encryptedAccountToken) {
    try {
      accountToken = decryptToken(connection.encryptedAccountToken);
    } catch {
      accountToken = '';
    }
  }

  if (accountToken) {
    try {
      await mergeRequest(MERGE_DELETE_ACCOUNT_URL, {
        method: 'POST',
        accountToken,
        logContext: {
          organizationId: String(tenantId),
          connectionId: String(connection._id),
          provider: connection.provider,
          action: 'delete-account',
        },
      });
    } catch (err) {
      // Already gone / invalid token — still clear local credentials safely.
      const code = err?.code;
      if (code !== 'MERGE_AUTH_FAILED' && code !== 'MERGE_REQUEST_REJECTED') {
        throw err;
      }
      logger.warn(
        {
          organizationId: String(tenantId),
          connectionId: String(connection._id),
          provider: connection.provider,
          code,
        },
        'Merge delete-account skipped; clearing local connection',
      );
    }
  }

  connection.encryptedAccountToken = '';
  connection.mergeLinkedAccountId = '';
  connection.status = 'disconnected';
  connection.disconnectedByUser = true;
  connection.lastError = '';
  // Keep endUserOriginId, cursors, lastSyncAt, and provider for reconnect + audit.
  await connection.save();

  logger.info(
    {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      provider: connection.provider,
    },
    'Merge connection disconnected',
  );

  return { connection: connection.toPublicJSON() };
}
