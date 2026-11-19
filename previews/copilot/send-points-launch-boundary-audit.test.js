/** Capability diagnostics: assertions characterize unsafe current behavior.
 * These are not acceptance tests endorsing that behavior. All data is synthetic
 * in MongoMemoryReplSet, and notifications are mocked before importing services.
 */
import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../apps/api/tests/setup.js';
import { makeTenant, makeUser, makeFundedWallet, makeEntity, makeShop } from '../../apps/api/tests/helpers.js';
import { Campaign } from '../../apps/api/src/modules/campaigns/campaign.model.js';
import { Recipient } from '../../apps/api/src/modules/campaigns/recipient.model.js';
import { WalletTransaction } from '../../apps/api/src/modules/wallets/walletTransaction.model.js';
import { prepareLaunch, executeLaunch } from '../../apps/api/src/modules/mcp/campaignsSendWrite.js';
import * as ledger from '../../apps/api/src/services/ledger.service.js';
import { notify } from '../../apps/api/src/modules/notifications/notifications.service.js';

vi.mock('../../apps/api/src/modules/notifications/notifications.service.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, notify: vi.fn(async () => ({ queued: true })) };
});
beforeAll(connectTestDb);
beforeEach(async () => { await clearTestDb(); vi.mocked(notify).mockClear(); });
afterEach(() => vi.restoreAllMocks());
afterAll(disconnectTestDb);

async function fixture() {
  const tenant = await makeTenant();
  const account = await makeUser(tenant, 'company_admin');
  const wallet = await makeFundedWallet(tenant, { amount: 2000 });
  const entity = await makeEntity(tenant, wallet, 'Launch boundary fixture');
  const shop = await makeShop(tenant);
  const campaign = await Campaign.create({ tenantId: tenant._id, entityId: entity._id, shopId: shop._id,
    name: 'Synthetic launch boundary audit', type: 'points', status: 'approved', pointsScope: 'shop',
    recipientCount: 1, creditsPerRecipient: 250, totalBudget: 250, paymentMode: 'wallet',
    schedule: { mode: 'now' }, createdBy: account.user._id });
  const recipient = await Recipient.create({ tenantId: tenant._id, campaignId: campaign._id, name: 'Confirmed fixture',
    email: 'confirmed@example.test', creditAmount: 250, redemptionToken: `isolated-${campaign._id}` });
  const scope = { tenantId: tenant._id, actorUserId: account.user._id };
  const input = { campaignId: String(campaign._id) };
  const prepared = await prepareLaunch({ ...scope, input });
  return { tenant, campaign, recipient, args: { ...scope, input, confirmationId: prepared.confirmationId, idempotencyKey: 'launch-boundary-audit' } };
}

it('diagnostic: launch proceeds with debit and invitations after losing its lease fence', async () => {
  const f = await fixture();
  const original = ledger.createTransaction;
  let injected = false;
  vi.spyOn(ledger, 'createTransaction').mockImplementation(async (...args) => {
    if (!injected && args[0].type === 'campaign_spend') {
      injected = true;
      // Simulate a successor taking the expired lease after this worker passed
      // validation, but before it performs the irreversible financial stage.
      await Campaign.updateOne({ tenantId: f.tenant._id, _id: f.campaign._id }, {
        $set: { 'launchLease.owner': 'successor-worker', 'launchLease.expiresAt': new Date(Date.now() + 60000) },
        $inc: { 'launchLease.fence': 1 },
      });
    }
    return original(...args);
  });
  const result = await executeLaunch(f.args);
  expect(injected).toBe(true);
  expect(result).toMatchObject({ walletDebited: true, invitationsSent: 1 });
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
  expect(vi.mocked(notify).mock.calls.some(([call]) => call.type === 'redemption_invite')).toBe(true);
});

it('diagnostic: recipient retargeting after validation is used by launch invitation delivery', async () => {
  const f = await fixture();
  const original = ledger.createTransaction;
  let injected = false;
  vi.spyOn(ledger, 'createTransaction').mockImplementation(async (...args) => {
    if (!injected && args[0].type === 'campaign_spend') {
      injected = true;
      await Recipient.updateOne({ tenantId: f.tenant._id, _id: f.recipient._id }, {
        $set: { name: 'Unconfirmed replacement', email: 'replacement@example.test' },
      });
    }
    return original(...args);
  });
  const result = await executeLaunch(f.args);
  expect(result).toMatchObject({ walletDebited: true, invitationsSent: 1 });
  const invitations = vi.mocked(notify).mock.calls.map(([call]) => call).filter(call => call.type === 'redemption_invite');
  expect(invitations).toHaveLength(1);
  expect(invitations[0].email).toBe('replacement@example.test');
  expect(invitations.some(call => call.email === 'confirmed@example.test')).toBe(false);
});
