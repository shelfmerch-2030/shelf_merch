import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, makeEntity, makeFundedWallet } from './helpers.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { User } from '../src/modules/users/user.model.js';
import { Payment } from '../src/modules/payments/payment.model.js';
import { McpWalletClaim } from '../src/modules/mcp/mcpWalletClaim.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import * as ledger from '../src/services/ledger.service.js';
import { deleteIncompleteWallet, setupWallet } from '../src/modules/wallets/wallets.service.js';
import { listEntitiesForCaller, entitiesListText } from '../src/modules/mcp/entitiesRead.js';
import { listBalancesForCaller, walletBalancesText } from '../src/modules/mcp/walletsRead.js';
import { summarizePointsForCaller } from '../src/modules/mcp/pointsGiftsRead.js';
import { departmentRemaining } from '../src/modules/mcp/walletVisibility.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { prepareBudgetAllocationForCaller, executeBudgetAllocationForCaller } from '../src/modules/mcp/budgetsWrite.js';
import { prepareEntitySetup } from '../src/modules/mcp/entitiesWrite.js';
import { allocateCredits, launchCampaign, deliverScheduledCampaign, assertWalletCanSpend } from '../src/modules/campaigns/campaigns.service.js';
import { submitRedemption } from '../src/modules/redemptions/redemptions.service.js';
import { createCampaignCheckoutOrder } from '../src/modules/payments/payments.service.js';

beforeAll(async () => {
  await connectTestDb();
  // Refuse mutation tests against a configured remote application database.
  expect(mongoose.connection.host).toMatch(/^(127\.0\.0\.1|localhost|::1)$/);
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function fixture() {
  const tenant = await makeTenant();
  const { user } = await makeUser(tenant, 'company_admin');
  const wallet = await makeFundedWallet(tenant, { amount: 10000 });
  const entity = await makeEntity(tenant, wallet);
  await ledger.allocateToEntities({ tenantId: tenant._id, walletId: wallet._id, allocations: [{ entityId: entity._id, amount: 1000 }], performedBy: user._id });
  const ctx = buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } });
  return { tenant, user, wallet, entity, ctx };
}
async function makeUnavailable(f, kind) {
  if (kind === 'missing') await Wallet.collection.deleteOne({ _id: f.wallet._id });
  else if (kind === 'deleted') await Wallet.collection.updateOne({ _id: f.wallet._id }, { $set: { deletedAt: new Date() } });
  else if (kind === 'foreign') {
    const other = await makeTenant();
    await Wallet.collection.updateOne({ _id: f.wallet._id }, { $set: { tenantId: other._id } });
  } else await Wallet.collection.updateOne({ _id: f.wallet._id }, { $set: { status: 'closed' } });
}
const unavailableError = kind => ({ code: kind === 'ineligible' ? 'WALLET_UNAVAILABLE' : 'NOT_FOUND' });
async function financialSnapshot(f) {
  return JSON.stringify({
    wallets: await Wallet.collection.find({ _id: f.wallet._id }).toArray(),
    entity: await Entity.collection.findOne({ _id: f.entity._id }),
    ledger: await WalletTransaction.collection.find({ tenantId: f.tenant._id }).sort({ _id: 1 }).toArray(),
  });
}

it.each(['missing', 'deleted', 'foreign', 'ineligible'])('rejects financial writes for a %s parent without falling back or altering history', async kind => {
  const f = await fixture();
  const healthy = await makeFundedWallet(f.tenant, { name: 'Other existing wallet', amount: 50000 });
  await makeUnavailable(f, kind);
  const before = await financialSnapshot(f);
  await expect(ledger.resolveSpendWalletForEntity({ tenantId: f.tenant._id, entityId: f.entity._id })).rejects.toMatchObject(unavailableError(kind));
  await expect(assertWalletCanSpend({ tenantId: f.tenant._id, entityId: f.entity._id, amount: 0 })).rejects.toMatchObject(unavailableError(kind));
  await expect(ledger.createTransaction({ tenantId: f.tenant._id, walletId: f.wallet._id, type: 'fund_in', amount: 100 })).rejects.toMatchObject(unavailableError(kind));
  await expect(ledger.createTransaction({ tenantId: f.tenant._id, walletId: healthy._id, relatedEntityId: f.entity._id, type: 'campaign_spend', amount: -100 })).rejects.toMatchObject({ code: 'ENTITY_WALLET_MISMATCH' });
  await expect(ledger.allocateToEntities({ tenantId: f.tenant._id, walletId: healthy._id, allocations: [{ entityId: f.entity._id, amount: 100 }] })).rejects.toMatchObject({ code: 'ENTITY_WALLET_MISMATCH' });
  await expect(departmentRemaining(f.tenant._id, f.entity._id)).rejects.toMatchObject(unavailableError(kind));
  expect(await financialSnapshot(f)).toBe(before);
  expect((await Wallet.findOne({ _id: healthy._id, tenantId: f.tenant._id })).balance).toBe(50000);
});

it.each(['missing', 'deleted', 'foreign', 'ineligible'])('reports a %s department parent as unavailable history, never spendable budget', async kind => {
  const f = await fixture();
  await makeUnavailable(f, kind);
  const before = await financialSnapshot(f);
  const result = await listEntitiesForCaller(f.ctx);
  expect(result.departments).toEqual([]);
  expect(result.unavailableDepartments).toEqual([expect.objectContaining({ entityId: String(f.entity._id), availability: 'unavailable', historicalAllocatedAmount: 1000, historicalSpentAmount: 0 })]);
  expect(result.unavailableDepartments[0]).not.toHaveProperty('remainingAmount');
  expect(entitiesListText(result)).toContain('not spendable');
  const summary = await summarizePointsForCaller(f.ctx);
  expect(summary.entities).toEqual([]);
  expect(summary.unavailableEntities[0]).not.toHaveProperty('availableAllocationInr');
  const balances = await listBalancesForCaller(f.ctx);
  expect(balances).toMatchObject({ items: [], availability: 'unavailable' });
  expect(walletBalancesText(balances)).toContain('not a verified zero balance');
  const tool = await runCopilotTool('entities_list', f.ctx, {}, 'company_admin');
  expect(tool.artifacts).toEqual([]);
  expect(await financialSnapshot(f)).toBe(before);
});

it('distinguishes an eligible zero-balance wallet from unavailable parent data and retains valid allocation idempotency', async () => {
  const f = await fixture();
  const zero = await makeFundedWallet(f.tenant, { name: 'Valid empty wallet', amount: 0 });
  const balances = await listBalancesForCaller(f.ctx);
  expect(balances.items.find(w => w.id === String(zero._id))).toMatchObject({ balance: 0, unallocatedAmount: 0 });
  expect(balances.availability).not.toBe('unavailable');
  const input = { tenantId: f.tenant._id, walletId: f.wallet._id, allocations: [{ entityId: f.entity._id, amount: 100, idempotencyKey: 'valid-allocation' }] };
  const first = await ledger.allocateToEntities(input), second = await ledger.allocateToEntities(input);
  expect(String(first[0]._id)).toBe(String(second[0]._id));
  expect((await ledger.readEntityLedgerTotals({ tenantId: f.tenant._id, entityId: f.entity._id })).allocatedAmount).toBe(1100);
});

it('separates healthy and orphaned departments and preserves manager tenant isolation', async () => {
  const f = await fixture();
  const orphan = await makeEntity(f.tenant, { _id: new mongoose.Types.ObjectId() }, 'Historical department', { allocatedAmount: 900 });
  const manager = await makeUser(f.tenant, 'entity_manager', 'entity', { scopeId: orphan._id, assignedEntityIds: [orphan._id] });
  const result = await listEntitiesForCaller(f.ctx);
  expect(result.departments.map(e => e.entityId)).toEqual([String(f.entity._id)]);
  expect(result.unavailableDepartments.map(e => e.entityId)).toEqual([String(orphan._id)]);
  const ctx = buildCopilotToolCtx({ tenantId: f.tenant._id, user: { userId: manager.user._id, role: 'entity_manager', scopeType: 'entity', assignedEntityIds: [orphan._id] } });
  const scoped = await listEntitiesForCaller(ctx);
  expect(scoped.departments).toEqual([]);
  expect(scoped.unavailableDepartments.map(e => e.entityId)).toEqual([String(orphan._id)]);
  expect((await listBalancesForCaller(ctx))).toEqual({ items: [], scope: 'department' });
});

it('rechecks wallet presence between MCP PREPARE and EXECUTE without applying allocations', async () => {
  const f = await fixture();
  const args = { walletId: String(f.wallet._id), allocations: [{ entityId: String(f.entity._id), amount: 100 }] };
  const prepared = await prepareBudgetAllocationForCaller(f.ctx, args);
  await makeUnavailable(f, 'missing');
  const before = await financialSnapshot(f);
  await expect(executeBudgetAllocationForCaller(f.ctx, { ...args, confirmationId: prepared.confirmationId, idempotencyKey: 'parent-removed-after-preview' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await financialSnapshot(f)).toBe(before);
  await expect(prepareBudgetAllocationForCaller(f.ctx, args)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it.each(['missing', 'deleted', 'ineligible'])('blocks campaign credit, launch and redemption writes before side effects for a %s wallet', async kind => {
  const f = await fixture();
  const campaign = await Campaign.create({ tenantId: f.tenant._id, entityId: f.entity._id, name: 'Historical campaign', type: 'points', status: 'approved', creditsPerRecipient: 500, totalBudget: 500 });
  const recipient = await Recipient.create({ tenantId: f.tenant._id, campaignId: campaign._id, name: 'Synthetic', email: 'synthetic@example.test', redemptionToken: 'synthetic-integrity-token', redemptionStatus: 'verified', creditAmount: 500 });
  await makeUnavailable(f, kind);
  const before = JSON.stringify({ campaign: await Campaign.collection.findOne({ _id: campaign._id }), recipient: await Recipient.collection.findOne({ _id: recipient._id }) });
  const user = { userId: f.user._id, role: 'company_admin', scopeType: 'tenant' };
  await expect(allocateCredits({ tenantId: f.tenant._id, campaignId: campaign._id, user, creditsPerRecipient: 500, paymentMode: 'upi' })).rejects.toMatchObject(unavailableError(kind));
  await expect(launchCampaign({ tenantId: f.tenant._id, campaignId: campaign._id, user })).rejects.toMatchObject(unavailableError(kind));
  await expect(createCampaignCheckoutOrder({ tenantId: f.tenant._id, recipientId: recipient._id, amountInr: 100 })).rejects.toMatchObject(unavailableError(kind));
  expect(JSON.stringify({ campaign: await Campaign.collection.findOne({ _id: campaign._id }), recipient: await Recipient.collection.findOne({ _id: recipient._id }) })).toBe(before);
  // Simulate already-open historical campaign only in the isolated fixture.
  await Campaign.collection.updateOne({ _id: campaign._id }, { $set: { status: 'redemption_open' } });
  await expect(submitRedemption(recipient.redemptionToken, { items: [], shippingAddress: {} })).rejects.toMatchObject(unavailableError(kind));
  expect((await Recipient.findOne({ _id: recipient._id, tenantId: f.tenant._id })).creditAmount).toBe(500);
  expect(await Order.countDocuments({ tenantId: f.tenant._id })).toBe(0);
  expect(await Payment.countDocuments({ tenantId: f.tenant._id })).toBe(0);
});

it('blocks scheduled points-credit distribution when its parent is missing', async () => {
  const f = await fixture();
  const campaign = await Campaign.create({ tenantId: f.tenant._id, entityId: f.entity._id, name: 'Scheduled fixture', type: 'points', status: 'launched', creditsPerRecipient: 500, schedule: { mode: 'scheduled', sendAt: new Date() } });
  const recipient = await Recipient.create({ tenantId: f.tenant._id, campaignId: campaign._id, name: 'Synthetic', email: 'scheduled@example.test', redemptionToken: 'scheduled-integrity-token', creditAmount: 0 });
  await makeUnavailable(f, 'missing');
  await expect(deliverScheduledCampaign({ tenantId: f.tenant._id, campaignId: campaign._id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect((await Recipient.findOne({ _id: recipient._id, tenantId: f.tenant._id })).creditAmount).toBe(0);
});

it.each(['department', 'deleted-department', 'payment', 'claim', 'pending-funding'])('blocks deleting an unused draft with a %s dependency', async kind => {
  const tenant = await makeTenant(), { user } = await makeUser(tenant, 'company_admin');
  const wallet = await Wallet.create({ tenantId: tenant._id, name: 'Draft with dependencies' });
  let entity;
  if (kind.includes('department')) {
    entity = await makeEntity(tenant, wallet, 'Empty department', { managerUserId: user._id });
    if (kind === 'deleted-department') await Entity.collection.updateOne({ _id: entity._id }, { $set: { deletedAt: new Date() } });
  }
  if (kind === 'payment') await Payment.create({ tenantId: tenant._id, relatedType: 'wallet_funding', relatedId: wallet._id, amount: 100, status: 'pending' });
  if (kind === 'claim') await McpWalletClaim.create({ tenantId: tenant._id, logicalKey: 'fixture', walletId: wallet._id });
  if (kind === 'pending-funding') await Wallet.updateOne({ tenantId: tenant._id, _id: wallet._id }, { $set: { 'fundingDocument.approvalStatus': 'pending' } });
  const before = JSON.stringify({ wallet: await Wallet.collection.findOne({ _id: wallet._id }), users: await User.collection.find({ tenantId: tenant._id }, { projection: { _id: 1, status: 1 } }).toArray(), roles: await RoleAssignment.collection.find({ tenantId: tenant._id }).toArray() });
  await expect(deleteIncompleteWallet({ tenantId: tenant._id, walletId: wallet._id })).rejects.toMatchObject({ code: 'WALLET_NOT_DELETABLE' });
  expect(JSON.stringify({ wallet: await Wallet.collection.findOne({ _id: wallet._id }), users: await User.collection.find({ tenantId: tenant._id }, { projection: { _id: 1, status: 1 } }).toArray(), roles: await RoleAssignment.collection.find({ tenantId: tenant._id }).toArray() })).toBe(before);
  expect(await WalletTransaction.countDocuments({ tenantId: tenant._id })).toBe(0);
});

it('blocks automatic draft cleanup when departments exist, and permits truly empty draft rollback', async () => {
  const tenant = await makeTenant(), { user } = await makeUser(tenant, 'company_admin');
  const wallet = await Wallet.create({ tenantId: tenant._id, name: 'Retained draft' });
  await makeEntity(tenant, wallet);
  await expect(setupWallet({ tenantId: tenant._id, userId: user._id, data: { name: wallet.name, amount: 0, fundingMethod: 'online' } })).rejects.toMatchObject({ code: 'WALLET_NOT_DELETABLE' });
  expect(await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id })).not.toBeNull();
  const empty = await Wallet.create({ tenantId: tenant._id, name: 'Truly unused draft' });
  await deleteIncompleteWallet({ tenantId: tenant._id, walletId: empty._id });
  expect(await Wallet.findOne({ _id: empty._id, tenantId: tenant._id })).toBeNull();
  expect(await Wallet.collection.findOne({ _id: empty._id })).toMatchObject({ deletedAt: expect.any(Date) });
});

it('blocks deleting a zero-net-balance draft that has financial history', async () => {
  const tenant = await makeTenant();
  const wallet = await Wallet.create({ tenantId: tenant._id, name: 'Historic zero' });
  await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 100 });
  await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'adjustment', amount: -100 });
  await expect(deleteIncompleteWallet({ tenantId: tenant._id, walletId: wallet._id })).rejects.toMatchObject({ code: 'WALLET_NOT_DELETABLE' });
  expect((await Wallet.findOne({ tenantId: tenant._id, _id: wallet._id })).balance).toBe(0);
  expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, walletId: wallet._id })).toBe(2);
});

it('rejects department-setup PREPARE for an ineligible parent before creating users, assignments or claims', async () => {
  const f = await fixture();
  await makeUnavailable(f, 'ineligible');
  const counts = { users: await User.countDocuments({ tenantId: f.tenant._id }), roles: await RoleAssignment.countDocuments({ tenantId: f.tenant._id }), entities: await Entity.countDocuments({ tenantId: f.tenant._id }) };
  await expect(prepareEntitySetup({ tenantId: f.tenant._id, actorUserId: f.user._id, input: {
    walletId: String(f.wallet._id), departments: [{ name: 'Must not be created', budget: 100, manager: { name: 'Synthetic', email: 'never-create@example.test', sendInvite: false } }],
  } })).rejects.toMatchObject({ code: 'WALLET_UNAVAILABLE' });
  expect({ users: await User.countDocuments({ tenantId: f.tenant._id }), roles: await RoleAssignment.countDocuments({ tenantId: f.tenant._id }), entities: await Entity.countDocuments({ tenantId: f.tenant._id }) }).toEqual(counts);
});
