import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { authHeader, makeTenant, makeUser, makeFundedWallet, makeEntity } from './helpers.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { runCopilotTool } from '../src/modules/copilot/copilotTools.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { readWalletLedgerView } from '../src/services/ledger.service.js';
import * as anthropic from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { COPILOT_WRITE_WORKFLOWS } from '../src/modules/copilot/copilotWrites.service.js';

const previous = { enabled: env.EMBEDDED_COPILOT_ENABLED, budgets: env.EMBEDDED_COPILOT_WRITE_BUDGETS, provider: env.COPILOT_AI_PROVIDER, key: env.ANTHROPIC_API_KEY };
let app;
beforeAll(async () => { await connectTestDb(); app = createApp(); });
beforeEach(async () => {
  await clearTestDb(); clearTenantLimitCache();
  env.EMBEDDED_COPILOT_ENABLED = 'true'; env.EMBEDDED_COPILOT_WRITE_BUDGETS = 'true';
});
afterAll(async () => {
  Object.assign(env, { EMBEDDED_COPILOT_ENABLED: previous.enabled, EMBEDDED_COPILOT_WRITE_BUDGETS: previous.budgets, COPILOT_AI_PROVIDER: previous.provider, ANTHROPIC_API_KEY: previous.key });
  await disconnectTestDb();
});

async function fixture() {
  const tenant = await makeTenant();
  const { user, token } = await makeUser(tenant, 'company_admin');
  const wallet = await makeFundedWallet(tenant, { name: 'Company INR budget', amount: 10000 });
  const entity = await makeEntity(tenant, wallet, 'Marketing');
  const ctx = buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } });
  const input = { walletId: String(wallet._id), allocations: [{ entityId: String(entity._id), amount: 1000 }] };
  const prepared = await runCopilotTool('budget_prepare_allocation', ctx, input, 'company_admin');
  return { tenant, user, token, wallet, entity, ctx, input, prepared, artifact: prepared.artifacts[0] };
}
function post(f, workflow, action, body) {
  return request(app).post(`/api/v1/copilot/writes/${workflow}/${action}`).set(authHeader(f.token)).send(body);
}
function executeInput(f) { return { ...f.input, confirmationId: f.artifact.confirmationId, idempotencyKey: 'allocation-confirm-once' }; }
async function allocated(f) { return (await readWalletLedgerView({ tenantId: f.tenant._id, walletId: f.wallet._id })).allocatedAmount; }

it('serializes actual MCP PREPARE into the canonical workflow and trusted allocation preview', async () => {
  const f = await fixture();
  expect(f.prepared.result.workflow).toBe('budget.allocate');
  expect(f.artifact).toMatchObject({ operation: 'budget.allocate', status: 'pending', request: f.input,
    preview: { walletName: 'Company INR budget', currency: 'INR', netChange: 1000,
      before: { allocatedAmount: 0, unallocatedAmount: 10000 }, after: { allocatedAmount: 1000, unallocatedAmount: 9000 },
      departments: [{ name: 'Marketing', amount: 1000, beforeAllocated: 0, afterAllocated: 1000, beforeUnspent: 0, afterUnspent: 1000 }] } });
  expect((await McpWriteConfirmation.findOne({ tenantId: f.tenant._id, confirmationId: f.artifact.confirmationId })).operation).toBe('wallets.allocate');
  expect(await allocated(f)).toBe(0);
  const resolve = await post(f, f.artifact.operation, 'resolve', executeInput(f));
  expect(resolve.body).toMatchObject({ status: 'pending', workflow: 'budget.allocate' });
  expect(await allocated(f)).toBe(0);
});

it('cancels repeatedly using the artifact workflow and rejects subsequent confirmation', async () => {
  const f = await fixture();
  for (let i = 0; i < 2; i++) {
    const response = await post(f, f.artifact.operation, 'cancel', { confirmationId: f.artifact.confirmationId });
    expect(response.status).toBe(200); expect(response.body.workflow).toBe('budget.allocate');
  }
  expect((await post(f, f.artifact.operation, 'resolve', executeInput(f))).body.status).toBe('cancelled');
  expect((await post(f, f.artifact.operation, 'execute', executeInput(f))).status).toBeGreaterThanOrEqual(400);
  expect(await allocated(f)).toBe(0);
});

it('confirms once despite duplicate clicks and resolves the recorded result without another allocation', async () => {
  const f = await fixture();
  const responses = await Promise.all([post(f, f.artifact.operation, 'execute', executeInput(f)), post(f, f.artifact.operation, 'execute', executeInput(f))]);
  expect(responses.some(r => r.status === 200)).toBe(true);
  expect(responses.every(r => [200, 409].includes(r.status))).toBe(true);
  expect((await post(f, f.artifact.operation, 'execute', executeInput(f))).status).toBe(200);
  const resolved = await post(f, f.artifact.operation, 'resolve', { ...executeInput(f), idempotencyKey: 'a-different-reload-key' });
  expect(resolved.status).toBe(200); expect(resolved.body).toMatchObject({ status: 'completed', workflow: 'budget.allocate', result: { netChange: 1000 } });
  expect(await allocated(f)).toBe(1000);
  expect((await post(f, f.artifact.operation, 'cancel', { confirmationId: f.artifact.confirmationId })).status).toBe(403);
});

it('leaves a consumed but unproven confirmation untouched during resolve', async () => {
  const f = await fixture();
  await McpWriteConfirmation.updateOne({ tenantId: f.tenant._id, confirmationId: f.artifact.confirmationId }, { $set: { status: 'consumed' } });
  const execute = vi.spyOn(COPILOT_WRITE_WORKFLOWS['budget.allocate'], 'execute');
  try {
    const response = await post(f, f.artifact.operation, 'resolve', executeInput(f));
    expect(response.body.status).toBe('consumed'); expect(await allocated(f)).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  } finally { execute.mockRestore(); }
});

it('allows only one winner when Cancel races with Confirm', async () => {
  const f = await fixture();
  const [cancelled, executed] = await Promise.all([
    post(f, f.artifact.operation, 'cancel', { confirmationId: f.artifact.confirmationId }),
    post(f, f.artifact.operation, 'execute', executeInput(f)),
  ]);
  const confirmation = await McpWriteConfirmation.findOne({ tenantId: f.tenant._id, confirmationId: f.artifact.confirmationId });
  if (cancelled.status === 200) {
    expect(executed.status).toBeGreaterThanOrEqual(400);
    expect(confirmation.status).toBe('rejected'); expect(await allocated(f)).toBe(0);
  } else {
    expect(cancelled.status).toBe(403); expect(executed.status).toBe(200);
    expect(confirmation.status).toBe('consumed'); expect(await allocated(f)).toBe(1000);
  }
});

it.each(['expired', 'stale'])('rejects a %s confirmation without changing balances', async kind => {
  const f = await fixture();
  await McpWriteConfirmation.updateOne({ tenantId: f.tenant._id, confirmationId: f.artifact.confirmationId }, { $set: kind === 'expired' ? { expiresAt: new Date(Date.now() - 1000) } : { resourceHash: 'stale-resource' } });
  if (kind === 'expired') expect((await post(f, f.artifact.operation, 'resolve', executeInput(f))).body.status).toBe('expired');
  const response = await post(f, f.artifact.operation, 'execute', executeInput(f));
  expect(response.status).toBe(409); expect(await allocated(f)).toBe(0);
});

it('persists the canonical artifact through chat tool orchestration and conversation reload', async () => {
  const f = await fixture();
  env.COPILOT_AI_PROVIDER = 'anthropic'; env.ANTHROPIC_API_KEY = 'synthetic-test-key';
  const create = vi.spyOn(anthropic, 'createAnthropicClient').mockReturnValue({});
  const stream = vi.spyOn(anthropic, 'streamAnthropicCompletion')
    .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'allocation-tool', name: 'budget_prepare_allocation', arguments: JSON.stringify(f.input) }], usage: { promptTokens: 1, completionTokens: 1 } })
    .mockResolvedValueOnce({ text: 'Please review the allocation preview.', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } });
  try {
    const conversation = await request(app).post('/api/v1/copilot/conversations').set(authHeader(f.token)).send({});
    const sent = await request(app).post(`/api/v1/copilot/conversations/${conversation.body.id}/messages`).set(authHeader(f.token)).send({ content: 'Allocate INR 1000 to Marketing from the company budget.' });
    expect(sent.status).toBe(200); expect(sent.text).toContain('budget.allocate');
    const loaded = await request(app).get(`/api/v1/copilot/conversations/${conversation.body.id}`).set(authHeader(f.token));
    const artifact = loaded.body.messages.flatMap(m => m.artifacts).find(a => a.kind === 'confirmation');
    expect(artifact.operation).toBe('budget.allocate'); expect(artifact.preview.departments[0].name).toBe('Marketing');
    expect((await post(f, artifact.operation, 'cancel', { confirmationId: artifact.confirmationId })).status).toBe(200);
    expect(await allocated(f)).toBe(0);
  } finally { create.mockRestore(); stream.mockRestore(); }
});

it('disables legacy artifacts on reload and rejects alias routes and rerouted old confirmations', async () => {
  const f = await fixture();
  const legacy = { ...f.artifact, operation: 'wallets.allocate' };
  const conversation = await CopilotConversation.create({ tenantId: f.tenant._id, userId: f.user._id, messages: [{ role: 'assistant', artifacts: [legacy] }] });
  const response = await request(app).get(`/api/v1/copilot/conversations/${conversation._id}`).set(authHeader(f.token));
  expect(response.body.messages[0].artifacts[0]).toMatchObject({ operation: 'wallets.allocate', status: 'failed', message: expect.stringContaining('prepare') });
  for (const action of ['cancel', 'execute', 'resolve']) expect((await post(f, legacy.operation, action, executeInput(f))).status).toBe(404);
  expect((await post(f, 'budget.allocate', 'execute', executeInput(f))).status).toBe(409);
  expect(await allocated(f)).toBe(0);
});

it('preserves actor, tenant and role isolation for allocation confirmations', async () => {
  const f = await fixture();
  const other = await makeUser(f.tenant, 'company_admin');
  for (const action of ['cancel', 'resolve', 'execute']) expect((await post({ ...f, token: other.token }, 'budget.allocate', action, executeInput(f))).status).toBeGreaterThanOrEqual(400);
  const manager = await makeUser(f.tenant, 'entity_manager', 'entity', { scopeId: f.entity._id, assignedEntityIds: [f.entity._id] });
  expect((await post({ ...f, token: manager.token }, 'budget.allocate', 'prepare', f.input)).status).toBe(403);
  const foreignTenant = await makeTenant(), foreign = await makeUser(foreignTenant, 'company_admin');
  for (const action of ['cancel', 'resolve', 'execute']) expect((await post({ ...f, token: foreign.token }, 'budget.allocate', action, executeInput(f))).status).toBeGreaterThanOrEqual(400);
  expect(await allocated(f)).toBe(0);
});
