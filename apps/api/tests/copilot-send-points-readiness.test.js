import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, makeFundedWallet, makeEntity, makeShop } from './helpers.js';
import { env } from '../src/config/env.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import * as ledger from '../src/services/ledger.service.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { preparePointsDraft, executePointsDraft } from '../src/modules/mcp/campaignsDraftWrite.js';
import { getShop } from '../src/modules/mcp/shopsRead.js';
import { prepareCreditAllocation, executeCreditAllocation, prepareLaunch, executeLaunch } from '../src/modules/mcp/campaignsSendWrite.js';
import { listOpenAiToolsForRole, runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { executeCopilotWrite, resolveCopilotWrite, cancelCopilotWrite } from '../src/modules/copilot/copilotWrites.service.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { getConversation } from '../src/modules/copilot/copilotChat.service.js';
import { reconcileConversationWriteState, messagesWithWriteOutcomes } from '../src/modules/copilot/copilotWriteState.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { toAnthropicTools } from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import { notify } from '../src/modules/notifications/notifications.service.js';
import { defaultPointsScope } from '../src/modules/campaigns/pointsScope.js';

vi.mock('../src/modules/notifications/notifications.service.js', async importOriginal => ({ ...await importOriginal(), notify: vi.fn(async () => ({ queued: true })) }));
const previousFlag = env.EMBEDDED_COPILOT_WRITE_SEND_POINTS;
beforeAll(connectTestDb);
beforeEach(async () => { await clearTestDb(); clearTenantLimitCache(); env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = 'false'; vi.mocked(notify).mockClear(); });
afterEach(() => { env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = 'false'; });
afterAll(async () => { env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = previousFlag; await disconnectTestDb(); });

async function fixture({ manager = false, conversion = false, currencyMode = 'points', count = 2, delivery = 'self' } = {}) {
  const tenant = await makeTenant(); const admin = await makeUser(tenant, 'company_admin');
  const wallet = await makeFundedWallet(tenant, { name: 'Operating wallet', amount: 10000 });
  const entity = await makeEntity(tenant, wallet, 'Marketing');
  await ledger.allocateToEntities({ tenantId: tenant._id, walletId: wallet._id, allocations: [{ entityId: entity._id, amount: 2000 }], performedBy: admin.user._id });
  const account = manager ? await makeUser(tenant, 'entity_manager', 'entity', { assignedEntityIds: [entity._id] }) : admin;
  const shop = await makeShop(tenant, { name: 'Team store', currencyMode, pointsConversionEnabled: conversion });
  const req = { tenantId: tenant._id, user: { userId: account.user._id, role: account.assignment.role, scopeType: account.assignment.scopeType, assignedEntityIds: account.assignment.assignedEntityIds } };
  const input = { ...(manager ? { entityId: String(entity._id) } : { walletId: String(wallet._id) }), shopId: String(shop._id), name: 'Readiness campaign', creditsPerRecipient: 250,
    schedule: { mode: delivery, ...(delivery === 'scheduled' ? { sendAt: new Date(Date.now() + 3600000).toISOString(), timezone: 'Asia/Kolkata' } : {}) },
    recipients: Array.from({ length: count }, (_, index) => ({ name: `Recipient ${index + 1}`, email: `person${index}@fixture.test` })) };
  const scope = { tenantId: tenant._id, actorUserId: account.user._id };
  return { tenant, wallet, entity, shop, account, req, scope, input };
}
async function saveDraft(f, input = f.input, key = 'readiness-draft-once') {
  const p = await preparePointsDraft({ ...f.scope, input });
  const result = await executePointsDraft({ ...f.scope, input, confirmationId: p.confirmationId, idempotencyKey: key });
  return { p, result };
}

it.each([[false, 'points'], [true, 'points'], [false, 'inr'], [true, 'inr']])('uses the same store default and exposes verified metadata: conversion=%s currency=%s', async (conversion, currencyMode) => {
  const f = await fixture({ conversion, currencyMode });
  const read = await getShop({ tenantId: f.tenant._id, actorUserId: f.account.user._id, input: { shopId: String(f.shop._id) } });
  expect(read).toMatchObject({ currencyMode, pointsConversionEnabled: conversion });
  const { p, result } = await saveDraft(f);
  expect(p.preview).toMatchObject({ currency: 'INR', currencyMode, pointsScope: defaultPointsScope(read), recipientCount: 2, creditsPerRecipient: 250, totalBudget: 500, fundingSource: 'organization_unallocated', fundingName: 'Operating wallet', walletImpact: { debitedNow: 0, requiredAtLaunch: 500, balance: 10000, unallocatedAmount: 8000 } });
  expect((await Campaign.findOne({ _id: result.id, tenantId: f.tenant._id })).pointsScope).toBe(defaultPointsScope(read));
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
});

it('preserves explicit scope and a saved draft scope, including replay after store defaults change', async () => {
  const f = await fixture({ conversion: true });
  const input = { ...f.input, pointsScope: 'shop' };
  const { p, result } = await saveDraft(f, input);
  const update = { ...f.input, campaignId: result.id };
  expect((await preparePointsDraft({ ...f.scope, input: update })).preview.pointsScope).toBe('shop');
  await Shop.updateOne({ _id: f.shop._id, tenantId: f.tenant._id }, { $set: { pointsConversionEnabled: false } });
  expect(await executePointsDraft({ ...f.scope, input, confirmationId: p.confirmationId, idempotencyKey: 'readiness-draft-once' })).toEqual(result);
  expect((await preparePointsDraft({ ...f.scope, input: { ...update, pointsScope: 'stadium' } })).preview.pointsScope).toBe('stadium');
});

it('rejects a stale implicit scope when the store default changes before a new draft is confirmed', async () => {
  const f = await fixture();
  const p = await preparePointsDraft({ ...f.scope, input: f.input });
  await Shop.updateOne({ _id: f.shop._id, tenantId: f.tenant._id }, { $set: { pointsConversionEnabled: true } });
  await expect(executePointsDraft({ ...f.scope, input: f.input, confirmationId: p.confirmationId, idempotencyKey: 'stale-default-once' })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
});

it.each([[false, 1], [false, 3], [true, 1], [true, 3]])('shows role-scoped funds and exact debit through existing services: manager=%s count=%s', async (manager, count) => {
  const f = await fixture({ manager, count }); const { result } = await saveDraft(f);
  const total = count * 250; const available = manager ? 2000 : 8000;
  const creditInput = { campaignId: result.id, creditsPerRecipient: 250 };
  const credit = await prepareCreditAllocation({ ...f.scope, input: creditInput });
  expect(credit.preview).toMatchObject({ currency: 'INR', currencyMode: 'points', pointsScope: 'shop', totalBudget: total, recipientCount: count, fundingSource: manager ? 'department_budget' : 'organization_unallocated', fundingName: manager ? 'Marketing' : 'Operating wallet', departmentBudgetCharged: manager, walletImpact: { debitedNow: 0, requiredAtLaunch: total, unallocatedAmount: available } });
  if (manager) expect(credit.preview.walletImpact.balance).toBe(2000);
  await executeCreditAllocation({ ...f.scope, input: creditInput, confirmationId: credit.confirmationId, idempotencyKey: 'readiness-credit-once' });
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
  const launchInput = { campaignId: result.id }; const launch = await prepareLaunch({ ...f.scope, input: launchInput });
  expect(launch.preview).toMatchObject({ fundingName: manager ? 'Marketing' : 'Operating wallet', deliveryMode: 'self', invitations: 0, walletImpact: { debitedNow: total, balanceBefore: manager ? 2000 : 10000, balanceAfter: (manager ? 2000 : 10000) - total, unallocatedBefore: available, unallocatedAfter: available - total } });
  const body = { ...f.scope, input: launchInput, confirmationId: launch.confirmationId, idempotencyKey: 'readiness-launch-once' };
  const sent = await executeLaunch(body);
  expect(sent).toMatchObject({ currency: 'INR', currencyMode: 'points', walletDebited: true, debitedAmountInr: total, recipientCount: count, invitationsSent: 0, deliveryMode: 'self', balance: (manager ? 2000 : 10000) - total });
  expect(await executeLaunch(body)).toEqual(sent);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
  const walletView = await ledger.readWalletLedgerView({ tenantId: f.tenant._id, walletId: f.wallet._id });
  expect(walletView.balance).toBe(10000 - total);
  expect(walletView.allocatedAmount).toBe(manager ? 2000 - total : 2000);
  expect(notify).not.toHaveBeenCalled();
});

it.each(['now', 'scheduled'])('reports %s launch and invitation outcomes without a second debit', async delivery => {
  const f = await fixture({ delivery }); const { result } = await saveDraft(f);
  const creditInput = { campaignId: result.id, creditsPerRecipient: 250 };
  const credit = await prepareCreditAllocation({ ...f.scope, input: creditInput });
  await executeCreditAllocation({ ...f.scope, input: creditInput, confirmationId: credit.confirmationId, idempotencyKey: 'delivery-credit' });
  const input = { campaignId: result.id }; const p = await prepareLaunch({ ...f.scope, input });
  expect(p.preview.invitations).toBe(delivery === 'now' ? 2 : 0);
  const resultLaunch = await executeLaunch({ ...f.scope, input, confirmationId: p.confirmationId, idempotencyKey: 'delivery-launch' });
  expect(resultLaunch).toMatchObject({ deliveryMode: delivery, status: delivery === 'now' ? 'redemption_open' : 'launched', invitationsSent: delivery === 'now' ? 2 : 0, walletDebited: true, debitedAmountInr: 500 });
  if (delivery === 'scheduled') { expect(resultLaunch.sendAt).toBe(f.input.schedule.sendAt); expect(resultLaunch.timezone).toBe('Asia/Kolkata'); expect(notify).not.toHaveBeenCalled(); expect((await Recipient.find({ tenantId: f.tenant._id })).every(row => row.creditAmount === 0)).toBe(true); }
});

it.each(['schedule', 'pointsScope'])('rejects changed %s after a launch preview without debit or invitations', async field => {
  const f = await fixture(); const { result } = await saveDraft(f);
  const creditInput = { campaignId: result.id, creditsPerRecipient: 250 };
  const credit = await prepareCreditAllocation({ ...f.scope, input: creditInput });
  await executeCreditAllocation({ ...f.scope, input: creditInput, confirmationId: credit.confirmationId, idempotencyKey: 'stale-context-credit' });
  const input = { campaignId: result.id }; const p = await prepareLaunch({ ...f.scope, input });
  await Campaign.updateOne({ tenantId: f.tenant._id, _id: result.id }, { $set: field === 'schedule' ? { 'schedule.mode': 'now' } : { pointsScope: 'stadium' } });
  await expect(executeLaunch({ ...f.scope, input, confirmationId: p.confirmationId, idempotencyKey: 'stale-context-launch' })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it('keeps the live gate off, and never exposes EXECUTE to Claude even in an enabled isolated worker', async () => {
  expect(listOpenAiToolsForRole('company_admin').some(row => row.function.name === 'campaigns_prepare_points_draft')).toBe(false);
  env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = 'true'; // Isolated worker only; no configuration file change.
  const tools = toAnthropicTools(listOpenAiToolsForRole('company_admin'));
  expect(tools.map(row => row.name)).toEqual(expect.arrayContaining(['campaigns_prepare_points_draft', 'campaigns_prepare_credit_allocation', 'campaigns_prepare_launch']));
  expect(tools.some(row => row.name.includes('_execute_'))).toBe(false);
  await expect(runCopilotTool('campaigns_execute_launch', {}, {}, 'company_admin')).rejects.toThrow('confirmation-UI only');
});

it('retains server-authoritative conversation outcomes across all three confirmations, reload and Resolve', async () => {
  env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = 'true';
  const f = await fixture(); const ctx = buildCopilotToolCtx(f.req);
  const conversation = await CopilotConversation.create({ tenantId: f.tenant._id, userId: f.account.user._id, messages: [] });
  const stages = [['campaigns_prepare_points_draft', 'campaigns.points_draft'], ['campaigns_prepare_credit_allocation', 'campaigns.allocate_credits'], ['campaigns_prepare_launch', 'campaigns.launch']];
  let campaignId, draftArgs, draftResult;
  for (const [index, [tool, workflow]] of stages.entries()) {
    const input = index === 0 ? f.input : index === 1 ? { campaignId, creditsPerRecipient: 250 } : { campaignId };
    const p = await runCopilotTool(tool, ctx, input, 'company_admin');
    const saved = await CopilotConversation.findById(conversation._id);
    saved.messages.push({ role: 'assistant', content: 'Click Confirm.', artifacts: p.artifacts }); await saved.save();
    const args = { ...p.result.request, confirmationId: p.result.confirmationId, idempotencyKey: `conversation-stage-${index}` };
    const result = await executeCopilotWrite(f.req, workflow, args); if (index === 0) campaignId = result.id;
    if (index === 0) { draftArgs = args; draftResult = result; }
    const reopened = await getConversation({ tenantId: f.tenant._id, userId: f.account.user._id, conversationId: conversation._id });
    expect(reopened.messages.at(-1).artifacts[0]).toMatchObject({ kind: 'success', status: 'completed', result });
    const outcomes = await reconcileConversationWriteState(reopened);
    expect(JSON.stringify(messagesWithWriteOutcomes([...reopened.messages, { role: 'user', content: 'okay' }], outcomes))).not.toContain('Click Confirm');
    expect(await resolveCopilotWrite(f.req, workflow, { confirmationId: args.confirmationId })).toMatchObject({ status: 'completed', result });
  }
  // A saved/now-launched campaign still replays the original draft key exactly.
  await Shop.updateOne({ tenantId: f.tenant._id, _id: f.shop._id }, { $set: { pointsConversionEnabled: true } });
  expect(await executeCopilotWrite(f.req, 'campaigns.points_draft', draftArgs)).toEqual(draftResult);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(1);
});

it('still requires a fresh confirmation for every stage and honors Cancel without financial effects', async () => {
  env.EMBEDDED_COPILOT_WRITE_SEND_POINTS = 'true'; const f = await fixture(); const ctx = buildCopilotToolCtx(f.req);
  const p = await runCopilotTool('campaigns_prepare_points_draft', ctx, f.input, 'company_admin');
  await cancelCopilotWrite(f.req, 'campaigns.points_draft', { confirmationId: p.result.confirmationId });
  await expect(executeCopilotWrite(f.req, 'campaigns.points_draft', { ...f.input, confirmationId: p.result.confirmationId, idempotencyKey: 'cancelled-draft' })).rejects.toBeDefined();
  expect(await Campaign.countDocuments({ tenantId: f.tenant._id })).toBe(0);
  expect(await WalletTransaction.countDocuments({ tenantId: f.tenant._id, type: 'campaign_spend' })).toBe(0);
});
