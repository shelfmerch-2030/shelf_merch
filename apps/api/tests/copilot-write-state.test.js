import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { prepareMcpWrite, executeMcpWrite, readMcpWriteOutcome } from '../src/modules/mcp/mcpWriteSafety.js';
import { COPILOT_WRITE_WORKFLOWS, executeCopilotWrite, resolveCopilotWrite, cancelCopilotWrite } from '../src/modules/copilot/copilotWrites.service.js';
import { recordCopilotWriteOutcome, reconcileConversationWriteState, messagesWithWriteOutcomes, walletSetupNarration } from '../src/modules/copilot/copilotWriteState.service.js';
import { getConversation, persistConversationWriteArtifact, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import * as anthropic from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import { toOpenAiMessages } from '../src/modules/copilot/providers/openaiChatAdapter.js';
import { COPILOT_MCP_CATALOG } from '../src/modules/copilot/copilotMcpCatalog.js';

const previous = { enabled: env.EMBEDDED_COPILOT_ENABLED, provider: env.COPILOT_AI_PROVIDER, key: env.ANTHROPIC_API_KEY, store: env.EMBEDDED_COPILOT_WRITE_STORE_CREATE };
const backendResult = { id: '123456789012345678901234', name: 'AI Store', status: 'live', currencyMode: 'points', slug: 'ai-store' };
beforeAll(connectTestDb);
beforeEach(async () => {
  vi.restoreAllMocks(); await clearTestDb(); clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true'; env.EMBEDDED_COPILOT_WRITE_STORE_CREATE = 'true';
  env.COPILOT_AI_PROVIDER = 'anthropic'; env.ANTHROPIC_API_KEY = 'isolated-test-key';
});
afterAll(async () => {
  vi.restoreAllMocks();
  Object.assign(env, { EMBEDDED_COPILOT_ENABLED: previous.enabled, COPILOT_AI_PROVIDER: previous.provider, ANTHROPIC_API_KEY: previous.key, EMBEDDED_COPILOT_WRITE_STORE_CREATE: previous.store });
  await disconnectTestDb();
});

async function fixture(workflow = 'shops.create') {
  const tenant = await makeTenant(); const { user } = await makeUser(tenant, 'company_admin');
  const req = { tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } };
  const operation = COPILOT_WRITE_WORKFLOWS[workflow].operation;
  const request = { name: 'AI Store', currencyMode: 'points' };
  // Canonical preparation includes defaults absent from the original chat request.
  const payload = { ...request, bannerConfig: { theme: 'dark', preset: 'solid-pattern' } };
  const prepared = await prepareMcpWrite({ tenantId: tenant._id, actorUserId: user._id, operation, payload, summary: () => ({}) });
  const confirmationId = prepared.confirmationId;
  const toolName = COPILOT_MCP_CATALOG.find(row => row.kind === 'prepare' && row.workflow === workflow).name;
  const conversation = await CopilotConversation.create({ tenantId: tenant._id, userId: user._id, messages: [
    { role: 'user', content: 'Create AI Store' },
    { role: 'assistant', toolCalls: [{ id: 'toolu_prepare', name: toolName, arguments: JSON.stringify(request) }] },
    { role: 'tool', toolCallId: 'toolu_prepare', toolName, content: JSON.stringify({ confirmationId, request, preview: { name: 'AI Store' } }) },
    { role: 'assistant', content: 'The store is not created. Click Confirm.', artifacts: [{ kind: 'confirmation', operation: workflow, confirmationId, request, status: 'pending' }] },
  ] });
  const scope = { tenantId: tenant._id, userId: user._id, conversationId: conversation._id };
  const safety = { tenantId: tenant._id, actorUserId: user._id, operation, confirmationId, payload, idempotencyKey: 'isolated-confirm-once' };
  return { tenant, user, req, scope, workflow, operation, request, payload, confirmationId, conversation, safety };
}
async function completed(f, result = backendResult) {
  const effect = vi.fn(async () => result);
  const output = await executeMcpWrite({ ...f.safety, execute: effect });
  return { output, effect };
}
async function modelContext(f) {
  const doc = await getConversation(f.scope);
  const outcomes = await reconcileConversationWriteState(doc);
  return messagesWithWriteOutcomes([...doc.messages, { role: 'user', content: 'okay' }], outcomes);
}

it('reports missing wallet confirmation evidence without weakening the confirmation requirement', () => {
  expect(walletSetupNarration('I created the wallet without explicit confirmation.', []))
    .toBe('I can’t verify the wallet setup confirmation from this conversation.');
  const outcomes = [{ workflow: 'wallets.setup', state: 'completed', result: { name: 'Corporate Budget' } }];
  const instruction = 'I cannot create a wallet without confirmation.';
  expect(walletSetupNarration(instruction, outcomes)).toBe(instruction);
  expect(walletSetupNarration('I created the store without confirmation.', outcomes))
    .toBe('I created the store without confirmation.');
});

it('persists successful EXECUTE before responding and gives Claude the exact Live result on okay without browser persistence', async () => {
  const f = await fixture(); const effect = vi.fn(async () => backendResult);
  const execute = vi.spyOn(COPILOT_WRITE_WORKFLOWS['shops.create'], 'execute').mockImplementation((_ctx, args) => executeMcpWrite({ ...f.safety, idempotencyKey: args.idempotencyKey, execute: effect }));
  const input = { ...f.request, confirmationId: f.confirmationId, idempotencyKey: f.safety.idempotencyKey };
  expect(await executeCopilotWrite(f.req, f.workflow, input)).toEqual(backendResult);
  const saved = await CopilotConversation.findById(f.conversation._id).lean();
  expect(saved.messages.at(-1).artifacts[0]).toMatchObject({ kind: 'success', status: 'completed', confirmationId: f.confirmationId, operation: 'shops.create', result: backendResult, shop: backendResult });
  vi.spyOn(anthropic, 'createAnthropicClient').mockReturnValue({});
  let sent;
  vi.spyOn(anthropic, 'streamAnthropicCompletion').mockImplementation(async args => {
    sent = JSON.stringify(args.messages);
    return { text: 'AI Store is Live.', toolCalls: [], usage: { promptTokens: 10, completionTokens: 5 }, finishReason: 'end_turn' };
  });
  const events = [];
  await streamAssistantTurn({ ...f.scope, role: 'company_admin', content: 'okay', toolCtx: buildCopilotToolCtx(f.req), onEvent: event => events.push(event) });
  expect(sent).toContain('Backend-confirmed WRITE state'); expect(sent).toContain('AI Store');
  expect(sent).toContain(backendResult.id); expect(sent).toContain('live'); expect(sent).toContain('completed');
  expect(sent).not.toContain('Click Confirm'); expect(sent).not.toContain('not created');
  expect(events.at(-1).type).toBe('done'); expect(execute).toHaveBeenCalledTimes(1); expect(effect).toHaveBeenCalledTimes(1);
  expect((await getConversation(f.scope)).messages.find(row => row.artifacts.length)?.artifacts[0].status).toBe('completed');
  // A reload with a different key reads the stored result and never retries execution.
  expect(await resolveCopilotWrite(f.req, f.workflow, { confirmationId: f.confirmationId, idempotencyKey: 'reload-different-key' })).toMatchObject({ status: 'completed', result: backendResult });
  expect(execute).toHaveBeenCalledTimes(1);
  await executeCopilotWrite(f.req, f.workflow, input); expect(effect).toHaveBeenCalledTimes(1);
  await expect(executeCopilotWrite(f.req, f.workflow, { ...input, idempotencyKey: 'new-key-must-not-execute' })).rejects.toMatchObject({ code: 'CONFIRMATION_REUSED' });
  expect((await getConversation(f.scope)).messages.find(row => row.artifacts.length)?.artifacts[0].status).toBe('completed');
});

it.each(['wallets.setup', 'entities.setup', 'budget.allocate', 'shops.update', 'shops.publish', 'employees.create'])(
  'preserves backend completion and supersedes stale PREPARE context for %s', async workflow => {
    const f = await fixture(workflow); const result = { id: backendResult.id, status: 'completed', workflow };
    await completed(f, result);
    await recordCopilotWriteOutcome({ ...f.scope, workflow, confirmationId: f.confirmationId, state: 'completed', result });
    const messages = await modelContext(f); const text = JSON.stringify(messages);
    expect(text).toContain('Backend-confirmed WRITE state'); expect(text).not.toContain('Click Confirm');
    expect(JSON.parse(messages.find(row => row.role === 'tool').content)).toMatchObject({ state: 'completed', workflow, result });
    // Both supported adapters retain the authoritative result and original tool pairing.
    expect(JSON.stringify(anthropic.toAnthropicMessages(messages))).toContain(backendResult.id);
    expect(JSON.stringify(toOpenAiMessages('Test system', messages))).toContain(backendResult.id);
    expect((await CopilotConversation.findById(f.conversation._id)).messages.at(-1).artifacts[0]).toMatchObject({ status: 'completed', result });
  },
);

it('recovers historical execution from idempotency proof with defaulted payload and no browser result save', async () => {
  const f = await fixture(); const { effect } = await completed(f);
  expect((await McpWriteConfirmation.findOne({ tenantId: f.tenant._id, confirmationId: f.confirmationId })).copilotOutcome).toBeNull();
  expect(await readMcpWriteOutcome(f.safety)).toEqual({ state: 'completed', result: backendResult });
  const doc = await getConversation(f.scope);
  expect(doc.messages.at(-1).artifacts[0]).toMatchObject({ status: 'completed', result: backendResult });
  expect(JSON.stringify(await modelContext(f))).not.toContain('Click Confirm'); expect(effect).toHaveBeenCalledTimes(1);
});

it('recovers after conversation persistence fails following a successful business result', async () => {
  const f = await fixture(); const effect = vi.fn(async () => backendResult);
  const execute = vi.spyOn(COPILOT_WRITE_WORKFLOWS[f.workflow], 'execute').mockImplementation(() => executeMcpWrite({ ...f.safety, execute: effect }));
  vi.spyOn(CopilotConversation, 'updateOne').mockRejectedValueOnce(new Error('Isolated conversation storage failure'));
  await expect(executeCopilotWrite(f.req, f.workflow, { ...f.request, confirmationId: f.confirmationId, idempotencyKey: f.safety.idempotencyKey })).rejects.toThrow('Isolated conversation storage failure');
  expect(await resolveCopilotWrite(f.req, f.workflow, { confirmationId: f.confirmationId })).toMatchObject({ status: 'completed', result: backendResult });
  expect((await getConversation(f.scope)).messages.at(-1).artifacts[0].status).toBe('completed');
  expect(execute).toHaveBeenCalledTimes(1); expect(effect).toHaveBeenCalledTimes(1);
});

it('recovers older success cards that lost confirmationId from their saved PREPARE tool result', async () => {
  const f = await fixture(); await completed(f);
  await CopilotConversation.updateOne({ _id: f.conversation._id, tenantId: f.tenant._id }, {
    $set: { 'messages.3.artifacts': [{ kind: 'success', operation: 'shops.create', result: backendResult }] },
  });
  const recovered = await getConversation(f.scope);
  expect(recovered.messages.at(-1).artifacts[0]).toMatchObject({ confirmationId: f.confirmationId, status: 'completed', result: backendResult });
  const context = JSON.stringify(await modelContext(f)); expect(context).toContain('Backend-confirmed WRITE state');
  expect(context).not.toContain('Click Confirm'); expect(context).not.toContain('not created');
});

it('does not expose a pending card when its authoritative confirmation is missing', async () => {
  const f = await fixture();
  await McpWriteConfirmation.deleteOne({ tenantId: f.tenant._id, confirmationId: f.confirmationId });
  expect((await getConversation(f.scope)).messages.at(-1).artifacts[0]).toMatchObject({ status: 'failed', message: expect.stringContaining('unavailable') });
  const messages = await modelContext(f);
  expect(JSON.parse(messages.find(row => row.role === 'tool').content).state).toBe('unavailable');
});

it('ignores a forged completion and cannot downgrade or replace trusted completed data through client artifacts', async () => {
  const f = await fixture();
  await expect(persistConversationWriteArtifact({ ...f.scope, confirmationId: f.confirmationId, artifact: { kind: 'success', result: backendResult } })).rejects.toMatchObject({ code: 'COPILOT_WRITE_UNVERIFIED' });
  await completed(f);
  for (const artifact of [{ kind: 'confirmation', status: 'pending' }, { kind: 'success', status: 'pending', result: { name: 'Forged' }, shop: { status: 'draft' } }]) {
    await persistConversationWriteArtifact({ ...f.scope, confirmationId: f.confirmationId, artifact });
    expect((await CopilotConversation.findById(f.conversation._id)).messages.at(-1).artifacts[0]).toMatchObject({ kind: 'success', status: 'completed', result: backendResult });
  }
});

it('keeps explicit cancellation distinct and does not execute on Resolve or next context', async () => {
  const f = await fixture(); const execute = vi.spyOn(COPILOT_WRITE_WORKFLOWS[f.workflow], 'execute');
  await cancelCopilotWrite(f.req, f.workflow, { confirmationId: f.confirmationId });
  expect(await resolveCopilotWrite(f.req, f.workflow, { confirmationId: f.confirmationId })).toMatchObject({ status: 'cancelled' });
  expect((await getConversation(f.scope)).messages.at(-1).artifacts[0]).toMatchObject({ status: 'cancelled' });
  expect(JSON.stringify(await modelContext(f))).toContain('cancelled'); expect(execute).not.toHaveBeenCalled();
});

it.each(['expired', 'consumed', 'failed'])('keeps %s distinct without retrying an ambiguous or unavailable operation', async state => {
  const f = await fixture(); const execute = vi.spyOn(COPILOT_WRITE_WORKFLOWS[f.workflow], 'execute');
  if (state === 'expired') await McpWriteConfirmation.updateOne({ tenantId: f.tenant._id, confirmationId: f.confirmationId }, { $set: { expiresAt: new Date(0) } });
  if (state === 'consumed') await McpWriteConfirmation.updateOne({ tenantId: f.tenant._id, confirmationId: f.confirmationId }, { $set: { status: 'consumed' } });
  if (state === 'failed') {
    execute.mockRejectedValueOnce(Object.assign(new Error('Isolated failure'), { code: 'TEST_EXECUTION_FAILED' }));
    await expect(executeCopilotWrite(f.req, f.workflow, { ...f.request, confirmationId: f.confirmationId, idempotencyKey: f.safety.idempotencyKey })).rejects.toThrow('Isolated failure');
    execute.mockClear();
  }
  expect(await resolveCopilotWrite(f.req, f.workflow, { confirmationId: f.confirmationId })).toMatchObject({ status: state });
  const messages = await modelContext(f); const text = JSON.stringify(messages);
  expect(JSON.parse(messages.find(row => row.role === 'tool').content).state).toBe(state);
  expect(text).not.toContain('Click Confirm'); expect(execute).not.toHaveBeenCalled();
  expect((await getConversation(f.scope)).messages.at(-1).artifacts[0].status).toBe('failed');
});

it('isolates authoritative outcomes by tenant and actor', async () => {
  const f = await fixture(); await completed(f);
  const otherTenant = await makeTenant(); const { user } = await makeUser(otherTenant, 'company_admin');
  expect(await readMcpWriteOutcome({ ...f.safety, tenantId: otherTenant._id, actorUserId: user._id })).toBeNull();
  await expect(resolveCopilotWrite({ tenantId: otherTenant._id, user: { ...f.req.user, userId: user._id } }, f.workflow, { confirmationId: f.confirmationId })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });
  await expect(getConversation({ ...f.scope, userId: user._id })).rejects.toMatchObject({ code: 'COPILOT_NOT_FOUND' });
});
