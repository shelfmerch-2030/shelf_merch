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
  MERGE_HRIS_INTEGRATIONS,
} from './merge.constants.js';
import { MergeConnection } from './mergeConnection.model.js';
import { mergeRequest, requireMergeConfigured } from './mergeHttp.js';

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
 * Use a distinct origin id per HRIS provider so tenants can connect Deel + Workday, etc.
 */
function buildMergeEndUserOriginId({ tenantId, integration, existingOriginId, hasLegacyConnection }) {
  if (existingOriginId) return existingOriginId;
  // Legacy connections were created with bare tenantId before multi-HRIS support.
  if (hasLegacyConnection) return String(tenantId);
  if (integration) return `${tenantId}:hris:${integration}`;
  return `${tenantId}:hris:${randomUUID()}`;
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
      'Could not determine a supported Merge HRIS provider',
      'MERGE_PROVIDER_UNKNOWN',
    );
  }

  const encryptedAccountToken = encryptToken(accountToken);
  const now = new Date();

  const existing = await MergeConnection.findOne({ tenantId, provider })
    .select('endUserOriginId')
    .lean();
  const endUserOriginId =
    String(accountDetails?.end_user_origin_id || '').trim() ||
    existing?.endUserOriginId ||
    buildMergeEndUserOriginId({
      tenantId,
      integration: provider,
      existingOriginId: '',
      hasLegacyConnection: Boolean(existing && !existing.endUserOriginId),
    });

  const doc = await MergeConnection.findOneAndUpdate(
    { tenantId, provider },
    {
      $set: {
        connectedByUserId: userId,
        provider,
        category: 'hris',
        mergeLinkedAccountId: String(accountDetails?.id || tokenPayload?.id || ''),
        integrationName: String(
          accountDetails?.integration || tokenPayload?.integration?.name || provider,
        ),
        endUserOriginId,
        endUserOrganizationName: String(accountDetails?.end_user_organization_name || ''),
        encryptedAccountToken,
        status: 'connected',
        connectedAt: now,
        lastError: '',
        lastSyncStatus: 'idle',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(
    {
      organizationId: String(tenantId),
      integration: provider,
      connectionId: String(doc._id),
    },
    'Merge connection stored',
  );

  return { connection: doc.toPublicJSON() };
}

/**
 * If a connection was marked needs_attention but Merge still reports COMPLETE,
 * restore status to connected (e.g. after a mistaken scope-403 auth mapping).
 */
export async function reconcileMergeConnectionIfHealthy(connection) {
  if (!connection || connection.status !== 'needs_attention') return connection;
  if (!connection.encryptedAccountToken) return connection;

  let accountToken;
  try {
    accountToken = decryptToken(connection.encryptedAccountToken);
  } catch {
    return connection;
  }

  try {
    const details = await mergeRequest(MERGE_ACCOUNT_DETAILS_URL, {
      method: 'GET',
      accountToken,
      logContext: {
        organizationId: String(connection.tenantId),
        connectionId: String(connection._id),
        action: 'reconcile-account-details',
      },
    });
    const mergeStatus = String(details?.status || '').toUpperCase();
    if (mergeStatus === 'COMPLETE') {
      connection.status = 'connected';
      if (connection.lastError === 'MERGE_AUTH_FAILED') {
        connection.lastError = '';
      }
      await connection.save();
      logger.info(
        {
          organizationId: String(connection.tenantId),
          connectionId: String(connection._id),
          provider: connection.provider,
        },
        'Restored Merge connection to connected after account-details COMPLETE',
      );
    }
  } catch (err) {
    // Auth/relink failures remain needs_attention — do not restore.
    logger.warn(
      {
        organizationId: String(connection.tenantId),
        connectionId: String(connection._id),
        code: err?.code,
      },
      'Merge connection reconcile skipped',
    );
  }

  return connection;
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
  connection.lastError = '';
  // Keep endUserOriginId, lastSyncAt, and provider for reconnect + audit.
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
