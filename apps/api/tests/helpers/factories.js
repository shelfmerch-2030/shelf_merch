import { Tenant } from '../../src/modules/tenants/tenant.model.js';
import { User } from '../../src/modules/users/user.model.js';
import { RoleAssignment } from '../../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../../src/modules/wallets/wallet.model.js';
import { Entity } from '../../src/modules/entities/entity.model.js';
import { Shop } from '../../src/modules/shops/shop.model.js';
import { Campaign } from '../../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../../src/modules/campaigns/recipient.model.js';
import { Order } from '../../src/modules/orders/order.model.js';
import { hashPassword, signAccessToken } from '../../src/modules/auth/auth.service.js';
import * as ledger from '../../src/services/ledger.service.js';

/** Unique email for parallel-safe fixtures. */
export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`;
}

/**
 * Create a user + role assignment and return a signed access token.
 * @param {import('mongoose').Document|null} tenant
 * @param {string} role
 * @param {'tenant'|'entity'|'platform'} scopeType
 * @param {object} [extra] RoleAssignment fields + optional user overrides
 */
export async function makeUser(tenant, role, scopeType, extra = {}) {
  const { status = 'active', password, name, email, ...assignmentExtra } = extra;
  const user = await User.create({
    tenantId: tenant?._id ?? null,
    name: name ?? `${role} user`,
    email: email ?? uniqueEmail(role),
    status,
    ...(password ? { passwordHash: await hashPassword(password) } : {}),
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant?._id ?? null,
    userId: user._id,
    role,
    scopeType,
    ...assignmentExtra,
  });
  return { user, assignment, token: signAccessToken(user, assignment) };
}

/** Tenant + company admin (+ optional funded wallet / entity). */
export async function seedTenantWorkspace({
  name = 'Rubix',
  slug = `rubix-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  fundAmount = 100_000,
  withEntity = true,
  withShop = false,
} = {}) {
  const tenant = await Tenant.create({ name, slug });
  const admin = await makeUser(tenant, 'company_admin', 'tenant');
  const wallet = await Wallet.create({
    tenantId: tenant._id,
    name: `${name} Wallet`,
    fundingMethod: 'po_upload',
    fundingDocument: { approvalStatus: 'approved' },
  });
  if (fundAmount > 0) {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'fund_in',
      amount: fundAmount,
    });
  }
  let entity = null;
  if (withEntity) {
    entity = await Entity.create({
      tenantId: tenant._id,
      walletId: wallet._id,
      name: 'Marketing',
    });
  }
  let shop = null;
  if (withShop) {
    shop = await Shop.create({
      tenantId: tenant._id,
      name: `${name} Shop`,
      slug: `${slug}-shop`,
      status: 'live',
    });
  }
  return { tenant, ...admin, wallet, entity, shop };
}

/** Allocate budget to an entity (ledger). */
export async function allocateToEntity({ tenantId, walletId, entityId, amount }) {
  return ledger.createTransaction({
    tenantId,
    walletId,
    type: 'allocation_to_entity',
    amount,
    relatedEntityId: entityId,
  });
}

/** Minimal order fixture for list/detail/ABAC tests. */
export async function seedOrderForEntity({
  tenant,
  entity,
  shop,
  status = 'created',
  orderNumber = `SM-TEST-${Date.now()}`,
  campaignName = 'Test Campaign',
}) {
  const campaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: campaignName,
    type: 'points',
    shopId: shop?._id,
    status: 'redemption_open',
    creditsPerRecipient: 1000,
    totalBudget: 1000,
    recipientCount: 1,
  });
  const recipient = await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Alice',
    email: uniqueEmail('recipient'),
    creditAmount: 1000,
    redemptionToken: `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    redemptionStatus: 'order_created',
  });
  const order = await Order.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    recipientId: recipient._id,
    orderNumber,
    items: [{ name: 'Test Tee', qty: 1, unitPriceInr: 500 }],
    shippingAddress: {
      name: 'Alice',
      line1: '123 St',
      city: 'Hyderabad',
      state: 'TS',
      pincode: '500001',
    },
    amountBreakdown: { subtotal: 500, serviceFee: 0, gst: 90, total: 590 },
    status,
  });
  return { campaign, recipient, order };
}

export { ledger };
