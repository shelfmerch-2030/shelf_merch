import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, makeFundedWallet, makeEntity, makeShop } from './helpers.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import * as drafts from '../src/modules/mcp/campaignsDraftWrite.js';
import * as campaigns from '../src/modules/campaigns/campaigns.service.js';
import * as launch from '../src/modules/campaigns/pointsLaunch.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { prepareSendPoints, executeSendPoints, SendPointsOperation, readSendPointsOutcome } from '../src/modules/copilot/sendPointsWorkflow.js';
import { notify } from '../src/modules/notifications/notifications.service.js';
import { env } from '../src/config/env.js';
import { runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { executeCopilotWrite, resolveCopilotWrite } from '../src/modules/copilot/copilotWrites.service.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { getConversation } from '../src/modules/copilot/copilotChat.service.js';
import { reconcileConversationWriteState, messagesWithWriteOutcomes } from '../src/modules/copilot/copilotWriteState.service.js';

vi.mock('../src/modules/notifications/notifications.service.js', async original => ({ ...await original(), notify: vi.fn(async () => ({ success: true, provider: 'mock' })) }));
beforeAll(connectTestDb);
beforeEach(async () => { await clearTestDb(); vi.mocked(notify).mockReset().mockResolvedValue({ success: true, provider: 'mock' }); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(disconnectTestDb);
const previousFlag = env.EMBEDDED_COPILOT_WRITE_SEND_POINTS;
beforeEach(() => { env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = 'true'; });
afterEach(() => { env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = previousFlag; });

async function fixture({ count = 1, manager = false, currencyMode = 'points', scope = 'shop', mode = 'now' } = {}) {
  const tenant = await makeTenant();
  const wallet = await makeFundedWallet(tenant, { name: 'Approved wallet', amount: 10000 });
  const entity = await makeEntity(tenant, wallet, 'Approved department');
  await ledger.allocateToEntities({ tenantId: tenant._id, walletId: wallet._id, allocations: [{ entityId: entity._id, amount: 2000 }] });
  const account = await makeUser(tenant, manager ? 'entity_manager' : 'company_admin', manager ? 'entity' : 'tenant',
    manager ? { assignedEntityIds: [entity._id], scopeId: entity._id } : {});
  const shop = await makeShop(tenant, { name: 'AI Store', currencyMode, pointsConversionEnabled: scope === 'stadium' });
  const input = { ...(manager ? { entityId: String(entity._id) } : { walletId: String(wallet._id) }),
    shopId: String(shop._id), name: 'Synthetic combined send', pointsPerRecipient: 500, pointsScope: scope,
    recipients: Array.from({ length: count }, (_, i) => ({ name: `Approved ${i}`, email: `approved${i}@example.test` })),
    schedule: { mode, ...(mode === 'scheduled' ? { sendAt: new Date(Date.now() + 86400000).toISOString(), timezone: 'Asia/Kolkata' } : {}) } };
  const caller = { tenantId: tenant._id, actorUserId: account.user._id };
  return { tenant, wallet, entity, shop, account, input, caller };
}
async function prepared(f) {
  const preview = await prepareSendPoints({ ...f.caller, input: f.input });
  return { ...f.caller, input: f.input, confirmationId: preview.confirmationId, idempotencyKey: `send:${preview.confirmationId}` };
}
const debits = f => WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' });

it.each([1, 3])('shows one exact preview for %s recipients without campaign or financial writes', async count => {
  const f = await fixture({ count });
  const preview = await prepareSendPoints({ ...f.caller, input: f.input });
  expect(preview.preview).toMatchObject({ name: f.input.name, shopName: 'AI Store', recipientCount: count,
    creditsPerRecipient: 250, totalBudget: count * 250, recipientIdentities: f.input.recipients,
    walletImpact: { balanceBefore: 10000, balanceAfter: 10000 - count * 250 } });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
  expect(await SendPointsOperation.countDocuments({ tenantId: f.tenant._id })).toBe(0);
  expect(await debits(f)).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it.each([[false, 'shop'], [true, 'shop'], [false, 'stadium'], [true, 'stadium']])('one confirmation sends using authorized funding: manager=%s scope=%s', async (manager, scope) => {
  const f = await fixture({ manager, scope, count: 2 });
  const args = await prepared(f);
  const result = await executeSendPoints(args);
  expect(result).toMatchObject({ outcome: 'completed', recipientCount: 2, creditsPerRecipient: 250, pointsScope: scope,
    fundingSource: manager ? 'department_budget' : 'organization_unallocated', walletDebited: true,
    debitedAmountInr: 500, invitationsAcknowledged: 2, invitationStatus: 'acknowledged', balance: manager ? 1500 : 9500 });
  expect(await McpWriteConfirmation.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(1);
  expect(await executeSendPoints(args)).toEqual(result);
  expect(notify).toHaveBeenCalledTimes(2);
});

it('uses one Credit per INR in an INR store and enforces the existing minimum', async () => {
  const f = await fixture({ currencyMode: 'inr' });
  expect((await prepareSendPoints({ ...f.caller, input: f.input })).preview.creditsPerRecipient).toBe(500);
  await expect(prepareSendPoints({ ...f.caller, input: { ...f.input, pointsPerRecipient: 249 } })).rejects.toMatchObject({ code: 'BUDGET_TOO_LOW' });
  await expect(prepareSendPoints({ ...f.caller, input: { ...f.input, pointsPerRecipient: 501, creditsPerRecipient: 250 } })).rejects.toThrow();
});

it('rejects missing and duplicate recipient identities before creating anything', async () => {
  const f = await fixture();
  await expect(prepareSendPoints({ ...f.caller, input: { ...f.input, recipients: [] } })).rejects.toThrow();
  await expect(prepareSendPoints({ ...f.caller, input: { ...f.input, recipients: [f.input.recipients[0], f.input.recipients[0]] } })).rejects.toMatchObject({ code: 'RECIPIENT_DUPLICATE' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
});

it.each(['cancelled', 'expired'])('does not execute a %s confirmation', async kind => {
  const f = await fixture(); const args = await prepared(f);
  await McpWriteConfirmation.updateOne({ tenantId: f.tenant._id, confirmationId: args.confirmationId },
    { $set: kind === 'cancelled' ? { status: 'rejected' } : { expiresAt: new Date(0) } });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
  expect(await debits(f)).toBe(0);
});

it('concurrent Confirm calls share one operation, campaign, debit and client submission', async () => {
  const f = await fixture(); const args = await prepared(f);
  const results = await Promise.allSettled([executeSendPoints(args), executeSendPoints(args)]);
  expect(results.some(row => row.status === 'fulfilled')).toBe(true);
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(1);
  expect(notify).toHaveBeenCalledTimes(1);
});

it('recovers a proven full draft after a crash using the same campaign and original key', async () => {
  const f = await fixture(); const args = await prepared(f);
  const original = drafts.saveReservedPointsDraft;
  const spy = vi.spyOn(drafts, 'saveReservedPointsDraft').mockImplementationOnce(async (...values) => { await original(...values); throw new Error('Crash after full draft'); });
  await expect(executeSendPoints(args)).rejects.toThrow('Crash after full draft');
  spy.mockRestore();
  const before = await Campaign.findOne({ tenantId: f.tenant._id });
  const result = await executeSendPoints(args);
  expect(result.id).toBe(String(before._id));
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(1);
});

it('never treats a partially saved draft as complete or recreates it', async () => {
  const f = await fixture({ count: 2 }); const args = await prepared(f);
  const original = Recipient.findOneAndUpdate.bind(Recipient); let writes = 0;
  const spy = vi.spyOn(Recipient, 'findOneAndUpdate').mockImplementation((...values) => {
    if (values[2]?.upsert && ++writes === 2) throw new Error('Crash in recipient save');
    return original(...values);
  });
  await expect(executeSendPoints(args)).rejects.toThrow();
  spy.mockRestore();
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'IDEMPOTENCY_RECONCILIATION_REQUIRED' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await Recipient.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(0);
  expect(await readSendPointsOutcome({ ...f.caller, confirmationId: args.confirmationId })).toMatchObject({ canResume: false,
    progress: { outcome: 'recovery_required', savedRecipientCount: 1, recipientCount: 2, walletDebited: false } });
});

it('recovers committed atomic allocation without calling allocation again', async () => {
  const f = await fixture(); const args = await prepared(f);
  const original = campaigns.allocateCredits;
  const spy = vi.spyOn(campaigns, 'allocateCredits').mockImplementationOnce(async (...values) => { await original(...values); throw new Error('Crash after allocation'); });
  await expect(executeSendPoints(args)).rejects.toThrow('Crash after allocation');
  expect(await debits(f)).toBe(0);
  const result = await executeSendPoints(args);
  expect(result.outcome).toBe('completed');
  expect(spy).toHaveBeenCalledTimes(1);
});

it('recovers a financial commit as completed without another debit or invitation submission', async () => {
  const f = await fixture(); const args = await prepared(f);
  const spy = vi.spyOn(launch, 'dispatchPointsDeliveries').mockRejectedValueOnce(new Error('Crash after financial commit'));
  await expect(executeSendPoints(args)).rejects.toThrow('Crash after financial commit');
  spy.mockRestore();
  expect(await debits(f)).toBe(1);
  expect(notify).not.toHaveBeenCalled();
  const result = await executeSendPoints(args);
  expect(result).toMatchObject({ outcome: 'completed', invitationStatus: 'pending', invitationsAcknowledged: 0 });
  await launch.recoverPointsDeliveries();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(await debits(f)).toBe(1);
});

it('uncertain email acknowledgement never triggers an automatic resend', async () => {
  const f = await fixture(); const args = await prepared(f);
  vi.mocked(notify).mockRejectedValueOnce(new Error('Lost provider acknowledgement'));
  expect(await executeSendPoints(args)).toMatchObject({ outcome: 'completed', invitationStatus: 'unresolved', invitationsAcknowledged: 0 });
  await executeSendPoints(args);
  await launch.recoverPointsDeliveries();
  expect(notify).toHaveBeenCalledTimes(1);
});

it.each(['scheduled', 'self'])('preserves %s delivery with one debit and no immediate email', async mode => {
  const f = await fixture({ mode }); const args = await prepared(f);
  const result = await executeSendPoints(args);
  expect(result).toMatchObject({ outcome: 'completed', invitationStatus: mode === 'self' ? 'self_share' : 'scheduled', walletDebited: true });
  expect(notify).not.toHaveBeenCalled();
  if (mode === 'scheduled') {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(new Date(f.input.schedule.sendAt).getTime() + 1000));
    await launch.recoverPointsDeliveries();
    expect(notify).toHaveBeenCalledTimes(1);
  }
});

it('rejects a store conversion change after preview', async () => {
  const f = await fixture(); const args = await prepared(f);
  await Shop.updateOne({ tenantId: f.tenant._id, _id: f.shop._id }, { $set: { currencyMode: 'inr' } });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  expect(await debits(f)).toBe(0);
});

it('refuses an existing allocated campaign instead of recreating or launching it', async () => {
  const f = await fixture();
  await Campaign.create({ tenantId: f.tenant._id, entityId: f.entity._id, shopId: f.shop._id, name: f.input.name, type: 'points', status: 'approved' });
  await expect(prepared(f)).rejects.toMatchObject({ code: 'CAMPAIGN_ALREADY_EXISTS' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(0);
});

it('rejects combined-operation takeover inside the fenced financial boundary', async () => {
  const f = await fixture(); const args = await prepared(f); const original = campaigns.launchCampaign;
  vi.spyOn(campaigns, 'launchCampaign').mockImplementationOnce(async (...values) => {
    await SendPointsOperation.updateOne({ tenantId: f.tenant._id, confirmationId: args.confirmationId },
      { $set: { owner: 'successor' }, $inc: { fence: 1 } });
    return original(...values);
  });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'SEND_POINTS_LEASE_LOST' });
  expect(await debits(f)).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it('never redirects recipients changed after allocation', async () => {
  const f = await fixture(); const args = await prepared(f); const original = campaigns.launchCampaign;
  vi.spyOn(campaigns, 'launchCampaign').mockImplementationOnce(async (...values) => {
    await Recipient.updateOne({ tenantId: f.tenant._id, campaignId: values[0].campaignId }, { $set: { email: 'replacement@example.test' } });
    return original(...values);
  });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'SEND_POINTS_REVIEW_REQUIRED' });
  expect(await debits(f)).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it('a single Copilot card executes once and stays completed after reload, Resolve and okay', async () => {
  const f = await fixture();
  const req = { tenantId: f.tenant._id, user: { userId: f.account.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } };
  const prepared = await runCopilotTool('campaigns_prepare_send_points', buildCopilotToolCtx(req), f.input, 'company_admin');
  expect(prepared.artifacts).toHaveLength(1);
  expect(prepared.artifacts[0]).toMatchObject({ operation: 'campaigns.send_points', kind: 'confirmation' });
  await expect(runCopilotTool('campaigns_execute_send_points', buildCopilotToolCtx(req), {}, 'company_admin')).rejects.toMatchObject({ status: 403 });
  const conversation = await CopilotConversation.create({ tenantId: f.tenant._id, userId: f.account.user._id,
    messages: [{ role: 'assistant', content: 'Confirm & Send Points', artifacts: prepared.artifacts }] });
  const args = { ...f.input, confirmationId: prepared.result.confirmationId, idempotencyKey: `send:${prepared.result.confirmationId}` };
  const result = await executeCopilotWrite(req, 'campaigns.send_points', args);
  const reopened = await getConversation({ tenantId: f.tenant._id, userId: f.account.user._id, conversationId: conversation._id });
  expect(reopened.messages[0].artifacts[0]).toMatchObject({ kind: 'success', status: 'completed', result });
  const outcomes = await reconcileConversationWriteState(reopened);
  const projected = messagesWithWriteOutcomes([...reopened.messages, { role: 'user', content: 'okay' }], outcomes);
  expect(JSON.stringify(projected)).not.toContain('Confirm & Send Points');
  expect(await resolveCopilotWrite(req, 'campaigns.send_points', { confirmationId: args.confirmationId })).toMatchObject({ status: 'completed', result });
  expect(await executeCopilotWrite(req, 'campaigns.send_points', args)).toEqual(result);
  expect(await debits(f)).toBe(1);
});

it('partial conversation status is read-only and resumes only the original confirmed operation', async () => {
  const f = await fixture();
  const req = { tenantId: f.tenant._id, user: { userId: f.account.user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } };
  const args = await prepared(f);
  const original = drafts.saveReservedPointsDraft;
  const spy = vi.spyOn(drafts, 'saveReservedPointsDraft').mockImplementationOnce(async (...values) => { await original(...values); throw new Error('Synthetic stopped send'); });
  await expect(executeCopilotWrite(req, 'campaigns.send_points', { ...f.input, ...args })).rejects.toThrow('Synthetic stopped send');
  spy.mockRestore();
  const outcome = await resolveCopilotWrite(req, 'campaigns.send_points', { confirmationId: args.confirmationId });
  expect(outcome).toMatchObject({ status: 'failed', canResume: true, progress: { status: 'recipients_uploaded', walletDebited: false } });
  expect(await debits(f)).toBe(0);
  await executeCopilotWrite(req, 'campaigns.send_points', { ...f.input, ...args });
  expect(await debits(f)).toBe(1);
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
});

it('contact identity changes after preview cannot redirect invitations', async () => {
  const f = await fixture();
  const contact = await Contact.create({ tenantId: f.tenant._id, name: 'Approved contact', email: 'approved-contact@example.test' });
  f.input.recipients = [{ contactId: String(contact._id) }];
  const args = await prepared(f);
  await Contact.updateOne({ tenantId: f.tenant._id, _id: contact._id }, { $set: { email: 'replacement@example.test' } });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
  expect(await debits(f)).toBe(0);
});

it('funding changes after preview stop before campaign creation', async () => {
  const f = await fixture({ manager: true }); const args = await prepared(f);
  const replacement = await makeFundedWallet(f.tenant, { amount: 5000 });
  await Entity.updateOne({ tenantId: f.tenant._id, _id: f.entity._id }, { $set: { walletId: replacement._id } });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
});

it('schedule payload drift cannot consume a different approved delivery configuration', async () => {
  const f = await fixture(); const args = await prepared(f);
  await expect(executeSendPoints({ ...args, input: { ...f.input, schedule: { mode: 'self' } } })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });
  expect(await debits(f)).toBe(0);
});

it('organization funding creates a default spend entity only after confirmation', async () => {
  const f = await fixture();
  const wallet = await makeFundedWallet(f.tenant, { amount: 10000 });
  f.input.walletId = String(wallet._id);
  const args = await prepared(f);
  expect(await Entity.countDocuments({ tenantId: f.tenant._id, walletId: wallet._id })).toBe(0);
  const result = await executeSendPoints(args);
  expect(result).toMatchObject({ outcome: 'completed', walletDebited: true });
  expect(await Entity.countDocuments({ tenantId: f.tenant._id, walletId: wallet._id })).toBe(1);
});

it('two previews for the same logical send cannot create duplicate campaigns', async () => {
  const f = await fixture(); const first = await prepared(f); const second = await prepared(f);
  await executeSendPoints(first);
  await expect(executeSendPoints(second)).rejects.toMatchObject({ code: 'CAMPAIGN_ALREADY_EXISTS' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(1);
});

it('authorization revoked between allocation and debit is revalidated inside launch', async () => {
  const f = await fixture(); const args = await prepared(f); const original = campaigns.launchCampaign;
  vi.spyOn(campaigns, 'launchCampaign').mockImplementationOnce(async (...values) => {
    await RoleAssignment.updateOne({ tenantId: f.tenant._id, userId: f.account.user._id }, { $set: { role: 'member' } });
    return original(...values);
  });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await debits(f)).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it('funds changed during orchestration require review before the campaign debit', async () => {
  const f = await fixture(); const args = await prepared(f); const original = campaigns.launchCampaign;
  vi.spyOn(campaigns, 'launchCampaign').mockImplementationOnce(async (...values) => {
    await ledger.createTransaction({ tenantId: f.tenant._id, walletId: f.wallet._id, type: 'adjustment', amount: -100, idempotencyKey: 'isolated-other-operation' });
    return original(...values);
  });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'SEND_POINTS_REVIEW_REQUIRED' });
  expect(await debits(f)).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it('changed allocation stamps cannot be promoted to a funded launch', async () => {
  const f = await fixture(); const args = await prepared(f); const original = campaigns.launchCampaign;
  vi.spyOn(campaigns, 'launchCampaign').mockImplementationOnce(async (...values) => {
    await Recipient.updateOne({ tenantId: f.tenant._id, campaignId: values[0].campaignId }, { $set: { creditAmount: 999 } });
    return original(...values);
  });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'SEND_POINTS_REVIEW_REQUIRED' });
  expect(await debits(f)).toBe(0);
});

it('status reads observe an active operation without resuming or charging it', async () => {
  const f = await fixture(); const args = await prepared(f); const original = drafts.saveReservedPointsDraft;
  let reached, release;
  const saved = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  vi.spyOn(drafts, 'saveReservedPointsDraft').mockImplementationOnce(async (...values) => {
    const result = await original(...values); reached(); await gate; return result;
  });
  const execution = executeSendPoints(args);
  await saved;
  try {
    expect(await readSendPointsOutcome({ ...f.caller, confirmationId: args.confirmationId })).toMatchObject({ state: 'consumed', canResume: false,
      progress: { outcome: 'in_progress', walletDebited: false } });
    expect(await debits(f)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  } finally { release(); }
  await execution;
  expect(await debits(f)).toBe(1);
});

it('an expired partial approval cannot be resumed with its original key', async () => {
  const f = await fixture(); const args = await prepared(f); const original = drafts.saveReservedPointsDraft;
  const spy = vi.spyOn(drafts, 'saveReservedPointsDraft').mockImplementationOnce(async (...values) => { await original(...values); throw new Error('Stopped before allocation'); });
  await expect(executeSendPoints(args)).rejects.toThrow('Stopped before allocation');
  spy.mockRestore();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.now() + 11 * 60000));
  expect(await readSendPointsOutcome({ ...f.caller, confirmationId: args.confirmationId })).toMatchObject({ canResume: false });
  await expect(executeSendPoints(args)).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(0);
});

it('an existing named campaign in another store is resolved instead of recreated', async () => {
  const f = await fixture();
  await Campaign.create({ tenantId: f.tenant._id, entityId: f.entity._id, shopId: f.shop._id,
    name: f.input.name, type: 'points', status: 'approved' });
  const otherStore = await makeShop(f.tenant);
  await expect(prepareSendPoints({ ...f.caller, input: { ...f.input, shopId: String(otherStore._id) } })).rejects.toMatchObject({ code: 'CAMPAIGN_ALREADY_EXISTS' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(0);
});

it.each(['actor', 'tenant'])('a confirmation cannot be used by another %s', async kind => {
  const f = await fixture(); const args = await prepared(f);
  const tenant = kind === 'tenant' ? await makeTenant() : f.tenant;
  const other = await makeUser(tenant, 'company_admin');
  await expect(executeSendPoints({ ...args, tenantId: tenant._id, actorUserId: other.user._id })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
  expect(await debits(f)).toBe(0);
});

it('binds implicit existing Contact linkage before confirmation without creating contacts', async () => {
  const f = await fixture();
  const contact = await Contact.create({ tenantId: f.tenant._id, name: 'Employee record', email: f.input.recipients[0].email });
  const result = await executeSendPoints(await prepared(f));
  expect(result.outcome).toBe('completed');
  expect(String((await Recipient.findOne({ tenantId: f.tenant._id })).contactId)).toBe(String(contact._id));
  expect(await Contact.countDocuments({ tenantId: f.tenant._id })).toBe(1);
  expect(await debits(f)).toBe(1);
});
