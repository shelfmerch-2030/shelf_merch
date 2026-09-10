import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { signAccessToken, hashPassword } from '../src/modules/auth/auth.service.js';
import * as ledger from '../src/services/ledger.service.js';

/**
 * Shared test factories — keep HTTP integration suites consistent without
 * duplicating tenant/user/wallet seeding in every file.
 */

export async function makeTenant(overrides = {}) {
  const slug = overrides.slug ?? `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return Tenant.create({
    name: overrides.name ?? 'Test Co',
    slug,
    currency: 'INR',
    status: 'active',
    ...overrides,
  });
}

/** Permit emails through the allowlist-only auth gate (login / register / invite). */
export async function allowlistAuthEmails(...emails) {
  const { appendEmailAllowlist } = await import('../src/modules/auth/workEmail.js');
  return appendEmailAllowlist(emails.flat());
}

export async function makeUser(tenant, role, scopeType = 'tenant', extra = {}) {
  const email =
    extra.email ??
    `${role}-${tenant?.slug ?? 'platform'}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`;
  const user = await User.create({
    tenantId: tenant?._id ?? null,
    name: extra.name ?? `${role} user`,
    email,
    passwordHash: extra.password ? await hashPassword(extra.password) : undefined,
    status: extra.status ?? 'active',
  });
  await allowlistAuthEmails(email);
  const assignment = await RoleAssignment.create({
    tenantId: tenant?._id ?? null,
    userId: user._id,
    role,
    scopeType,
    scopeId: extra.scopeId,
    assignedEntityIds: extra.assignedEntityIds ?? [],
  });
  return { user, assignment, token: signAccessToken(user, assignment) };
}

export async function makeFundedWallet(tenant, { name = 'Budget', amount = 1_000_000, ...rest } = {}) {
  const wallet = await Wallet.create({
    tenantId: tenant._id,
    name,
    fundingMethod: 'po_upload',
    fundingDocument: { approvalStatus: 'approved' },
    status: rest.status ?? 'active',
    ...rest,
  });
  if (amount > 0) {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
      amount,
    });
  }
  return Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
}

export async function makeEntity(tenant, wallet, name = 'Marketing', extra = {}) {
  return Entity.create({
    tenantId: tenant._id,
    walletId: wallet._id,
    name,
    ...extra,
  });
}

export async function makeShop(tenant, overrides = {}) {
  return Shop.create({
    tenantId: tenant._id,
    name: overrides.name ?? 'Test Shop',
    status: overrides.status ?? 'live',
    ...overrides,
  });
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
