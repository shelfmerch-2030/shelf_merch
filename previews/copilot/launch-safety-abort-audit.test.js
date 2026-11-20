/** Diagnostic only: passing reproduces a blocker, not launch acceptance.
 * Isolated MongoMemoryReplSet; notification submission is entirely synthetic.
 */
import mongoose from 'mongoose';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../apps/api/tests/setup.js';
import { makeTenant, makeUser, makeFundedWallet, makeEntity, makeShop } from '../../apps/api/tests/helpers.js';
import { Campaign } from '../../apps/api/src/modules/campaigns/campaign.model.js';
import { Recipient } from '../../apps/api/src/modules/campaigns/recipient.model.js';
import { WalletTransaction } from '../../apps/api/src/modules/wallets/walletTransaction.model.js';
import { prepareLaunch, executeLaunch } from '../../apps/api/src/modules/mcp/campaignsSendWrite.js';
import { notify } from '../../apps/api/src/modules/notifications/notifications.service.js';

vi.mock('../../apps/api/src/modules/notifications/notifications.service.js', async importOriginal => ({
  ...await importOriginal(), notify: vi.fn(async () => ({ queued: true })),
}));
beforeAll(connectTestDb);
afterAll(disconnectTestDb);

it('diagnostic: an aborted dispatch transaction allows submission after a successor takes ownership', async () => {
  await clearTestDb();
  const tenant = await makeTenant();
  const account = await makeUser(tenant, 'company_admin');
  const wallet = await makeFundedWallet(tenant, { amount: 2000 });
  const entity = await makeEntity(tenant, wallet, 'Abort audit');
  const shop = await makeShop(tenant);
  const campaign = await Campaign.create({ tenantId: tenant._id, entityId: entity._id, shopId: shop._id,
    name: 'Synthetic abort audit', type: 'points', status: 'approved', pointsScope: 'shop',
    recipientCount: 1, creditsPerRecipient: 250, totalBudget: 250, paymentMode: 'wallet',
    schedule: { mode: 'now' }, createdBy: account.user._id });
  const recipient = await Recipient.create({ tenantId: tenant._id, campaignId: campaign._id,
    name: 'Confirmed fixture', email: 'confirmed@example.test', creditAmount: 250,
    redemptionToken: `abort-audit-${campaign._id}` });
  const scope = { tenantId: tenant._id, actorUserId: account.user._id };
  const input = { campaignId: String(campaign._id) };
  const prepared = await prepareLaunch({ ...scope, input });
  const originalStart = mongoose.startSession.bind(mongoose);
  let dispatchSession;
  const spy = vi.spyOn(mongoose, 'startSession').mockImplementation(async (...args) => {
    const session = await originalStart(...args);
    dispatchSession = session;
    return session;
  });
  const submissions = [];
  vi.mocked(notify).mockImplementation(async payload => {
    if (payload.type !== 'redemption_invite') return;
    // Simulate transaction timeout/abort while the external submission awaits
    // Redis. Aborting releases the Mongo write lock; external I/O is not cancelled.
    expect(dispatchSession.inTransaction()).toBe(true);
    await dispatchSession.abortTransaction();
    await Campaign.updateOne({ tenantId: tenant._id, _id: campaign._id }, {
      $set: { 'launchLease.owner': 'successor-worker', 'launchLease.expiresAt': new Date(Date.now() + 60000) },
      $inc: { 'launchLease.fence': 1 },
    });
    const fresh = await Campaign.findOne({ tenantId: tenant._id, _id: campaign._id });
    submissions.push({ ownerAtSubmission: fresh.launchLease.owner, email: payload.email });
  });
  try {
    await expect(executeLaunch({ ...scope, input, confirmationId: prepared.confirmationId,
      idempotencyKey: 'abort-audit' })).rejects.toMatchObject({ code: 'LAUNCH_LEASE_LOST' });
    expect(submissions).toEqual([{ ownerAtSubmission: 'successor-worker', email: 'confirmed@example.test' }]);
    const row = await Recipient.findOne({ tenantId: tenant._id, _id: recipient._id });
    expect(row.inviteClaimedAt).toBeTruthy();
    expect(row.invitedAt).toBeNull();
    expect(await WalletTransaction.countDocuments({ tenantId: tenant._id, type: 'campaign_spend' })).toBe(1);
  } finally {
    spy.mockRestore();
    vi.mocked(notify).mockReset();
  }
});
