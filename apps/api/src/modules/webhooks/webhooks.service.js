import crypto from 'node:crypto';
import { logger } from '../../config/logger.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { decryptToken, encryptToken } from '../../utils/tokenEncryption.js';
import { assertFetchableUrl } from '../orderSources/adapters/safeFetch.js';
import { Order } from '../orders/order.model.js';
import { publicStatus } from '../orders/publicStatus.js';
import { Shipment } from '../shipments/shipment.model.js';
import { serializePublicOrder } from '../publicApi/publicOrder.serializer.js';
import { WebhookDelivery, WebhookEndpoint, WebhookEvent, publicEndpoint } from './webhook.models.js';
import {
  DELIVERY_LOCK_MS,
  DELIVERY_TIMEOUT_MS,
  DISABLE_AFTER_MS,
  MAX_ATTEMPTS,
  MAX_ENDPOINTS_PER_TENANT,
  RESPONSE_SNIPPET_BYTES,
  RETRY_SCHEDULE_SEC,
  WEBHOOK_TEST_EVENT,
} from './webhooks.constants.js';

// ---------------------------------------------------------------------------
// Signing — documented for receivers in /docs/api#webhooks
// ---------------------------------------------------------------------------

export function generateSecret() {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/** `ShelfMerch-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` */
export function signPayload(secret, rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return { header: `t=${timestamp},v1=${v1}`, timestamp };
}

/** Reference verifier (mirrors the docs snippet; used in tests). */
export function verifySignature(secret, rawBody, header, { toleranceSec = 300, now = Date.now() } = {}) {
  const parts = Object.fromEntries(String(header ?? '').split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'), 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---------------------------------------------------------------------------
// Emitting events
// ---------------------------------------------------------------------------

function newEventId() {
  return `evt_${crypto.randomBytes(12).toString('hex')}`;
}

async function enqueue(deliveryId, delayMs = 0) {
  const { enqueueWebhookDelivery } = await import('../../jobs/queues.js');
  return enqueueWebhookDelivery({ deliveryId: String(deliveryId), delayMs });
}

/** Create the event + one delivery per subscribed endpoint, then queue them. */
async function fanOut({ tenantId, mode, type, orderId = null, data, endpointFilter = {} }) {
  const endpoints = await WebhookEndpoint.find({ tenantId, mode, enabled: true, ...endpointFilter }).lean();
  const subscribed = endpoints.filter((e) => type === WEBHOOK_TEST_EVENT || !e.events?.length || e.events.includes(type));
  if (!subscribed.length) return null;

  const publicId = newEventId();
  const payload = { id: publicId, object: 'event', type, livemode: mode === 'live', created_at: new Date().toISOString(), data };
  const event = await WebhookEvent.create({ tenantId, publicId, type, mode, orderId, payload });
  const deliveries = await WebhookDelivery.insertMany(
    subscribed.map((e) => ({ tenantId, endpointId: e._id, eventId: event._id, eventPublicId: publicId, eventType: type })),
  );
  for (const d of deliveries) await enqueue(d._id);
  return { event, deliveries };
}

/**
 * Called (asynchronously) from the Order save hook and API update path.
 * The order is re-read and the transition confirmed from statusHistory, so a
 * save inside a transaction that later rolled back never produces an event.
 */
export async function emitOrderEvent({ tenantId, orderId, type }) {
  const order = await Order.findOne({ _id: orderId, tenantId }).lean();
  if (!order || order.source !== 'api') return null;
  const target = type.replace(/^order\./, '');
  if (!['received', 'updated'].includes(target) && !(order.statusHistory ?? []).some((h) => publicStatus(h.status) === target)) {
    return null;
  }
  const shipment = await Shipment.findOne({ orderId: order._id, tenantId }).lean();
  return fanOut({
    tenantId,
    mode: order.testMode ? 'test' : 'live',
    type,
    orderId: order._id,
    data: { object: serializePublicOrder(order, shipment) },
  });
}

/** Fire-and-forget wrapper for hooks: never throws into the caller. */
export function scheduleOrderEvent(order, type) {
  const args = { tenantId: order.tenantId, orderId: order._id, type };
  setImmediate(() => {
    emitOrderEvent(args).catch((err) =>
      logger.error({ orderId: String(order._id), type, err: err?.message }, 'Webhook event emit failed'),
    );
  });
}

// ---------------------------------------------------------------------------
// Delivering (outbox worker)
// ---------------------------------------------------------------------------

async function post(url, body, headers) {
  await assertFetchableUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'ShelfMerch-Webhooks/1.0', ...headers },
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    const text = (await res.text().catch(() => '')).slice(0, RESPONSE_SNIPPET_BYTES);
    return { status: res.status, ok: res.status >= 200 && res.status < 300, snippet: text, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function noteEndpointFailure(endpoint, now) {
  const failingSince = endpoint.failingSince ?? now;
  const disable = now - new Date(failingSince) >= DISABLE_AFTER_MS;
  await WebhookEndpoint.updateOne(
    { _id: endpoint._id, tenantId: endpoint.tenantId },
    {
      $inc: { consecutiveFailures: 1 },
      $set: {
        failingSince,
        ...(disable ? { enabled: false, disabledAt: now, disabledReason: 'Failing continuously for 3 days' } : {}),
      },
    },
  );
  if (disable) await notifyEndpointDisabled(endpoint);
}

async function notifyEndpointDisabled(endpoint) {
  try {
    const { RoleAssignment } = await import('../roles/roleAssignment.model.js');
    const { User } = await import('../users/user.model.js');
    const { notify } = await import('../notifications/notifications.service.js');
    const admins = await RoleAssignment.find({ tenantId: endpoint.tenantId, role: 'company_admin' }).select('userId').lean();
    const users = await User.find({ _id: { $in: admins.map((a) => a.userId) } }).select('email').lean();
    for (const u of users) {
      await notify({
        type: 'webhook_endpoint_disabled',
        tenantId: endpoint.tenantId,
        userId: u._id,
        email: u.email,
        title: 'A webhook endpoint was disabled',
        body: `${endpoint.url} failed for 3 days and was disabled. Fix it, then re-enable it under Settings → Developers.`,
        link: '/settings?tab=developers',
      });
    }
  } catch (err) {
    logger.error({ endpointId: String(endpoint._id), err: err?.message }, 'Could not notify about disabled webhook endpoint');
  }
}

/**
 * Atomically claim one due delivery and attempt it. Safe to call from the
 * queue job and the sweep at the same time — only one claim wins.
 */
export async function attemptDelivery(deliveryId, now = new Date()) {
  const delivery = await WebhookDelivery.findOneAndUpdate(
    {
      _id: deliveryId,
      status: 'pending',
      nextAttemptAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + DELIVERY_LOCK_MS) } },
    { returnDocument: 'after' },
  ).setOptions({ skipTenantGuard: true });
  if (!delivery) return { skipped: true };

  const [endpoint, event] = await Promise.all([
    WebhookEndpoint.findOne({ _id: delivery.endpointId, tenantId: delivery.tenantId }).select('+encryptedSecret').lean(),
    WebhookEvent.findOne({ _id: delivery.eventId, tenantId: delivery.tenantId }).lean(),
  ]);
  const finish = (fields) =>
    WebhookDelivery.updateOne({ _id: delivery._id, tenantId: delivery.tenantId }, { $set: { lockedUntil: null, ...fields } });

  if (!endpoint || !endpoint.enabled || !event) {
    await finish({ status: 'failed', error: !event ? 'Event expired' : 'Endpoint disabled or deleted' });
    return { status: 'failed' };
  }

  const body = JSON.stringify(event.payload);
  const { header } = signPayload(decryptToken(endpoint.encryptedSecret), body);
  const attempts = delivery.attempts + 1;
  let result;
  try {
    result = await post(endpoint.url, body, {
      'ShelfMerch-Signature': header,
      'ShelfMerch-Event-Id': event.publicId,
      'ShelfMerch-Event-Type': event.type,
      'ShelfMerch-Delivery-Attempt': String(attempts),
    });
  } catch (err) {
    result = { ok: false, status: null, snippet: '', error: err?.name === 'AbortError' ? 'Timed out after 10s' : String(err?.message ?? err).slice(0, 300) };
  }

  const base = {
    attempts,
    lastAttemptAt: now,
    responseStatus: result.status,
    responseSnippet: result.snippet ?? '',
    durationMs: result.durationMs ?? null,
  };
  if (result.ok) {
    await finish({ ...base, status: 'succeeded', error: '' });
    await WebhookEndpoint.updateOne(
      { _id: endpoint._id, tenantId: endpoint.tenantId },
      { $set: { consecutiveFailures: 0, failingSince: null, lastSuccessAt: now } },
    );
    return { status: 'succeeded' };
  }

  const error = result.error || (result.status ? `HTTP ${result.status}` : 'Request failed');
  if (event.type !== WEBHOOK_TEST_EVENT) await noteEndpointFailure(endpoint, now);
  if (attempts >= MAX_ATTEMPTS || event.type === WEBHOOK_TEST_EVENT) {
    await finish({ ...base, status: 'failed', error });
    return { status: 'failed' };
  }
  const delayMs = RETRY_SCHEDULE_SEC[attempts - 1] * 1000;
  await finish({ ...base, error, nextAttemptAt: new Date(now.getTime() + delayMs) });
  await enqueue(delivery._id, delayMs);
  return { status: 'retrying', delayMs };
}

/** Safety net for lost/delayed queue jobs: attempt everything that is due. */
export async function sweepDueDeliveries({ now = new Date(), limit = 200 } = {}) {
  const due = await WebhookDelivery.find({
    status: 'pending',
    nextAttemptAt: { $lte: now },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
  })
    .setOptions({ skipTenantGuard: true })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();
  let attempted = 0;
  for (const d of due) {
    const r = await attemptDelivery(d._id, now);
    if (!r.skipped) attempted += 1;
  }
  return { attempted };
}

// ---------------------------------------------------------------------------
// Endpoint management (tenant self-serve)
// ---------------------------------------------------------------------------

export async function listEndpoints({ tenantId }) {
  const rows = await WebhookEndpoint.find({ tenantId }).sort({ createdAt: -1 }).lean();
  return rows.map(publicEndpoint);
}

export async function createEndpoint({ tenantId, url, description, mode, events, userId }) {
  await assertFetchableUrl(url);
  const count = await WebhookEndpoint.countDocuments({ tenantId });
  if (count >= MAX_ENDPOINTS_PER_TENANT) {
    throw new ApiError(422, `A workspace can have at most ${MAX_ENDPOINTS_PER_TENANT} webhook endpoints`, 'WEBHOOK_ENDPOINT_LIMIT');
  }
  const secret = generateSecret();
  const doc = await WebhookEndpoint.create({
    tenantId,
    url,
    description: description ?? '',
    mode,
    events: events ?? [],
    encryptedSecret: encryptToken(secret),
    createdByUserId: userId ?? null,
  });
  return { endpoint: publicEndpoint(doc), secret };
}

async function loadEndpoint(tenantId, id, { withSecret = false } = {}) {
  const q = WebhookEndpoint.findOne({ _id: id, tenantId });
  if (withSecret) q.select('+encryptedSecret');
  const doc = await q;
  if (!doc) throw new NotFoundError('Webhook endpoint not found');
  return doc;
}

export async function updateEndpoint({ tenantId, id, patch }) {
  const doc = await loadEndpoint(tenantId, id);
  if (patch.url !== undefined) {
    await assertFetchableUrl(patch.url);
    doc.url = patch.url;
  }
  if (patch.description !== undefined) doc.description = patch.description;
  if (patch.events !== undefined) doc.events = patch.events;
  if (patch.enabled !== undefined) {
    doc.enabled = patch.enabled;
    if (patch.enabled) Object.assign(doc, { disabledAt: null, disabledReason: '', consecutiveFailures: 0, failingSince: null });
    else Object.assign(doc, { disabledAt: new Date(), disabledReason: 'Disabled by an admin' });
  }
  await doc.save();
  return publicEndpoint(doc);
}

export async function deleteEndpoint({ tenantId, id }) {
  const doc = await loadEndpoint(tenantId, id);
  await WebhookEndpoint.deleteOne({ _id: doc._id, tenantId });
  await WebhookDelivery.updateMany({ tenantId, endpointId: doc._id, status: 'pending' }, { $set: { status: 'failed', error: 'Endpoint deleted' } });
  return { deleted: true };
}

export async function revealSecret({ tenantId, id }) {
  const doc = await loadEndpoint(tenantId, id, { withSecret: true });
  return { secret: decryptToken(doc.encryptedSecret) };
}

export async function rotateSecret({ tenantId, id }) {
  const doc = await loadEndpoint(tenantId, id);
  const secret = generateSecret();
  await WebhookEndpoint.updateOne({ _id: doc._id, tenantId }, { $set: { encryptedSecret: encryptToken(secret) } });
  return { secret };
}

/** "Send test event" — a single attempt, not retried, so the admin sees the result now. */
export async function sendTestEvent({ tenantId, id }) {
  const endpoint = await loadEndpoint(tenantId, id);
  if (!endpoint.enabled) throw new ApiError(409, 'Enable the endpoint first', 'WEBHOOK_ENDPOINT_DISABLED');
  const out = await fanOut({
    tenantId,
    mode: endpoint.mode,
    type: WEBHOOK_TEST_EVENT,
    data: { object: { message: 'This is a test event from ShelfMerch. Respond with 2xx to acknowledge.' } },
    endpointFilter: { _id: endpoint._id },
  });
  const deliveryId = out.deliveries[0]._id;
  await attemptDelivery(deliveryId);
  return WebhookDelivery.findOne({ _id: deliveryId, tenantId }).lean();
}

export async function listDeliveries({ tenantId, endpointId, page: rawPage, limit: rawLimit }) {
  // Coerce: query values may arrive as raw strings (Express 5 req.query).
  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(100, Math.max(1, Number(rawLimit) || 25));
  const filter = { tenantId, endpointId };
  const [items, total] = await Promise.all([
    WebhookDelivery.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WebhookDelivery.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

export async function getDeliveryPayload({ tenantId, deliveryId }) {
  const d = await WebhookDelivery.findOne({ _id: deliveryId, tenantId }).lean();
  if (!d) throw new NotFoundError('Delivery not found');
  const event = await WebhookEvent.findOne({ _id: d.eventId, tenantId }).lean();
  return { delivery: d, payload: event?.payload ?? null };
}

/** Manual resend: a fresh delivery of the same event (same event id, so receivers can dedupe). */
export async function resendDelivery({ tenantId, deliveryId }) {
  const d = await WebhookDelivery.findOne({ _id: deliveryId, tenantId }).lean();
  if (!d) throw new NotFoundError('Delivery not found');
  const event = await WebhookEvent.findOne({ _id: d.eventId, tenantId }).select('_id').lean();
  if (!event) throw new ApiError(410, 'This event is older than 30 days and can no longer be resent', 'WEBHOOK_EVENT_EXPIRED');
  const copy = await WebhookDelivery.create({
    tenantId,
    endpointId: d.endpointId,
    eventId: d.eventId,
    eventPublicId: d.eventPublicId,
    eventType: d.eventType,
  });
  await attemptDelivery(copy._id);
  return WebhookDelivery.findOne({ _id: copy._id, tenantId }).lean();
}
