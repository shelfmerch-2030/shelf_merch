import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { User } from '../users/user.model.js';
import { Entity } from '../entities/entity.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { allocateSchema } from '../wallets/wallets.validation.js';
import { allocate } from '../wallets/wallets.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';

const WRITE_ROLES = new Set(rolesForTenantArea('wallets', 'write'));

const requestSchema = z.object({
  walletId: z.string().trim().regex(/^[a-fA-F0-9]{24}$/),
  allocations: allocateSchema.shape.allocations,
}).strict();

export const BUDGET_PREPARE_DESCRIPTION = [
  'Preview a company wallet allocation to one or more departments.',
  'Company admins only. Amounts are signed INR: positive assigns unallocated cash, negative returns unspent department budget.',
  'Spent budget cannot be withdrawn. The preview shows balances, department allocations, the net change, and who would be notified.',
  'Nothing is saved. Applying it requires budget_execute_allocation.',
].join(' ');

export const BUDGET_EXECUTE_DESCRIPTION = [
  'Apply the department budget allocation from budget_prepare_allocation.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller, wallet, departments, and balances. Each line is stored once.',
  'A repeated key returns the original result and does not move the budget again.',
].join(' ');

const moneySchema = z.object({
  balance: z.number(),
  allocatedAmount: z.number(),
  unallocatedAmount: z.number(),
});

export const budgetPrepareInputSchema = requestSchema;
export const budgetExecuteInputSchema = requestSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const budgetPrepareOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: z.object({
    walletId: z.string(),
    currency: z.string(),
    netChange: z.number(),
    before: moneySchema,
    after: moneySchema,
    departments: z.array(z.object({
      entityId: z.string(),
      name: z.string(),
      amount: z.number(),
      beforeAllocated: z.number(),
      afterAllocated: z.number(),
      beforeUnspent: z.number(),
      afterUnspent: z.number(),
    })),
    notifications: z.array(z.object({
      entityId: z.string(),
      departmentName: z.string(),
    })),
  }),
});
export const budgetExecuteOutputSchema = z.object({
  walletId: z.string(),
  balance: z.number(),
  allocatedAmount: z.number(),
  unallocatedAmount: z.number(),
  netChange: z.number(),
  departments: z.array(z.object({
    entityId: z.string(),
    name: z.string(),
    allocatedAmount: z.number(),
    unspentAmount: z.number(),
  })),
});

function invalidDetails() {
  return new ApiError(400, 'Allocation details are not valid', 'VALIDATION');
}

function businessInput(input) {
  if (!input || typeof input !== 'object') return {};
  const { confirmationId: _confirmationId, idempotencyKey: _idempotencyKey, ...rest } = input;
  return rest;
}

function parseAllocation(input) {
  const parsed = requestSchema.safeParse(businessInput(input));
  if (!parsed.success) throw invalidDetails();
  const lines = parsed.data.allocations.map((line) => ({
    entityId: String(line.entityId),
    amount: line.amount,
  }));
  if (lines.some((line) => !Number.isFinite(line.amount))) throw invalidDetails();
  if (new Set(lines.map((line) => line.entityId)).size !== lines.length) throw invalidDetails();
  return { walletId: parsed.data.walletId, allocations: lines };
}

function assertBudgetWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Budget allocation requires a company admin');
  }
}

function ledgerKey(walletId, entityId, confirmationId) {
  return `allocation:${walletId}:${entityId}:${confirmationId}`;
}

function money(balance, allocatedAmount) {
  const allocated = Number(allocatedAmount) || 0;
  const cash = Number(balance) || 0;
  return {
    balance: cash,
    allocatedAmount: allocated,
    unallocatedAmount: cash - allocated,
  };
}

function unspent(entity) {
  return (Number(entity.allocatedAmount) || 0) - (Number(entity.spentAmount) || 0);
}

async function loadWallet(tenantId, walletId) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) throw new NotFoundError('Wallet not found');
  return wallet;
}

async function loadDepartments(tenantId, walletId, allocations) {
  const departments = [];
  for (const line of allocations) {
    const entity = await Entity.findOne({ _id: line.entityId, tenantId, walletId })
      .select('name allocatedAmount spentAmount managerUserId managerInvitePending walletId updatedAt');
    if (!entity) throw new NotFoundError('Department not found');
    departments.push(entity);
  }
  return departments;
}

function assertAffordable(wallet, departments, allocations) {
  const netIncrease = allocations.reduce((sum, line) => sum + Math.max(0, line.amount), 0);
  const available = (Number(wallet.balance) || 0) - (Number(wallet.allocatedAmount) || 0);
  if (netIncrease > available) {
    throw new ApiError(
      422,
      `Allocations exceed unallocated balance`,
      'ALLOCATION_EXCEEDS_BALANCE',
    );
  }
  allocations.forEach((line, index) => {
    if (line.amount >= 0) return;
    if (Math.abs(line.amount) > unspent(departments[index])) {
      throw new ApiError(422, 'Cannot withdraw budget that has already been spent', 'ALLOCATION_EXCEEDS_UNSPENT');
    }
  });
}

async function notificationPlan(tenantId, departments, allocations) {
  const notices = [];
  for (let index = 0; index < allocations.length; index += 1) {
    const line = allocations[index];
    const entity = departments[index];
    if (!(line.amount > 0) || !entity.managerUserId || entity.managerInvitePending) continue;
    const manager = await User.findOne({ _id: entity.managerUserId, tenantId }).select('status email').lean();
    if (!manager || manager.status !== 'active' || !manager.email) continue;
    notices.push({ entityId: String(entity._id), departmentName: entity.name });
  }
  return notices;
}

function resourceVersion(wallet, departments) {
  return {
    walletId: String(wallet._id),
    balance: Number(wallet.balance) || 0,
    allocatedAmount: Number(wallet.allocatedAmount) || 0,
    updatedAt: new Date(wallet.updatedAt).toISOString(),
    departments: departments
      .map((entity) => ({
        entityId: String(entity._id),
        allocatedAmount: Number(entity.allocatedAmount) || 0,
        spentAmount: Number(entity.spentAmount) || 0,
        updatedAt: new Date(entity.updatedAt).toISOString(),
      }))
      .sort((left, right) => left.entityId.localeCompare(right.entityId)),
  };
}

async function allocationResult(tenantId, requested) {
  const wallet = await loadWallet(tenantId, requested.walletId);
  const departments = await Entity.find({
    tenantId,
    walletId: wallet._id,
    _id: { $in: requested.allocations.map((line) => line.entityId) },
  }).select('name allocatedAmount spentAmount');
  const byId = new Map(departments.map((entity) => [String(entity._id), entity]));
  return {
    walletId: String(wallet._id),
    ...money(wallet.balance, wallet.allocatedAmount),
    netChange: requested.allocations.reduce((sum, line) => sum + line.amount, 0),
    departments: requested.allocations.map((line) => {
      const entity = byId.get(line.entityId);
      return {
        entityId: line.entityId,
        name: entity?.name || '',
        allocatedAmount: Number(entity?.allocatedAmount) || 0,
        unspentAmount: entity ? unspent(entity) : 0,
      };
    }),
  };
}

function linesFor(requested, confirmationId) {
  return requested.allocations.map((line) => ({
    entityId: line.entityId,
    amount: line.amount,
    idempotencyKey: ledgerKey(requested.walletId, line.entityId, confirmationId),
  }));
}

export async function prepareBudgetAllocation({ tenantId, actorUserId, input, now }) {
  const requested = parseAllocation(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.allocate',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertBudgetWriter(actor);
      planned.wallet = await loadWallet(tenantId, requested.walletId);
      planned.departments = await loadDepartments(tenantId, planned.wallet._id, requested.allocations);
      assertAffordable(planned.wallet, planned.departments, requested.allocations);
      planned.notifications = await notificationPlan(tenantId, planned.departments, requested.allocations);
    },
    validate: async () => requested,
    resourceState: async () => resourceVersion(
      await loadWallet(tenantId, requested.walletId),
      await loadDepartments(tenantId, requested.walletId, requested.allocations),
    ),
    summary: async () => ({
      action: 'preview',
      walletId: requested.walletId,
      lineCount: requested.allocations.length,
      netChange: requested.allocations.reduce((sum, line) => sum + line.amount, 0),
    }),
  });
  const before = money(planned.wallet.balance, planned.wallet.allocatedAmount);
  const netChange = requested.allocations.reduce((sum, line) => sum + line.amount, 0);
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: {
      walletId: String(planned.wallet._id),
      currency: planned.wallet.currency || 'INR',
      netChange,
      before,
      after: money(before.balance, before.allocatedAmount + netChange),
      departments: requested.allocations.map((line, index) => {
        const entity = planned.departments[index];
        const beforeUnspent = unspent(entity);
        return {
          entityId: String(entity._id),
          name: entity.name,
          amount: line.amount,
          beforeAllocated: Number(entity.allocatedAmount) || 0,
          afterAllocated: (Number(entity.allocatedAmount) || 0) + line.amount,
          beforeUnspent,
          afterUnspent: beforeUnspent + line.amount,
        };
      }),
      notifications: planned.notifications,
    },
  };
}

export async function executeBudgetAllocation({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  const requested = parseAllocation(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'wallets.allocate',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertBudgetWriter(actor);
      const wallet = await loadWallet(tenantId, requested.walletId);
      await loadDepartments(tenantId, wallet._id, requested.allocations);
    },
    validate: async () => requested,
    resourceState: async () => resourceVersion(
      await loadWallet(tenantId, requested.walletId),
      await loadDepartments(tenantId, requested.walletId, requested.allocations),
    ),
    reconcile: async () => {
      const wallet = await Wallet.findOne({ _id: requested.walletId, tenantId });
      if (!wallet) return { outcome: 'uncertain' };
      return { outcome: 'absent' };
    },
    execute: async (actor) => {
      await allocate({
        tenantId,
        walletId: requested.walletId,
        userId: actor.user.userId,
        allocations: linesFor(requested, confirmationId),
      });
      const result = await allocationResult(tenantId, requested);
      await writeAudit({
        tenantId,
        req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
        action: 'wallet.allocate',
        entityType: 'Wallet',
        entityId: requested.walletId,
        after: { netChange: result.netChange, lineCount: requested.allocations.length },
      });
      return result;
    },
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Budget allocation is not available for this account');
  }
  return caller;
}

export async function prepareBudgetAllocationForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return prepareBudgetAllocation({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executeBudgetAllocationForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executeBudgetAllocation({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function budgetText(output, heading) {
  const preview = output.preview;
  if (!preview) {
    return [heading, `Net change ${output.netChange} INR`].join('\n');
  }
  const names = preview.departments.map((line) => `${line.name} ${line.amount}`).join(', ');
  return [heading, `Net change ${preview.netChange} INR`, names, 'Confirm this preview before it expires.'].join('\n');
}

const WRITE_ERRORS = {
  FORBIDDEN: 'You cannot allocate budget.',
  NOT_FOUND: 'That wallet or department was not found.',
  VALIDATION: 'Allocation details are not valid.',
  ALLOCATION_EXCEEDS_BALANCE: 'This allocation exceeds the unallocated wallet balance.',
  ALLOCATION_EXCEEDS_UNSPENT: 'Cannot withdraw budget that has already been spent.',
  ALLOCATION_KEY_CONFLICT: 'This allocation was already recorded with different details.',
  INSUFFICIENT_FUNDS: 'The wallet does not have enough unallocated budget.',
  INVALID_ALLOCATION: 'This allocation is not allowed.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the allocation again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the allocation again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested allocation.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different allocation.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This allocation is already in progress.',
  IDEMPOTENCY_RECONCILIATION_REQUIRED: 'This allocation needs to be checked before it can be retried.',
  ACTOR_INACTIVE: 'This account cannot allocate budget.',
  TENANT_INACTIVE: 'This workspace cannot allocate budget.',
};

export function budgetError(error, fallback) {
  return WRITE_ERRORS[error?.code] || fallback;
}
