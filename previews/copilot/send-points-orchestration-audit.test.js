/** Capability diagnostics, not acceptance tests endorsing the observed behavior.
 * Uses only MongoMemoryReplSet through the API's existing test configuration.
 * All business-service calls use synthetic in-memory records; no live API or delivery.
 */
import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../apps/api/tests/setup.js';
import { makeTenant, makeUser, makeFundedWallet, makeEntity, makeShop } from '../../apps/api/tests/helpers.js';
import { Campaign } from '../../apps/api/src/modules/campaigns/campaign.model.js';
import { Recipient } from '../../apps/api/src/modules/campaigns/recipient.model.js';
import { WalletTransaction } from '../../apps/api/src/modules/wallets/walletTransaction.model.js';
import { McpWriteIdempotency } from '../../apps/api/src/modules/mcp/mcpWriteIdempotency.model.js';
import { CampaignOperation } from '../../apps/api/src/modules/campaigns/campaignOperation.js';
import { preparePointsDraft, executePointsDraft } from '../../apps/api/src/modules/mcp/campaignsDraftWrite.js';
import { prepareCreditAllocation, executeCreditAllocation } from '../../apps/api/src/modules/mcp/campaignsSendWrite.js';
import { ApiError } from '../../apps/api/src/utils/errors.js';

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterEach(() => vi.restoreAllMocks());
afterAll(disconnectTestDb);

async function fixture() {
  const tenant = await makeTenant();
  const { user } = await makeUser(tenant, 'company_admin');
  const wallet = await makeFundedWallet(tenant, { name: 'Isolated audit wallet', amount: 2000 });
  const entity = await makeEntity(tenant, wallet, 'Isolated audit department');
  const shop = await makeShop(tenant, { name: 'Isolated audit store', pointsConversionEnabled: false });
  const scope = { tenantId: tenant._id, actorUserId: user._id };
  const input = { entityId: String(entity._id), shopId: String(shop._id), name: 'Isolated recovery diagnostic', creditsPerRecipient: 0, schedule: { mode: 'self' }, recipients: [
    { name: 'Fixture A', email: 'fixture-a@example.test' },
    { name: 'Fixture B', email: 'fixture-b@example.test' },
  ] };
  return { tenant, scope, input };
}

it('diagnostic: failed draft recovery can report completed with only one of two confirmed recipients saved', async () => {
  const f = await fixture();
  const prepared = await preparePointsDraft({ ...f.scope, input: f.input });
  const original = Recipient.findOneAndUpdate.bind(Recipient);
  let attempts = 0;
  const injected = vi.spyOn(Recipient, 'findOneAndUpdate').mockImplementation((...args) => {
    attempts += 1;
    if (attempts === 2) throw new ApiError(503, 'Synthetic recipient-write failure', 'AUDIT_TRANSIENT_FAILURE');
    return original(...args);
  });
  const execute = { ...f.scope, input: f.input, confirmationId: prepared.confirmationId, idempotencyKey: 'audit-partial-draft' };
  await expect(executePointsDraft(execute)).rejects.toMatchObject({ code: 'AUDIT_TRANSIENT_FAILURE' });
  injected.mockRestore();
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect((await McpWriteIdempotency.findOne({ tenantId: f.tenant._id, key: execute.idempotencyKey })).status).toBe('failed');

  const recovered = await executePointsDraft(execute);
  // This is the capability gap: completion proof does not establish the full manifest.
  expect(recovered.id).toBeTruthy();
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id, campaignId: recovered.id })).toBe(1);
  expect((await McpWriteIdempotency.findOne({ tenantId: f.tenant._id, key: execute.idempotencyKey })).status).toBe('completed');
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
});

it('diagnostic: a safely absent failed allocation cannot resume under its existing stage key', async () => {
  const f = await fixture();
  const draft = await preparePointsDraft({ ...f.scope, input: f.input });
  const saved = await executePointsDraft({ ...f.scope, input: f.input, confirmationId: draft.confirmationId, idempotencyKey: 'audit-complete-draft' });
  const input = { campaignId: saved.id, creditsPerRecipient: 250 };
  const prepared = await prepareCreditAllocation({ ...f.scope, input });
  const injected = vi.spyOn(Recipient, 'updateMany').mockRejectedValueOnce(new ApiError(503, 'Synthetic allocation failure', 'AUDIT_TRANSIENT_FAILURE'));
  const execute = { ...f.scope, input, confirmationId: prepared.confirmationId, idempotencyKey: 'audit-failed-allocation' };
  await expect(executeCreditAllocation(execute)).rejects.toMatchObject({ code: 'AUDIT_TRANSIENT_FAILURE' });
  injected.mockRestore();
  expect((await Campaign.findOne({ tenantId: f.tenant._id, _id: saved.id })).status).toBe('recipients_uploaded');
  expect((await CampaignOperation.findOne({ tenantId: f.tenant._id, key: `credits:${prepared.confirmationId}` })).status).toBe('failed');
  const noRepeat = vi.spyOn(Recipient, 'updateMany');
  await expect(executeCreditAllocation(execute)).rejects.toMatchObject({ code: 'AUDIT_TRANSIENT_FAILURE' });
  expect(noRepeat).not.toHaveBeenCalled();
  expect((await McpWriteIdempotency.findOne({ tenantId: f.tenant._id, key: execute.idempotencyKey })).status).toBe('failed');
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
});
