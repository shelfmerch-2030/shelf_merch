import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, makeFundedWallet, makeEntity, makeShop } from './helpers.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { McpWriteIdempotency } from '../src/modules/mcp/mcpWriteIdempotency.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { CampaignOperation } from '../src/modules/campaigns/campaignOperation.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { preparePointsDraft, executePointsDraft } from '../src/modules/mcp/campaignsDraftWrite.js';
import { prepareCreditAllocation, executeCreditAllocation } from '../src/modules/mcp/campaignsSendWrite.js';
import { ApiError } from '../src/utils/errors.js';
import { allocateCredits } from '../src/modules/campaigns/campaigns.service.js';

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterEach(() => vi.restoreAllMocks());
afterAll(disconnectTestDb);
const fault = () => new ApiError(503, 'Synthetic storage interruption', 'TEST_INTERRUPTION');

async function fixture(options = {}) {
  const tenant = await makeTenant();
  const { user } = await makeUser(tenant, 'company_admin');
  const wallet = await makeFundedWallet(tenant, { amount: 5000 });
  const entity = await makeEntity(tenant, wallet, 'Recovery fixture');
  const shop = await makeShop(tenant, { pointsConversionEnabled: false });
  const scope = { tenantId: tenant._id, actorUserId: user._id };
  const input = { entityId: String(entity._id), shopId: String(shop._id), name: 'Recovery fixture', creditsPerRecipient: 0,
    message: { from: 'Fixture', body: 'Test delivery' }, schedule: options.schedule || { mode: 'self' }, recipients: [
      { name: 'Fixture A', email: 'fixture-a@example.test', phone: '+919876543210' },
      { name: 'Fixture B', email: 'fixture-b@example.test' },
    ].slice(0, options.count || 2) };
  const prepared = await preparePointsDraft({ ...scope, input });
  const draftArgs = { ...scope, input, confirmationId: prepared.confirmationId, idempotencyKey: 'draft-recovery' };
  return { tenant, user, wallet, entity, scope, input, draftArgs };
}
async function savedFixture(options) {
  const f = await fixture(options);
  f.saved = await executePointsDraft(f.draftArgs);
  return f;
}
async function allocationFixture(options) {
  const f = await savedFixture(options);
  const input = { campaignId: f.saved.id, creditsPerRecipient: 250 };
  const prepared = await prepareCreditAllocation({ ...f.scope, input });
  return { ...f, allocation: { ...f.scope, input, confirmationId: prepared.confirmationId, idempotencyKey: 'allocation-recovery' } };
}
async function loseMcpCompletion(args) {
  await McpWriteIdempotency.updateOne({ tenantId: args.tenantId, key: args.idempotencyKey }, {
    $set: { status: 'pending', result: null, leaseOwner: 'crashed-worker', leaseExpiresAt: new Date(0) },
  });
}
async function failAllocation(f, stage = 'recipients') {
  const injected = stage === 'recipients'
    ? vi.spyOn(Recipient, 'updateMany').mockRejectedValueOnce(fault())
    : vi.spyOn(Campaign.prototype, 'save').mockRejectedValueOnce(fault());
  await expect(executeCreditAllocation(f.allocation)).rejects.toMatchObject({ code: 'TEST_INTERRUPTION' });
  injected.mockRestore();
}
async function noFinancialEffects(f) {
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id, invitedAt: { $ne: null } })).toBe(0);
  expect((await Wallet.findOne({ tenantId: f.tenant._id, _id: f.wallet._id })).balance).toBe(5000);
}

it('never reports a partial sequential recipient upsert as a completed draft', async () => {
  const f = await fixture();
  const original = Recipient.findOneAndUpdate.bind(Recipient);
  let attempts = 0;
  const injected = vi.spyOn(Recipient, 'findOneAndUpdate').mockImplementation((...args) => {
    if (++attempts === 2) throw fault();
    return original(...args);
  });
  await expect(executePointsDraft(f.draftArgs)).rejects.toMatchObject({ code: 'TEST_INTERRUPTION' });
  injected.mockRestore();
  await expect(executePointsDraft(f.draftArgs)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect((await McpWriteIdempotency.findOne({ tenantId: f.tenant._id, key: f.draftArgs.idempotencyKey })).status).toBe('failed');
  await noFinancialEffects(f);
});

it('recovers a fully durable draft after losing its MCP completion without repeating upserts', async () => {
  const f = await savedFixture();
  await loseMcpCompletion(f.draftArgs);
  const spy = vi.spyOn(Recipient, 'findOneAndUpdate');
  expect(await executePointsDraft(f.draftArgs)).toMatchObject({ id: f.saved.id, recipientCount: 2 });
  expect(spy).not.toHaveBeenCalled();
  await noFinancialEffects(f);
});

it.each(['missing', 'extra', 'same-count-email', 'name', 'phone', 'contact', 'credit', 'scope', 'message', 'schedule', 'sendAt', 'timezone', 'amount', 'cached-count', 'funding'])(
  'blocks recovered draft with a %s mismatch', async kind => {
    const f = await savedFixture();
    await loseMcpCompletion(f.draftArgs);
    const filter = { tenantId: f.tenant._id, campaignId: f.saved.id };
    if (kind === 'missing') await Recipient.deleteOne(filter);
    if (kind === 'extra') await Recipient.create({ ...filter, name: 'Unexpected', email: 'extra@example.test', redemptionToken: 'isolated-token' });
    const recipientChanges = { 'same-count-email': { email: 'replacement@example.test' }, name: { name: 'Changed' }, phone: { phone: '+919999999999' }, contact: { contactId: f.user._id }, credit: { creditAmount: 251 } };
    if (recipientChanges[kind]) await Recipient.updateOne(filter, { $set: recipientChanges[kind] });
    const campaignChanges = { scope: { pointsScope: 'stadium' }, message: { 'message.body': 'Changed' }, schedule: { 'schedule.mode': 'now' }, sendAt: { 'schedule.sendAt': new Date(Date.now() + 86400000) }, timezone: { 'schedule.timezone': 'UTC' }, amount: { creditsPerRecipient: 300 }, 'cached-count': { recipientCount: 1 } };
    if (campaignChanges[kind]) await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.saved.id }, { $set: campaignChanges[kind] });
    if (kind === 'funding') await Entity.updateOne({ tenantId: f.tenant._id, _id: f.entity._id }, { $set: { walletId: (await makeFundedWallet(f.tenant))._id } });
    const spy = vi.spyOn(Recipient, 'findOneAndUpdate');
    await expect(executePointsDraft(f.draftArgs)).rejects.toMatchObject({ code: expect.stringMatching(/IDEMPOTENCY_RECONCILIATION_REQUIRED|IDEMPOTENCY_PAYLOAD_MISMATCH/) });
    expect(spy).not.toHaveBeenCalled();
    expect((await McpWriteIdempotency.findOne({ tenantId: f.tenant._id, key: f.draftArgs.idempotencyKey })).status).toBe('pending');
  },
);

it('blocks legacy unverified draft recovery', async () => {
  const f = await savedFixture();
  await loseMcpCompletion(f.draftArgs);
  await McpWriteConfirmation.updateOne({ tenantId: f.tenant._id, confirmationId: f.draftArgs.confirmationId }, { $unset: { recoveryProof: 1 } });
  await expect(executePointsDraft(f.draftArgs)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
});

it.each(['recipients', 'campaign'])('rolls back failure at %s and resumes with the same two receipts and confirmation', async stage => {
  const f = await allocationFixture();
  await failAllocation(f, stage);
  const filter = { tenantId: f.tenant._id, key: `credits:${f.allocation.confirmationId}` };
  const before = await CampaignOperation.findOne(filter);
  const outer = await McpWriteIdempotency.findOne({ tenantId: f.tenant._id, key: f.allocation.idempotencyKey });
  expect(before).toMatchObject({ status: 'failed', retryable: true });
  expect((await Campaign.findOne({ tenantId: f.tenant._id, _id: f.saved.id })).status).toBe('recipients_uploaded');
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id, creditAmount: { $ne: 0 } })).toBe(0);
  expect(await executeCreditAllocation(f.allocation)).toMatchObject({ status: 'approved', recipientCount: 2, totalBudget: 500 });
  const after = await CampaignOperation.findOne(filter);
  expect(String(after._id)).toBe(String(before._id));
  expect(after.fence).toBe(before.fence + 1);
  expect(String((await McpWriteIdempotency.findOne({ tenantId: f.tenant._id, _id: outer._id }))._id)).toBe(String(outer._id));
  expect(await CampaignOperation.countDocuments(filter)).toBe(1);
  expect((await McpWriteConfirmation.findOne({ tenantId: f.tenant._id, confirmationId: f.allocation.confirmationId })).status).toBe('consumed');
  await noFinancialEffects(f);
});

it.each([1, 2])('preserves staged allocation for %s recipients and does not repeat on replay', async count => {
  const f = await allocationFixture({ count });
  expect(await executeCreditAllocation(f.allocation)).toMatchObject({ status: 'approved', recipientCount: count, totalBudget: count * 250 });
  const spy = vi.spyOn(Recipient, 'updateMany');
  await executeCreditAllocation(f.allocation);
  expect(spy).not.toHaveBeenCalled();
  await noFinancialEffects(f);
});

it('preserves scheduled zero-credit staging through recovery', async () => {
  const f = await allocationFixture({ schedule: { mode: 'scheduled', sendAt: new Date(Date.now() + 86400000).toISOString(), timezone: 'Asia/Kolkata' } });
  await failAllocation(f);
  expect(await executeCreditAllocation(f.allocation)).toMatchObject({ status: 'approved', totalBudget: 500 });
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id, creditAmount: 0 })).toBe(2);
  await noFinancialEffects(f);
});

it('fences concurrent same-operation allocation resumes', async () => {
  const f = await allocationFixture();
  await failAllocation(f);
  const spy = vi.spyOn(Recipient, 'updateMany');
  const results = await Promise.allSettled([executeCreditAllocation(f.allocation), executeCreditAllocation(f.allocation)]);
  expect(results.filter(row => row.status === 'fulfilled').length).toBeGreaterThan(0);
  for (const row of results.filter(row => row.status === 'rejected')) expect(['IDEMPOTENT_REPLAY_IN_FLIGHT', 'IDEMPOTENCY_RECONCILIATION_REQUIRED']).toContain(row.reason.code);
  expect(spy).toHaveBeenCalledTimes(1);
  await noFinancialEffects(f);
});

it('recovers atomic completion after MCP worker crash without repeating allocation', async () => {
  const f = await allocationFixture();
  await executeCreditAllocation(f.allocation);
  await loseMcpCompletion(f.allocation);
  const spy = vi.spyOn(Recipient, 'updateMany');
  expect(await executeCreditAllocation(f.allocation)).toMatchObject({ status: 'approved', totalBudget: 500 });
  expect(spy).not.toHaveBeenCalled();
  await noFinancialEffects(f);
});

it('rolls back domain writes if completing the atomic receipt fails', async () => {
  const f = await allocationFixture();
  const original = CampaignOperation.findOneAndUpdate.bind(CampaignOperation);
  let injected = false;
  const spy = vi.spyOn(CampaignOperation, 'findOneAndUpdate').mockImplementation((filter, update, options) => {
    if (!injected && update.$set?.status === 'completed') { injected = true; throw fault(); }
    return original(filter, update, options);
  });
  await expect(executeCreditAllocation(f.allocation)).rejects.toMatchObject({ code: 'TEST_INTERRUPTION' });
  spy.mockRestore();
  expect((await Campaign.findOne({ tenantId: f.tenant._id, _id: f.saved.id })).status).toBe('recipients_uploaded');
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id, creditAmount: { $ne: 0 } })).toBe(0);
  expect(await executeCreditAllocation(f.allocation)).toMatchObject({ status: 'approved' });
  await noFinancialEffects(f);
});

it('fences an old executor that wakes after its expired lease is recovered', async () => {
  const f = await savedFixture();
  const input = { tenantId: f.tenant._id, campaignId: f.saved.id, creditsPerRecipient: 250, idempotencyKey: 'fenced-allocation',
    user: { userId: f.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } };
  let signal;
  let release;
  const waiting = new Promise(resolve => { signal = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const original = CampaignOperation.findOneAndUpdate.bind(CampaignOperation);
  let blocked = false;
  vi.spyOn(CampaignOperation, 'findOneAndUpdate').mockImplementation(async (filter, update, options) => {
    if (!blocked && options?.session && !update.$set?.status) { blocked = true; signal(); await gate; }
    return original(filter, update, options);
  });
  const old = allocateCredits(input).then(value => ({ value }), error => ({ error }));
  try {
    await waiting;
    await CampaignOperation.updateOne({ tenantId: f.tenant._id, key: input.idempotencyKey }, { $set: { leaseExpiresAt: new Date(0) } });
    const spy = vi.spyOn(Recipient, 'updateMany');
    expect(await allocateCredits(input)).toMatchObject({ status: 'approved' });
    release();
    expect((await old).error).toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
    expect(spy).toHaveBeenCalledTimes(1);
  } finally { release(); }
  await noFinancialEffects(f);
});

it('recovers concurrent fully durable draft completions without repeating upserts', async () => {
  const f = await savedFixture();
  await loseMcpCompletion(f.draftArgs);
  const spy = vi.spyOn(Recipient, 'findOneAndUpdate');
  const results = await Promise.allSettled([executePointsDraft(f.draftArgs), executePointsDraft(f.draftArgs)]);
  expect(results.some(row => row.status === 'fulfilled')).toBe(true);
  expect(spy).not.toHaveBeenCalled();
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id })).toBe(2);
});

it('uses the canonical linked draft when an older namesake exists', async () => {
  const f = await savedFixture();
  await Campaign.create({ tenantId: f.tenant._id, entityId: f.entity._id, shopId: f.input.shopId, type: 'points', name: f.input.name,
    createdBy: f.user._id, createdAt: new Date(0) });
  await loseMcpCompletion(f.draftArgs);
  expect(await executePointsDraft(f.draftArgs)).toMatchObject({ id: f.saved.id, recipientCount: 2 });
});

it('still validates minimum amounts when the proposed allocation would be a no-op', async () => {
  const f = await savedFixture();
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.saved.id }, { $set: { status: 'approved' } });
  await expect(allocateCredits({ tenantId: f.tenant._id, campaignId: f.saved.id, creditsPerRecipient: 0, idempotencyKey: 'invalid-noop',
    user: { userId: f.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } })).rejects.toMatchObject({ code: 'BUDGET_TOO_LOW' });
  await noFinancialEffects(f);
});

it('does not resume an allocation with an uncertain commit outcome', async () => {
  const f = await allocationFixture();
  const unknown = fault();
  unknown.hasErrorLabel = label => label === 'UnknownTransactionCommitResult';
  vi.spyOn(Recipient, 'updateMany').mockRejectedValueOnce(unknown);
  await expect(executeCreditAllocation(f.allocation)).rejects.toMatchObject({ code: 'TEST_INTERRUPTION' });
  const spy = vi.spyOn(Recipient, 'updateMany');
  spy.mockClear();
  await expect(executeCreditAllocation(f.allocation)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
  expect(spy).not.toHaveBeenCalled();
  expect((await CampaignOperation.findOne({ tenantId: f.tenant._id })).retryable).toBe(false);
});

it('recovers a failed MCP completion after the atomic allocation committed', async () => {
  const f = await allocationFixture();
  const original = McpWriteIdempotency.findOneAndUpdate.bind(McpWriteIdempotency);
  let injected = false;
  const spy = vi.spyOn(McpWriteIdempotency, 'findOneAndUpdate').mockImplementation((filter, update, options) => {
    if (!injected && update.$set?.status === 'completed') { injected = true; throw fault(); }
    return original(filter, update, options);
  });
  await expect(executeCreditAllocation(f.allocation)).rejects.toMatchObject({ code: 'TEST_INTERRUPTION' });
  spy.mockRestore();
  const recipients = vi.spyOn(Recipient, 'updateMany');
  expect(await executeCreditAllocation(f.allocation)).toMatchObject({ status: 'approved', totalBudget: 500 });
  expect(recipients).not.toHaveBeenCalled();
  await noFinancialEffects(f);
});

it('resumes a crashed, expired child reservation from its exact original pre-state', async () => {
  const f = await allocationFixture();
  await failAllocation(f);
  await CampaignOperation.updateOne({ tenantId: f.tenant._id }, { $set: { status: 'pending', retryable: false, leaseOwner: 'crashed', leaseExpiresAt: new Date(0) } });
  await loseMcpCompletion(f.allocation);
  expect(await executeCreditAllocation(f.allocation)).toMatchObject({ status: 'approved', totalBudget: 500 });
  await noFinancialEffects(f);
});

it('rejects recipient changes between MCP authorization and child reservation', async () => {
  const f = await allocationFixture();
  const original = CampaignOperation.create.bind(CampaignOperation);
  // Capture runs before receipt creation; inject the race immediately after the
  // confirmed before-image was captured but before transaction validation.
  vi.spyOn(CampaignOperation, 'create').mockImplementation(async (...args) => {
    await Recipient.updateOne({ tenantId: f.tenant._id, campaignId: f.saved.id }, { $set: { email: 'raced@example.test' } });
    return original(...args);
  });
  const spy = vi.spyOn(Recipient, 'updateMany');
  await expect(executeCreditAllocation(f.allocation)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
  expect(spy).not.toHaveBeenCalled();
  await noFinancialEffects(f);
});

it.each(['recipient', 'delivery', 'wallet', 'expired', 'permission', 'legacy', 'new-key'])(
  'blocks allocation resume when %s evidence or authorization changes', async kind => {
    const f = await allocationFixture();
    await failAllocation(f);
    if (kind === 'recipient') await Recipient.updateOne({ tenantId: f.tenant._id, campaignId: f.saved.id }, { $set: { email: 'changed@example.test' } });
    if (kind === 'delivery') await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.saved.id }, { $set: { 'schedule.mode': 'now' } });
    if (kind === 'wallet') await Wallet.updateOne({ tenantId: f.tenant._id, _id: f.wallet._id }, { $inc: { balance: -1 } });
    if (kind === 'expired') await McpWriteConfirmation.updateOne({ tenantId: f.tenant._id, confirmationId: f.allocation.confirmationId }, { $set: { expiresAt: new Date(0) } });
    if (kind === 'permission') await RoleAssignment.updateOne({ tenantId: f.tenant._id, userId: f.user._id }, { $set: { role: 'employee' } });
    if (kind === 'legacy') await CampaignOperation.updateOne({ tenantId: f.tenant._id }, { $unset: { recoveryProof: 1 } });
    if (kind === 'new-key') f.allocation.idempotencyKey = 'substituted-key';
    const spy = vi.spyOn(Recipient, 'updateMany');
    await expect(executeCreditAllocation(f.allocation)).rejects.toMatchObject({ code: expect.stringMatching(/RECONCILIATION_REQUIRED|CONFIRMATION_EXPIRED|FORBIDDEN|CONFIRMATION_REUSED|CONFIRMATION_STALE/) });
    expect(spy).not.toHaveBeenCalled();
    expect((await Campaign.findOne({ tenantId: f.tenant._id, _id: f.saved.id })).status).toBe('recipients_uploaded');
  },
);
