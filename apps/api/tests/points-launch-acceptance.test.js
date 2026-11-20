import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, makeFundedWallet, makeEntity, makeShop } from './helpers.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { prepareLaunch, executeLaunch } from '../src/modules/mcp/campaignsSendWrite.js';
import { launchCampaign, deliverScheduledCampaign } from '../src/modules/campaigns/campaigns.service.js';
import * as safety from '../src/modules/campaigns/pointsLaunch.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { notify } from '../src/modules/notifications/notifications.service.js';

vi.mock('../src/modules/notifications/notifications.service.js', async original => ({
  ...await original(), notify: vi.fn(async () => ({ accepted: true })),
}));
beforeAll(connectTestDb);
beforeEach(async () => { await clearTestDb(); vi.mocked(notify).mockReset().mockResolvedValue({ accepted: true }); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(disconnectTestDb);

async function fixture(mode = 'now', count = 1) {
  const tenant = await makeTenant();
  const account = await makeUser(tenant, 'company_admin');
  const user = { userId: account.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] };
  const wallet = await makeFundedWallet(tenant, { amount: 2000 });
  const entity = await makeEntity(tenant, wallet, 'Acceptance');
  const shop = await makeShop(tenant);
  const campaign = await Campaign.create({ tenantId: tenant._id, entityId: entity._id, shopId: shop._id,
    name: 'Approved fixture', type: 'points', status: 'approved', pointsScope: 'shop',
    recipientCount: count, creditsPerRecipient: 250, totalBudget: 250 * count, paymentMode: 'wallet',
    schedule: { mode, ...(mode === 'scheduled' ? { sendAt: new Date(Date.now() + 86400000) } : {}) }, createdBy: account.user._id });
  const recipients = [];
  for (let i = 0; i < count; i++) recipients.push(await Recipient.create({ tenantId: tenant._id, campaignId: campaign._id,
    name: `Approved ${i}`, email: `approved${i}@example.test`, creditAmount: mode === 'scheduled' ? 0 : 250,
    redemptionToken: `isolated-${campaign._id}-${i}` }));
  const scope = { tenantId: tenant._id, actorUserId: account.user._id };
  const input = { campaignId: String(campaign._id) };
  const preview = await prepareLaunch({ ...scope, input });
  const lease = { owner: 'fixture-owner', fence: 1 };
  await Campaign.updateOne({ tenantId: tenant._id, _id: campaign._id }, { $set: { launchLease: { ...lease, expiresAt: new Date(Date.now() + 30000) } } });
  const expectedHash = (await safety.pointsLaunchManifest(tenant._id, campaign._id, user)).hash;
  return { tenant, wallet, entity, shop, campaign, recipients, user, account, lease, expectedHash,
    args: { ...scope, input, confirmationId: preview.confirmationId, idempotencyKey: 'acceptance-launch' } };
}
const filter = f => ({ tenantId: f.tenant._id, campaignId: f.campaign._id });
const payloadFor = f => recipient => ({ type: 'redemption_invite', tenantId: f.tenant._id,
  email: recipient.email.trim().toLowerCase(), link: `/redeem/${recipient.redemptionToken}`,
  title: 'Approved fixture', meta: { recipientName: recipient.name } });
const commit = f => safety.commitPointsLaunch({ campaign: f.campaign, lease: f.lease, user: f.user,
  expectedHash: f.expectedHash, payloadFor: payloadFor(f), paymentMode: 'wallet' });
const dispatch = f => safety.dispatchPointsDeliveries({ ...filter(f), lease: f.lease });
async function noEffects(f) {
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
  expect((await Wallet.findOne({ tenantId: f.tenant._id, _id: f.wallet._id })).balance).toBe(2000);
  expect(await safety.PointsDelivery.countDocuments(filter(f))).toBe(0);
  expect(notify).not.toHaveBeenCalled();
}

it('rejects the original stale-owner diagnostic before debit or submission', async () => {
  const f = await fixture();
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id },
    { $set: { 'launchLease.owner': 'successor' }, $inc: { 'launchLease.fence': 1 } });
  await expect(commit(f)).rejects.toMatchObject({ code: 'LAUNCH_LEASE_LOST' });
  await noEffects(f);
});

it('rejects an expired lease even when owner and fence still match', async () => {
  const f = await fixture();
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { 'launchLease.expiresAt': new Date(0) } });
  await expect(commit(f)).rejects.toMatchObject({ code: 'LAUNCH_LEASE_LOST' });
  await noEffects(f);
});

it('rejects the original recipient-retarget diagnostic at the debit boundary and rolls back', async () => {
  const f = await fixture();
  const original = ledger.createTransaction;
  let changed = false;
  vi.spyOn(ledger, 'createTransaction').mockImplementation(async (...args) => {
    if (!changed && args[0].type === 'campaign_spend') {
      changed = true;
      await Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { email: 'replacement@example.test' } });
    }
    return original(...args);
  });
  await expect(commit(f)).rejects.toMatchObject({ code: 'LAUNCH_MANIFEST_MISMATCH' });
  await noEffects(f);
});

it.each(['recipient', 'store', 'funding', 'scope', 'schedule', 'amount'])('binds confirmation to exact %s details', async field => {
  const f = await fixture();
  if (field === 'recipient') await Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { email: 'replacement@example.test' } });
  if (field === 'store') await (await import('../src/modules/shops/shop.model.js')).Shop.updateOne({ tenantId: f.tenant._id, _id: f.shop._id }, { $set: { currencyMode: 'inr' } });
  if (field === 'funding') await (await import('../src/modules/entities/entity.model.js')).Entity.updateOne({ tenantId: f.tenant._id, _id: f.entity._id }, { $set: { walletId: (await makeFundedWallet(f.tenant, { amount: 2000 }))._id } });
  if (field === 'scope') await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { pointsScope: 'stadium' } });
  if (field === 'schedule') await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { 'schedule.mode': 'self' } });
  if (field === 'amount') await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { totalBudget: 500 } });
  await expect(executeLaunch(f.args)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  await noEffects(f);
});

it('aborted debit creates neither launch state nor dispatchable intent', async () => {
  const f = await fixture();
  vi.spyOn(ledger, 'createTransaction').mockRejectedValueOnce(new Error('Injected debit failure'));
  await expect(commit(f)).rejects.toThrow('Injected debit failure');
  expect((await Campaign.findOne({ tenantId: f.tenant._id, _id: f.campaign._id })).status).toBe('approved');
  await safety.recoverPointsDeliveries();
  await noEffects(f);
});

it('a crash between debit and campaign persistence rolls back intents and money', async () => {
  const f = await fixture();
  vi.spyOn(Campaign.prototype, 'save').mockRejectedValueOnce(new Error('Injected persistence crash'));
  await expect(commit(f)).rejects.toThrow('Injected persistence crash');
  await safety.recoverPointsDeliveries();
  await noEffects(f);
});

it('a crash after commit leaves recoverable intents without speculative financial replay', async () => {
  const f = await fixture('now', 2);
  await commit(f); // Simulate process death before the launch caller starts dispatch.
  expect(notify).not.toHaveBeenCalled();
  expect(await safety.PointsDelivery.countDocuments({ ...filter(f), state: 'ready' })).toBe(2);
  await safety.recoverPointsDeliveries();
  expect(notify).toHaveBeenCalledTimes(2);
  expect(await safety.PointsDelivery.countDocuments({ ...filter(f), state: 'accepted' })).toBe(2);
  await commit(f);
  await dispatch(f);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend', idempotencyKey: `campaign_spend:${f.campaign._id}` })).toBe(1);
});

it('a stale launch caller cannot claim new invitations after a committed handoff', async () => {
  const f = await fixture();
  await commit(f);
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { 'launchLease.owner': 'successor' }, $inc: { 'launchLease.fence': 1 } });
  await expect(dispatch(f)).rejects.toMatchObject({ code: 'LAUNCH_LEASE_LOST' });
  expect(notify).not.toHaveBeenCalled();
  await safety.recoverPointsDeliveries(); // The independently authorized delivery worker owns its claim.
  expect(notify).toHaveBeenCalledTimes(1);
});

it('locks ordinary recipient/campaign edits after commit and catches raw mutation at delivery', async () => {
  const f = await fixture();
  await commit(f);
  await expect(Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { email: 'replacement@example.test' } })).rejects.toMatchObject({ code: 'CAMPAIGN_LAUNCH_LOCKED' });
  await expect(Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { pointsScope: 'stadium' } })).rejects.toMatchObject({ code: 'CAMPAIGN_LAUNCH_LOCKED' });
  await Recipient.collection.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { email: 'replacement@example.test' } });
  await expect(dispatch(f)).rejects.toMatchObject({ code: 'LAUNCH_MANIFEST_MISMATCH' });
  expect(notify).not.toHaveBeenCalled();
});

it('concurrent delivery workers and duplicate submission calls consume only one permit', async () => {
  const f = await fixture();
  await commit(f);
  const job = await safety.PointsDelivery.findOne(filter(f));
  const claims = await Promise.all([safety.claimPointsDelivery(job), safety.claimPointsDelivery(job)]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const claimed = claims.find(Boolean);
  await Promise.all([safety.submitPointsDelivery(claimed), safety.submitPointsDelivery(claimed)]);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(vi.mocked(notify).mock.calls[0][1]).toEqual({ durableInvitation: true });
});

it('a claimed delivery is never reclaimed after a crash', async () => {
  const f = await fixture();
  await commit(f);
  await safety.claimPointsDelivery(await safety.PointsDelivery.findOne(filter(f)));
  await safety.recoverPointsDeliveries();
  await dispatch(f);
  expect(notify).not.toHaveBeenCalled();
  expect(await safety.PointsDelivery.countDocuments({ ...filter(f), state: 'submitting' })).toBe(1);
  expect((await Campaign.findOne({ tenantId: f.tenant._id, _id: f.campaign._id })).schedule.invitesUnresolved).toBe(true);
});

it('uncertain notification acknowledgement is unresolved and never automatically resent', async () => {
  const f = await fixture();
  await commit(f);
  vi.mocked(notify).mockRejectedValueOnce(new Error('Unknown SMTP outcome'));
  await dispatch(f);
  await safety.recoverPointsDeliveries();
  await dispatch(f);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(await safety.PointsDelivery.countDocuments({ ...filter(f), state: 'unresolved' })).toBe(1);
  expect((await Recipient.findOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id })).invitedAt).toBeNull();
});

it('scheduled work waits until approved time, credits once and does not refill redeemed credits', async () => {
  const f = await fixture('scheduled');
  await commit(f);
  await safety.recoverPointsDeliveries();
  expect(notify).not.toHaveBeenCalled();
  expect((await Recipient.findOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id })).creditAmount).toBe(0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(f.campaign.schedule.sendAt.getTime() + 1000));
  await deliverScheduledCampaign(filter(f));
  expect(notify).toHaveBeenCalledTimes(1);
  expect((await Recipient.findOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id })).creditAmount).toBe(250);
  await Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { creditAmount: 0 } });
  const { updateCampaign } = await import('../src/modules/campaigns/campaigns.service.js');
  await updateCampaign({ ...filter(f), user: f.user, patch: { schedule: {
    mode: 'scheduled', sendAt: f.campaign.schedule.sendAt, timezone: 'Asia/Kolkata' } } });
  await deliverScheduledCampaign(filter(f));
  expect((await Recipient.findOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id })).creditAmount).toBe(0);
});

it('self-share commits one debit without any delivery intents or notifications', async () => {
  const f = await fixture('self');
  await commit(f);
  await safety.recoverPointsDeliveries();
  expect(await safety.PointsDelivery.countDocuments(filter(f))).toBe(0);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
  expect(notify).not.toHaveBeenCalled();
});

it('historical scheduled campaigns fail closed without inventing an approval or debit', async () => {
  const f = await fixture('scheduled');
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { status: 'launched' } });
  await expect(deliverScheduledCampaign(filter(f))).rejects.toMatchObject({ code: 'LAUNCH_REVIEW_REQUIRED' });
  await noEffects(f);
});

it('normal shared launch retries preserve one debit and one submission', async () => {
  const f = await fixture();
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { 'launchLease.expiresAt': new Date(0) } });
  const args = { ...filter(f), user: f.user };
  await launchCampaign(args);
  await launchCampaign(args);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
});

it('takeover serializes behind the financial transaction and the former launcher cannot dispatch', async () => {
  const f = await fixture();
  const original = ledger.createTransaction;
  let reached, release;
  const reachedDebit = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  vi.spyOn(ledger, 'createTransaction').mockImplementation(async (...args) => {
    reached(); await gate; return original(...args);
  });
  const committing = commit(f);
  await reachedDebit;
  let tookOver = false;
  const takeover = Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id },
    { $set: { 'launchLease.owner': 'successor' }, $inc: { 'launchLease.fence': 1 } }).then(() => { tookOver = true; });
  try {
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(tookOver).toBe(false);
  } finally { release(); }
  await committing;
  await takeover;
  await expect(dispatch(f)).rejects.toMatchObject({ code: 'LAUNCH_LEASE_LOST' });
  expect(notify).not.toHaveBeenCalled();
});

it('notification submission never runs with an uncommitted Mongo transaction', async () => {
  const f = await fixture();
  const original = mongoose.startSession.bind(mongoose);
  const sessions = [];
  vi.spyOn(mongoose, 'startSession').mockImplementation(async (...args) => {
    const session = await original(...args); sessions.push(session); return session;
  });
  vi.mocked(notify).mockImplementation(async () => {
    expect(sessions.every(session => !session.inTransaction())).toBe(true);
    expect(await safety.PointsDelivery.countDocuments({ ...filter(f), state: 'unresolved' })).toBe(1);
    expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
  });
  await commit(f);
  await dispatch(f);
  expect(notify).toHaveBeenCalledTimes(1);
});

it('lost financial commit acknowledgement recovers persisted intent without another debit', async () => {
  const f = await fixture();
  const original = mongoose.startSession.bind(mongoose);
  const spy = vi.spyOn(mongoose, 'startSession').mockImplementationOnce(async (...args) => {
    const session = await original(...args);
    const transaction = session.withTransaction.bind(session);
    session.withTransaction = async callback => {
      await transaction(callback);
      throw new Error('Injected lost commit acknowledgement');
    };
    return session;
  });
  await expect(commit(f)).rejects.toThrow('Injected lost commit acknowledgement');
  spy.mockRestore();
  expect(notify).not.toHaveBeenCalled();
  await commit(f);
  await safety.recoverPointsDeliveries();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
});

it('concurrent Confirm clicks cannot duplicate debit or invitation submission', async () => {
  const f = await fixture();
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { 'launchLease.expiresAt': new Date(0) } });
  const attempts = await Promise.allSettled([executeLaunch(f.args), executeLaunch(f.args)]);
  expect(attempts.some(row => row.status === 'fulfilled')).toBe(true);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
  expect(notify).toHaveBeenCalledTimes(1);
  await executeLaunch(f.args);
  expect(notify).toHaveBeenCalledTimes(1);
});

it('recipient email normalization preserves the exact approved delivery identity', async () => {
  const f = await fixture();
  await Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { email: '  APPROVED0@EXAMPLE.TEST  ' } });
  await commit(f);
  await dispatch(f);
  expect(vi.mocked(notify).mock.calls[0][0].email).toBe('approved0@example.test');
});

it('a stale allocation cannot refill credits or change amounts on an approved launch', async () => {
  const f = await fixture();
  await commit(f);
  await Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { creditAmount: 0 } });
  const { allocateCredits } = await import('../src/modules/campaigns/campaigns.service.js');
  await expect(allocateCredits({ ...filter(f), user: f.user, creditsPerRecipient: 500 })).rejects.toMatchObject({ code: 'CAMPAIGN_LAUNCH_LOCKED' });
  expect((await Recipient.findOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id })).creditAmount).toBe(0);
});

it('lease expiry after ledger writes aborts the debit and launch intents atomically', async () => {
  const f = await fixture();
  const original = ledger.createTransaction;
  vi.spyOn(ledger, 'createTransaction').mockImplementation(async (...args) => {
    const result = await original(...args);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 60000));
    return result;
  });
  await expect(commit(f)).rejects.toMatchObject({ code: 'LAUNCH_LEASE_LOST' });
  await noEffects(f);
});

it('a modified durable payload cannot redirect delivery to another email', async () => {
  const f = await fixture();
  await commit(f);
  await safety.PointsDelivery.updateOne(filter(f), { $set: { 'payload.email': 'replacement@example.test' } });
  await expect(dispatch(f)).rejects.toMatchObject({ code: 'LAUNCH_MANIFEST_MISMATCH' });
  expect(notify).not.toHaveBeenCalled();
});

it('lost submission-permit acknowledgement cannot authorize a second attempt', async () => {
  const f = await fixture();
  await commit(f);
  const original = safety.PointsDelivery.updateOne.bind(safety.PointsDelivery);
  const spy = vi.spyOn(safety.PointsDelivery, 'updateOne').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (args[1].$set?.state === 'unresolved') throw new Error('Injected lost permit acknowledgement');
    return result;
  });
  await expect(dispatch(f)).rejects.toThrow('Injected lost permit acknowledgement');
  spy.mockRestore();
  await safety.recoverPointsDeliveries();
  expect(notify).not.toHaveBeenCalled();
  expect(await safety.PointsDelivery.countDocuments({ ...filter(f), state: 'unresolved' })).toBe(1);
});

it('the REST launch boundary requires the reviewed manifest and rejects stale recipient details', async () => {
  const f = await fixture();
  const { createApp } = await import('../src/app.js');
  const { default: request } = await import('supertest');
  const app = createApp();
  const endpoint = `/api/v1/campaigns/${f.campaign._id}/launch`;
  const missing = await request(app).post(endpoint).set('Authorization', `Bearer ${f.account.token}`).set('Idempotency-Key', 'missing-review').send({});
  expect(missing.status).toBe(409);
  await noEffects(f);
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, { $set: { 'launchLease.expiresAt': new Date(0) } });
  await Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipients[0]._id }, { $set: { email: 'replacement@example.test' } });
  const stale = await request(app).post(endpoint).set('Authorization', `Bearer ${f.account.token}`).set('Idempotency-Key', 'stale-review').send({ expectedLaunchHash: f.expectedHash });
  expect(stale.status).toBe(409);
  await noEffects(f);
});
