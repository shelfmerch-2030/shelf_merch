import { createHash, randomBytes } from 'node:crypto';
import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { AuditLog } from '../auditLogs/auditLog.model.js';
import { ApiError } from '../../utils/errors.js';
import { McpWriteConfirmation } from './mcpWriteConfirmation.model.js';
import { McpWriteIdempotency } from './mcpWriteIdempotency.model.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LEASE_MS = 30 * 1000;
const SENSITIVE_KEY = /token|email|phone|password|razorpay|authorization|secret|cookie|otp|assertion|verifier|refresh|bearer|gstin|address|payment/i;
const SAFE_ERROR_CODE = /^[A-Z0-9_]+$/;

let indexesReady;

function clockOf(now) {
  return typeof now === 'function' ? now() : new Date();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (typeof value.toHexString === 'function') return JSON.stringify(value.toHexString());
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function redactSensitive(value, options = {}) {
  const preserve = new Set(options.preserveKeys || []);
  if (Array.isArray(value)) return value.map((entry) => redactSensitive(entry, options));
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const redacted = {};
  for (const [key, entry] of Object.entries(value)) {
    const hidden = !preserve.has(key) && SENSITIVE_KEY.test(key);
    redacted[key] = hidden ? '[redacted]' : redactSensitive(entry, options);
  }
  return redacted;
}

const PERMANENT_FAILURE = new Set([
  'ACTOR_INACTIVE',
  'TENANT_INACTIVE',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'CONFIRMATION_INVALID',
  'CONFIRMATION_EXPIRED',
  'CONFIRMATION_REUSED',
  'CONFIRMATION_MISMATCH',
  'CONFIRMATION_STALE',
  'IDEMPOTENCY_PAYLOAD_MISMATCH',
  'INSUFFICIENT_FUNDS',
  'INSUFFICIENT_ENTITY_BUDGET',
  'BUDGET_TOO_LOW',
  'ALLOCATION_EXCEEDS_BALANCE',
  'ALLOCATION_EXCEEDS_UNSPENT',
  'SHOP_NO_CATEGORIES',
  'SHOP_AMBIGUOUS',
  'WALLET_AMBIGUOUS',
  'WALLET_EXISTS',
  'DOCUMENT_REQUIRED',
  'INVALID_DOCUMENT_URL',
  'FUNDING_PENDING',
  'USE_RAZORPAY',
  'PAYMENT_FAILED',
  'PAYMENT_NOT_CAPTURED',
  'PAYMENT_ORDER_MISMATCH',
  'PAYMENT_AMOUNT_MISMATCH',
  'INVALID_PAYMENT_SIGNATURE',
  'INVALID_AMOUNT',
  'CATEGORY_REQUIRED',
  'CATEGORY_DUPLICATE',
]);

function redactFor(context, value) {
  const operation = String(context.operation || '');
  const preserveKeys = [];
  if (operation.startsWith('employees.')) preserveKeys.push('email');
  // Wallet setup/payment tools need public checkout identifiers after execute.
  // Keep secrets (uploadToken, razorpaySignature) redacted via SENSITIVE_KEY.
  if (operation.startsWith('wallets.')) {
    preserveKeys.push('paymentId', 'orderId', 'keyId', 'walletId', 'ticketId', 'uploadUrl', 'uploadPageUrl', 'documentUrl');
  }
  return redactSensitive(value, { preserveKeys });
}

async function ensureIndexes() {
  indexesReady ??= Promise.all([
    McpWriteConfirmation.syncIndexes(),
    McpWriteIdempotency.syncIndexes(),
  ]);
  return indexesReady;
}

export async function loadMcpActor({ tenantId, actorUserId, session = null }) {
  return loadActor({ tenantId, actorUserId, session });
}

async function loadActor({ tenantId, actorUserId, session = null }) {
  const workspace = await Tenant.findById(tenantId).session(session);
  const user = await User.findOne({ _id: actorUserId, tenantId }).session(session);
  if (!user || user.status !== 'active') {
    throw new ApiError(403, 'This account cannot confirm the operation', 'ACTOR_INACTIVE');
  }
  if (!workspace || !['active', 'trial'].includes(workspace.status)) {
    throw new ApiError(403, 'This workspace cannot confirm the operation', 'TENANT_INACTIVE');
  }
  const assignment = await RoleAssignment.findOne({ userId: user._id, tenantId: workspace._id }).session(session);
  if (!assignment) {
    throw new ApiError(403, 'This account cannot confirm the operation', 'FORBIDDEN');
  }
  return {
    user: {
      userId: user._id,
      role: assignment.role,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId ?? null,
      assignedEntityIds: (assignment.assignedEntityIds ?? []).map(String),
      status: user.status,
    },
    tenant: workspace,
    actorRole: assignment.role,
  };
}

async function recordAudit({ tenantId, actorUserId, actorRole, action, operation, confirmationId, code }) {
  try {
    await AuditLog.create({
      tenantId,
      actorUserId: actorUserId ?? null,
      actorRole: actorRole || '',
      action,
      entityType: 'mcp_write',
      after: {
        operation,
        code: code || undefined,
        confirmationHash: confirmationId ? sha256(confirmationId) : undefined,
      },
    });
  } catch {
    // A failed audit insert must not hide the business result or leak the payload.
  }
}

function asApiError(error) {
  if (error instanceof ApiError) return error;
  if (error?.status && error?.code) {
    return new ApiError(error.status, error.message, error.code);
  }
  return error;
}

async function rejectConfirmation(confirmation, { actorRole, code }) {
  if (!confirmation || confirmation.status !== 'pending') return;
  confirmation.status = 'rejected';
  await confirmation.save();
  await recordAudit({
    tenantId: confirmation.tenantId,
    actorUserId: confirmation.actorUserId,
    actorRole,
    action: 'mcp_write.rejected',
    operation: confirmation.operation,
    confirmationId: confirmation.confirmationId,
    code,
  });
}

function fingerprintFor({ tenantId, actorUserId, operation, confirmationId, payloadHash }) {
  return sha256(canonical({
    tenantId: String(tenantId),
    actorUserId: String(actorUserId),
    operation,
    confirmationId,
    payloadHash,
  }));
}

async function readIdempotency({ tenantId, actorUserId, idempotencyKey }) {
  return McpWriteIdempotency.findOne({ key: idempotencyKey, tenantId, actorUserId });
}

/** Read a proven completion only; never reserve, reconcile, retry, or execute. */
export async function readMcpWriteCompletion({ tenantId, actorUserId, operation, confirmationId, payload, authorize }) {
  const actor = await loadActor({ tenantId, actorUserId });
  if (authorize) await authorize(actor);
  const payloadHash = sha256(canonical(payload));
  const fingerprint = fingerprintFor({ tenantId, actorUserId, operation, confirmationId, payloadHash });
  const completed = await McpWriteIdempotency.findOne({ tenantId, actorUserId, fingerprint, status: 'completed' }).lean();
  return completed ? { status: 'completed', result: completed.result } : { status: 'consumed' };
}

/** Recover an outcome by the confirmation's canonical payload hash, without execution. */
export async function readMcpWriteOutcome({ tenantId, actorUserId, operation, confirmationId }) {
  await loadActor({ tenantId, actorUserId });
  const confirmation = await McpWriteConfirmation.findOne({ tenantId, actorUserId, operation, confirmationId }).lean();
  if (!confirmation) return null;
  const fingerprint = fingerprintFor({ tenantId, actorUserId, operation, confirmationId, payloadHash: confirmation.payloadHash });
  const completed = await McpWriteIdempotency.findOne({ tenantId, actorUserId, fingerprint, status: 'completed' }).lean();
  if (completed) return { state: 'completed', result: completed.result };
  if (operation === 'campaigns.send_points') {
    // Read-only proof from the combined journal; never resumes a business write
    // while resolving or projecting conversation history.
    const { readSendPointsOutcome } = await import('../copilot/sendPointsWorkflow.js');
    const outcome = await readSendPointsOutcome({ tenantId, actorUserId, confirmationId });
    if (outcome) return outcome;
  }
  if (confirmation.copilotOutcome) return confirmation.copilotOutcome;
  const failed = await McpWriteIdempotency.findOne({ tenantId, actorUserId, fingerprint, status: 'failed' }).lean();
  if (failed) return { state: failed.errorCode === 'CONFIRMATION_EXPIRED' ? 'expired' : 'failed', errorCode: failed.errorCode };
  if (confirmation.status === 'pending') {
    return { state: confirmation.expiresAt <= new Date() ? 'expired' : 'pending' };
  }
  // Rejected alone can mean a safety rejection, not necessarily an explicit Cancel.
  return { state: confirmation.status === 'rejected' ? 'failed' : 'consumed', errorCode: 'CONFIRMATION_UNAVAILABLE' };
}

function replayOrConflict(existing, fingerprint) {
  if (!existing) return null;
  if (existing.fingerprint !== fingerprint) {
    throw new ApiError(409, 'This idempotency key was used for a different operation', 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  }
  if (existing.status === 'completed') return { replay: existing.result };
  if (existing.status === 'failed') return { failed: existing };
  if (existing.status === 'pending') return { pending: existing };
  throw new ApiError(409, 'This operation is already in progress', 'IDEMPOTENT_REPLAY_IN_FLIGHT');
}

function storedFailure(existing) {
  return new ApiError(
    422,
    'The confirmed operation could not be completed',
    existing.errorCode || 'MCP_WRITE_FAILED',
  );
}

function reconciliationRequired() {
  return new ApiError(409, 'This operation needs reconciliation before it can be retried', 'IDEMPOTENCY_RECONCILIATION_REQUIRED');
}

function inFlight() {
  return new ApiError(409, 'This operation is already in progress', 'IDEMPOTENT_REPLAY_IN_FLIGHT');
}

async function finishReservation(reservation, fields) {
  return McpWriteIdempotency.findOneAndUpdate(
    {
      _id: reservation._id,
      tenantId: reservation.tenantId,
      status: 'pending',
      fence: reservation.fence,
      leaseOwner: reservation.leaseOwner,
    },
    { $set: fields },
    { returnDocument: 'after' },
  );
}

async function runGuardedExecute(reservation, execute, actor, context) {
  const heartbeatMs = Math.min(Math.max(Math.floor(context.leaseMs / 3), 1000), context.leaseMs);
  const heartbeat = setInterval(() => {
    const leaseExpiresAt = new Date(Date.now() + context.leaseMs);
    McpWriteIdempotency.updateOne(
      {
        _id: reservation._id,
        tenantId: reservation.tenantId,
        status: 'pending',
        fence: reservation.fence,
        leaseOwner: reservation.leaseOwner,
      },
      { $set: { leaseExpiresAt } },
    ).catch(() => {});
  }, heartbeatMs);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
  try {
    const executionContext = { reservationId: reservation._id, leaseOwner: reservation.leaseOwner, fence: reservation.fence };
    const result = redactFor(context, (await (context.passExecutionContext
      ? execute(actor, executionContext) : execute(actor))) ?? null);
    const saved = await finishReservation(reservation, { status: 'completed', result, errorCode: '' });
    if (!saved) throw reconciliationRequired();
    await recordAudit({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      actorRole: context.actorRole,
      action: 'mcp_write.successful',
      operation: context.operation,
      confirmationId: context.confirmationId,
    });
    return result;
  } catch (error) {
    if (error?.code === 'IDEMPOTENCY_RECONCILIATION_REQUIRED') throw error;
    const wrapped = asApiError(error);
    const errorCode = SAFE_ERROR_CODE.test(wrapped?.code || '') ? wrapped.code : 'MCP_WRITE_FAILED';
    await finishReservation(reservation, { status: 'failed', errorCode, result: null });
    await recordAudit({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      actorRole: context.actorRole,
      action: 'mcp_write.failed',
      operation: context.operation,
      confirmationId: context.confirmationId,
      code: errorCode,
    });
    throw wrapped;
  } finally {
    clearInterval(heartbeat);
  }
}

async function recoverPending(existing, context) {
  const leaseOpen = Boolean(existing.leaseOwner) && existing.leaseExpiresAt && existing.leaseExpiresAt > context.clock;
  if (leaseOpen) throw inFlight();
  const owner = randomBytes(16).toString('hex');
  const fenceFilter = existing.fence == null
    ? { $or: [{ fence: null }, { fence: { $exists: false } }, { fence: 0 }] }
    : { fence: existing.fence };
  const acquired = await McpWriteIdempotency.findOneAndUpdate(
    {
      _id: existing._id,
      tenantId: context.tenantId,
      status: 'pending',
      fingerprint: context.fingerprint,
      $and: [
        fenceFilter,
        {
          $or: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { $lte: context.clock } },
            { leaseOwner: '' },
            { leaseOwner: { $exists: false } },
          ],
        },
      ],
    },
    {
      $set: {
        leaseOwner: owner,
        leaseExpiresAt: new Date(context.clock.getTime() + context.leaseMs),
      },
      $inc: { fence: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!acquired) {
    const raced = await readIdempotency(context);
    if (raced?.status === 'completed' && raced.fingerprint === context.fingerprint) return raced.result;
    throw inFlight();
  }
  const decision = typeof context.reconcile === 'function'
    ? await context.reconcile(context.actor)
    : { outcome: 'uncertain' };
  if (decision?.outcome === 'completed') {
    const result = redactFor(context, decision.result ?? null);
    const saved = await finishReservation(acquired, { status: 'completed', result, errorCode: '' });
    if (!saved) throw reconciliationRequired();
    await recordAudit({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      actorRole: context.actorRole,
      action: 'mcp_write.successful',
      operation: context.operation,
      confirmationId: context.confirmationId,
    });
    return result;
  }
  if (decision?.outcome === 'absent') {
    if (context.authorizeResume) await context.authorizeResume();
    return runGuardedExecute(acquired, context.execute, context.actor, context);
  }
  throw reconciliationRequired();
}

// A failed row is reconciled only when this operation can prove the outcome.
// A proven completion is returned without running the operation again.
// Absent failures stay failed unless an atomic workflow explicitly opts into
// same-key resume with fresh confirmation authorization. Uncertain writes never run.
async function recoverFailed(existing, context) {
  const recoverable = typeof context.reconcile === 'function' && !PERMANENT_FAILURE.has(existing.errorCode);
  if (!recoverable) throw storedFailure(existing);
  const decision = await context.reconcile(context.actor);
  if (decision?.outcome === 'completed') {
    const result = redactFor(context, decision.result ?? null);
    const saved = await McpWriteIdempotency.findOneAndUpdate(
      {
        _id: existing._id,
        tenantId: context.tenantId,
        status: 'failed',
        fingerprint: context.fingerprint,
      },
      { $set: { status: 'completed', result, errorCode: '' } },
      { returnDocument: 'after' },
    );
    if (saved) return result;
    const current = await readIdempotency(context);
    if (current?.status === 'completed' && current.fingerprint === context.fingerprint) return current.result;
    throw reconciliationRequired();
  }
  if (decision?.outcome === 'uncertain') throw reconciliationRequired();
  if (decision?.outcome === 'absent' && context.authorizeResume) {
    await context.authorizeResume();
    const acquired = await McpWriteIdempotency.findOneAndUpdate(
      { _id: existing._id, tenantId: context.tenantId, actorUserId: context.actorUserId, status: 'failed', fingerprint: context.fingerprint, fence: existing.fence },
      { $set: { status: 'pending', leaseOwner: randomBytes(16).toString('hex'), leaseExpiresAt: new Date(context.clock.getTime() + context.leaseMs) }, $inc: { fence: 1 } },
      { returnDocument: 'after' },
    );
    if (!acquired) {
      const raced = await readIdempotency(context);
      if (raced?.status === 'completed' && raced.fingerprint === context.fingerprint) return raced.result;
      throw inFlight();
    }
    return runGuardedExecute(acquired, context.execute, context.actor, context);
  }
  throw storedFailure(existing);
}

async function resolveExisting(existing, context) {
  const decision = replayOrConflict(existing, context.fingerprint);
  if (!decision) return null;
  if (decision.replay) return { done: true, result: decision.replay };
  if (decision.failed) return { done: true, result: await recoverFailed(decision.failed, context) };
  if (decision.pending) return { done: true, result: await recoverPending(decision.pending, context) };
  return null;
}

async function validatedPayload(validate, payload) {
  const validated = validate ? await validate(payload) : payload;
  return validated ?? {};
}

export async function prepareMcpWrite({
  tenantId,
  actorUserId,
  operation,
  payload,
  authorize,
  validate,
  resourceState,
  financialConstraint,
  summary,
  recoveryProof,
  ttlMs = DEFAULT_TTL_MS,
  now,
}) {
  await ensureIndexes();
  const clock = clockOf(now);
  let actorRole = '';
  try {
    const actor = await loadActor({ tenantId, actorUserId });
    actorRole = actor.actorRole;
    if (authorize) await authorize(actor);
    const validated = await validatedPayload(validate, payload);
    const resource = resourceState ? await resourceState(actor) : {};
    if (financialConstraint) await financialConstraint({ ...actor, payload: validated });
    const confirmationId = randomBytes(32).toString('base64url');
    const expiresAt = new Date(clock.getTime() + ttlMs);
    await McpWriteConfirmation.create({
      confirmationId,
      tenantId,
      actorUserId,
      operation,
      payloadHash: sha256(canonical(validated)),
      resourceHash: sha256(canonical(resource ?? {})),
      expiresAt,
      status: 'pending',
      recoveryProof: recoveryProof ? await recoveryProof(actor) : null,
    });
    await recordAudit({
      tenantId,
      actorUserId,
      actorRole,
      action: 'mcp_write.attempted',
      operation,
      confirmationId,
    });
    const preview = summary ? await summary(payload) : {};
    return {
      confirmationId,
      expiresAt: expiresAt.toISOString(),
      operation,
      summary: redactSensitive(preview ?? {}),
    };
  } catch (error) {
    const wrapped = asApiError(error);
    await recordAudit({
      tenantId,
      actorUserId,
      actorRole,
      action: 'mcp_write.rejected',
      operation,
      code: wrapped?.code || 'MCP_WRITE_REJECTED',
    });
    throw wrapped;
  }
}

async function classifyUnconsumed(confirmation, { tenantId, actorUserId, payloadHash, resourceHash, actorRole, clock }) {
  if (!confirmation || String(confirmation.actorUserId) !== String(actorUserId) || String(confirmation.tenantId) !== String(tenantId)) {
    await recordAudit({
      tenantId,
      actorUserId,
      actorRole,
      action: 'mcp_write.rejected',
      operation: confirmation?.operation,
      code: 'CONFIRMATION_INVALID',
    });
    throw new ApiError(404, 'This confirmation is not valid', 'CONFIRMATION_INVALID');
  }
  if (confirmation.status === 'consumed') {
    throw new ApiError(409, 'This confirmation was already used', 'CONFIRMATION_REUSED');
  }
  if (confirmation.status === 'rejected' || confirmation.expiresAt <= clock) {
    await rejectConfirmation(confirmation, { actorRole, code: 'CONFIRMATION_EXPIRED' });
    throw new ApiError(409, 'This confirmation has expired', 'CONFIRMATION_EXPIRED');
  }
  if (confirmation.payloadHash !== payloadHash) {
    throw new ApiError(409, 'This confirmation does not match the requested operation', 'CONFIRMATION_MISMATCH');
  }
  if (confirmation.resourceHash !== resourceHash) {
    await rejectConfirmation(confirmation, { actorRole, code: 'CONFIRMATION_STALE' });
    throw new ApiError(409, 'The preview is out of date', 'CONFIRMATION_STALE');
  }
  return confirmation;
}

export async function executeMcpWrite({
  tenantId,
  actorUserId,
  operation,
  confirmationId,
  payload,
  idempotencyKey,
  authorize,
  validate,
  resourceState,
  financialConstraint,
  execute,
  reconcile,
  allowProvenResume = false,
  passExecutionContext = false,
  leaseMs = DEFAULT_LEASE_MS,
  now,
}) {
  await ensureIndexes();
  const clock = clockOf(now);
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new ApiError(400, 'An idempotency key is required', 'IDEMPOTENCY_KEY_REQUIRED');
  }

  let actorRole = '';
  let actor;
  try {
    actor = await loadActor({ tenantId, actorUserId });
    actorRole = actor.actorRole;
  } catch (error) {
    const wrapped = asApiError(error);
    await recordAudit({
      tenantId,
      actorUserId,
      action: 'mcp_write.rejected',
      operation,
      confirmationId,
      code: wrapped?.code || 'MCP_WRITE_REJECTED',
    });
    throw wrapped;
  }

  const validated = await validatedPayload(validate, payload);
  const payloadHash = sha256(canonical(validated));
  const fingerprint = fingerprintFor({ tenantId, actorUserId, operation, confirmationId, payloadHash });
  const idempotencyContext = {
    tenantId,
    actorUserId,
    idempotencyKey,
    fingerprint,
    clock,
    leaseMs,
    actor,
    actorRole,
    operation,
    confirmationId,
    execute,
    reconcile,
    passExecutionContext,
    // Opt-in only for atomic allocation receipts. A consumed confirmation is
    // reused solely by its original key, while still unexpired and unchanged.
    authorizeResume: allowProvenResume ? async () => {
      const confirmation = await McpWriteConfirmation.findOne({ tenantId, actorUserId, operation, confirmationId, status: 'consumed', payloadHash });
      if (!confirmation) throw new ApiError(409, 'This confirmation is not valid for recovery', 'CONFIRMATION_INVALID');
      if (confirmation.expiresAt <= clock) throw new ApiError(409, 'This confirmation has expired', 'CONFIRMATION_EXPIRED');
      const fresh = await loadActor({ tenantId, actorUserId });
      if (authorize) await authorize(fresh);
      const resource = resourceState ? await resourceState(fresh) : {};
      if (confirmation.resourceHash !== sha256(canonical(resource ?? {}))) throw new ApiError(409, 'The preview is out of date', 'CONFIRMATION_STALE');
      if (financialConstraint) await financialConstraint({ ...fresh, payload: validated });
      idempotencyContext.actor = fresh;
    } : null,
  };
  const existing = await readIdempotency({ tenantId, actorUserId, idempotencyKey });
  if (existing) {
    const resolved = await resolveExisting(existing, idempotencyContext);
    if (resolved?.done) return resolved.result;
  }

  const confirmation = await McpWriteConfirmation.findOne({ confirmationId, tenantId });
  if (!confirmation || confirmation.operation !== operation || String(confirmation.actorUserId) !== String(actorUserId)) {
    await recordAudit({
      tenantId,
      actorUserId,
      actorRole,
      action: 'mcp_write.rejected',
      operation,
      confirmationId,
      code: 'CONFIRMATION_INVALID',
    });
    throw new ApiError(404, 'This confirmation is not valid', 'CONFIRMATION_INVALID');
  }

  try {
    if (authorize) await authorize(actor);
    const resource = resourceState ? await resourceState(actor) : {};
    const resourceHash = sha256(canonical(resource ?? {}));
    if (financialConstraint) await financialConstraint({ ...actor, payload: validated });
    await classifyUnconsumed(confirmation, {
      tenantId,
      actorUserId,
      payloadHash,
      resourceHash,
      actorRole,
      clock,
    });
  } catch (error) {
    const wrapped = asApiError(error);
    // Duplicate confirm / same idempotency key remount: if reconcile can prove the
    // intended state is already applied, return success without running execute again.
    // CONFIRMATION_REUSED with a *new* idempotency key is never reconciled here — the
    // confirmation was consumed by a different call, so this key has no proven claim.
    // CONFIRMATION_STALE likewise must not be silently reconciled — the resource changed
    // after prepare, so the user must prepare again with the current state.
    if (
      wrapped?.code === 'CONFIRMATION_REUSED'
      && existing // same idempotency key was used before — reconcile is safe
      && typeof reconcile === 'function'
    ) {
      try {
        const decision = await reconcile(actor);
        if (decision?.outcome === 'completed') {
          const result = redactFor({ operation, leaseMs }, decision.result ?? null);
          await recordAudit({
            tenantId,
            actorUserId,
            actorRole,
            action: 'mcp_write.reconciled',
            operation,
            confirmationId,
          });
          return result;
        }
      } catch {
        // Fall through to the original confirmation error when reconcile itself fails.
      }
    }
    if (!['CONFIRMATION_MISMATCH', 'CONFIRMATION_REUSED', 'CONFIRMATION_STALE', 'CONFIRMATION_EXPIRED', 'CONFIRMATION_INVALID'].includes(wrapped?.code)) {
      await rejectConfirmation(confirmation, { actorRole, code: wrapped?.code || 'MCP_WRITE_REJECTED' });
    }
    throw wrapped;
  }

  const resource = resourceState ? await resourceState(actor) : {};
  const resourceHash = sha256(canonical(resource ?? {}));
  let reservation;
  try {
    reservation = await McpWriteIdempotency.create({
      key: idempotencyKey,
      tenantId,
      actorUserId,
      fingerprint,
      status: 'pending',
      leaseOwner: randomBytes(16).toString('hex'),
      leaseExpiresAt: new Date(clock.getTime() + leaseMs),
      fence: 1,
    });
  } catch (error) {
    if (error?.code === 11000 || error?.cause?.code === 11000) {
      const raced = await readIdempotency({ tenantId, actorUserId, idempotencyKey });
      const resolved = await resolveExisting(raced, idempotencyContext);
      if (resolved?.done) return resolved.result;
    }
    throw error;
  }

  const consumed = await McpWriteConfirmation.findOneAndUpdate(
    {
      confirmationId,
      tenantId,
      actorUserId,
      operation,
      status: 'pending',
      expiresAt: { $gt: clock },
      payloadHash,
      resourceHash,
    },
    { $set: { status: 'consumed', consumedAt: clock } },
    { returnDocument: 'after' },
  );
  if (!consumed) {
    await McpWriteIdempotency.deleteOne({ _id: reservation._id, tenantId, status: 'pending' });
    const current = await McpWriteConfirmation.findOne({ confirmationId, tenantId });
    try {
      await classifyUnconsumed(current, { tenantId, actorUserId, payloadHash, resourceHash, actorRole, clock });
    } catch (error) {
      const wrapped = asApiError(error);
      if (
        (wrapped?.code === 'CONFIRMATION_REUSED' || wrapped?.code === 'CONFIRMATION_STALE')
        && typeof reconcile === 'function'
      ) {
        try {
          const decision = await reconcile(actor);
          if (decision?.outcome === 'completed') {
            const result = redactFor(idempotencyContext, decision.result ?? null);
            await recordAudit({
              tenantId,
              actorUserId,
              actorRole,
              action: 'mcp_write.reconciled',
              operation,
              confirmationId,
            });
            return result;
          }
        } catch {
          // Fall through.
        }
      }
      throw wrapped;
    }
    throw new ApiError(409, 'This confirmation was already used', 'CONFIRMATION_REUSED');
  }

  await recordAudit({
    tenantId,
    actorUserId,
    actorRole,
    action: 'mcp_write.confirmed',
    operation,
    confirmationId,
  });

  return runGuardedExecute(reservation, execute, actor, idempotencyContext);
}
