import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { MergeConnection } from './mergeConnection.model.js';
import { enqueueMergeHrisSync } from '../../../jobs/queues.js';
import { handleMergeLifecycleEvent, isMergeIssueEvent, isMergeLinkedLifecycleEvent } from './mergeLifecycle.js';

const HRIS_MODELS = new Set(['employee', 'employment', 'group', 'location']);
const MODEL_ACTIONS = new Set(['added', 'changed', 'removed', 'synced']);

/**
 * Merge signs the raw POST body with the org webhook key:
 * HMAC-SHA256, then base64url (padding kept). Compare in constant time.
 */
export function verifyMergeWebhookSignature(rawBody, signature, secret = env.MERGE_WEBHOOK_SECRET) {
  if (!secret || !signature || rawBody == null) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const digest = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const expected = Buffer.from(digest);
  const received = Buffer.from(String(signature));
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

/**
 * Documented `hook.event` values from Merge's webhook guide are PascalCase:
 * `LinkedAccount.sync_completed`, and `{CommonModel}.synced|.added|.changed|.removed`
 * (examples: `Candidate.synced`, `Employee.synced`). `data.sync_status` keys and
 * `model_id` use `hris.Employee`, which is not the event string. Help Center
 * prose sometimes lowercases the example, so model actions are matched
 * case-insensitively. Unknown events are acknowledged and ignored.
 */
export function mergeWebhookShouldSync(event, linkedAccount) {
  const category = String(linkedAccount?.category || '').toLowerCase();
  if (category && category !== 'hris') return false;
  const name = String(event || '');
  if (name === 'LinkedAccount.sync_completed') return true;
  const dot = name.indexOf('.');
  if (dot <= 0) return false;
  const model = name.slice(0, dot).toLowerCase();
  const action = name.slice(dot + 1).toLowerCase();
  return HRIS_MODELS.has(model) && MODEL_ACTIONS.has(action);
}

export async function handleMergeWebhook(rawBody, signature, { enqueue = enqueueMergeHrisSync } = {}) {
  if (!env.MERGE_WEBHOOK_SECRET) {
    throw new ApiError(503, 'Merge webhooks are not configured', 'MERGE_WEBHOOK_NOT_CONFIGURED');
  }
  if (!verifyMergeWebhookSignature(rawBody, signature)) {
    throw new ApiError(401, 'Invalid Merge webhook signature', 'MERGE_WEBHOOK_SIGNATURE_INVALID');
  }

  let payload;
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    payload = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Invalid webhook body', 'MERGE_WEBHOOK_INVALID');
  }

  const event = typeof payload?.hook?.event === 'string' ? payload.hook.event : '';
  const linkedAccountId =
    typeof payload?.linked_account?.id === 'string' ? payload.linked_account.id : '';
  logger.info({ event, linkedAccountId }, 'Merge webhook received');

  if (isMergeIssueEvent(event) || isMergeLinkedLifecycleEvent(event)) {
    return handleMergeLifecycleEvent(payload, { enqueue });
  }

  if (!mergeWebhookShouldSync(event, payload?.linked_account) || !linkedAccountId) {
    return { success: true, ignored: true, queued: false, alreadyQueuedOrRunning: false };
  }

  const matches = await MergeConnection.find({
    mergeLinkedAccountId: linkedAccountId,
    category: 'hris',
  })
    .setOptions({ skipTenantGuard: true })
    .limit(2);

  if (matches.length !== 1) {
    logger.info({ event, linkedAccountId, matches: matches.length }, 'Merge webhook connection not resolved');
    return { success: true, ignored: true, queued: false, alreadyQueuedOrRunning: false };
  }

  const connection = matches[0];
  const usable =
    !connection.disconnectedByUser &&
    (connection.status === 'connected' || connection.status === 'needs_attention') &&
    Boolean(connection.encryptedAccountToken);
  if (!usable) {
    logger.info(
      { event, linkedAccountId, connectionId: String(connection._id), status: connection.status },
      'Merge webhook ignored for inactive connection',
    );
    return { success: true, ignored: true, queued: false, alreadyQueuedOrRunning: false };
  }

  const result = await enqueue({
    tenantId: String(connection.tenantId),
    connectionId: String(connection._id),
    requestedByUserId: null,
    reason: 'webhook',
  });

  return {
    success: true,
    ignored: false,
    queued: result.queued === true,
    alreadyQueuedOrRunning: result.alreadyQueuedOrRunning === true,
  };
}
