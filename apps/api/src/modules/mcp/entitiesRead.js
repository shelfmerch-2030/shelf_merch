import { z } from 'zod';
import { ForbiddenError } from '../../utils/errors.js';
import { Entity } from '../entities/entity.model.js';
import { User } from '../users/user.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';

const READ_ROLES = new Set(rolesForTenantArea('wallets', 'read'));

export const ENTITIES_LIST_DESCRIPTION = [
  'List departments the caller is allowed to see.',
  'Company admins see every department in the workspace. Department managers see only departments assigned to them.',
  'Each row includes the department id, name, allocated budget, remaining budget, manager name and title, and the wallet id.',
  'Manager email, phone, and invitation links are not included.',
].join(' ');

export const entitiesListInputSchema = z.object({
  walletId: z.string().trim().regex(/^[a-f0-9]{24}$/i).optional(),
});

const departmentSchema = z.object({
  entityId: z.string(),
  name: z.string(),
  allocatedAmount: z.number(),
  spentAmount: z.number(),
  remainingAmount: z.number(),
  walletId: z.string(),
  walletName: z.string(),
  manager: z.object({
    name: z.string(),
    title: z.string(),
    invitePending: z.boolean(),
    assigned: z.boolean(),
  }),
});

export const entitiesListOutputSchema = z.object({
  departments: z.array(departmentSchema),
});

function assertReader(user) {
  if (!READ_ROLES.has(user?.role)) {
    throw new ForbiddenError('Departments are not available for this account');
  }
}

async function visibleIds(tenantId, user) {
  const manager = user.role === 'entity_manager' || user.scopeType === 'entity';
  if (!manager) return null;
  const dbUser = user.userId
    ? await User.findOne({ _id: user.userId, tenantId }).select('email').lean()
    : null;
  const email = dbUser?.email?.toLowerCase();
  const or = [{ managerUserId: user.userId }];
  if (email) or.push({ managerEmail: email });
  const managed = user.userId
    ? await Entity.find({ tenantId, $or: or }).select('_id').lean()
    : [];
  return [...new Set([
    ...(user.assignedEntityIds ?? []).map(String),
    ...managed.map((entity) => String(entity._id)),
  ])].filter(Boolean);
}

function present(entity, walletName) {
  const allocated = Number(entity.allocatedAmount) || 0;
  const spent = Number(entity.spentAmount) || 0;
  const name = entity.managerName || '';
  return {
    entityId: String(entity._id),
    name: entity.name,
    allocatedAmount: allocated,
    spentAmount: spent,
    remainingAmount: Math.max(0, allocated - spent),
    walletId: String(entity.walletId),
    walletName: walletName || '',
    manager: {
      name,
      title: entity.managerTitle || '',
      invitePending: Boolean(entity.managerInvitePending),
      assigned: Boolean(entity.managerUserId || entity.managerEmail || name),
    },
  };
}

export async function listEntitiesForCaller(ctx, args = {}) {
  const reader = employeeReaderFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('Departments are not available for this account');
  assertReader(reader.user);
  const parsed = entitiesListInputSchema.safeParse(args ?? {});
  if (!parsed.success) throw new ForbiddenError('Department filter is not valid');
  return listDepartments({
    tenantId: reader.tenantId,
    user: reader.user,
    walletId: parsed.data.walletId,
  });
}

export async function listDepartments({ tenantId, user, walletId }) {
  assertReader(user);
  const filter = { tenantId, ...(walletId ? { walletId } : {}) };
  const visible = await visibleIds(tenantId, user);
  if (visible) filter._id = { $in: visible };
  const entities = await Entity.find(filter).sort({ createdAt: 1 }).lean();
  const walletIds = [...new Set(entities.map((entity) => String(entity.walletId)))];
  const wallets = walletIds.length
    ? await Wallet.find({ tenantId, _id: { $in: walletIds } }).select('name').lean()
    : [];
  const names = new Map(wallets.map((wallet) => [String(wallet._id), wallet.name || '']));
  return {
    departments: entities.map((entity) => present(entity, names.get(String(entity.walletId)))),
  };
}

export function entitiesListText(output) {
  const rows = output?.departments ?? [];
  if (!rows.length) return 'No departments are visible for this account.';
  return rows
    .map((row) => `${row.name}: allocated ${row.allocatedAmount} INR, remaining ${row.remainingAmount} INR`)
    .join('\n');
}

export function entitiesReadError(error, fallback) {
  return error?.message || fallback;
}
