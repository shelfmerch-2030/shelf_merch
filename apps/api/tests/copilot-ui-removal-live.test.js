// Opt-in real-provider regression; all conversations and usage use the test database.
import { expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { connectTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';

it.skipIf(process.env.COPILOT_LIVE_SMOKE !== '1')('retains Claude streaming, history and normal chat for an old curator conversation', async () => {
  const enabled = env.EMBEDDED_COPILOT_ENABLED;
  try {
    expect(env.COPILOT_AI_PROVIDER).toBe('anthropic');
    env.EMBEDDED_COPILOT_ENABLED = 'true';
    await connectTestDb();
    const tenant = await makeTenant();
    const { user } = await makeUser(tenant, 'company_admin');
    const conversation = await createConversation({ tenantId: tenant._id, userId: user._id });
    const brief = { company: 'Toast', recipients: 10, budgetPerRecipient: 3000, currency: 'INR', source: 'external' };
    conversation.curator = { enabled: true, brief };
    await conversation.save();
    const toolCtx = buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } });
    const events = [];
    for (const content of [
      'For this conversation, our company is Toast, recipient count is 10 and the budget is INR 3000 per person. Reply with those three details in one sentence. Do not call tools or make changes.',
      'Repeat the company name, recipient count and per-person budget I just gave you in one sentence. Do not call tools or make changes.',
    ]) await streamAssistantTurn({ tenantId: tenant._id, userId: user._id, role: 'company_admin', conversationId: String(conversation._id), toolCtx, mode: 'chat', content, onEvent: event => events.push(event) });
    const saved = await CopilotConversation.findById(conversation._id);
    expect(saved.curator).toMatchObject({ enabled: false, brief });
    expect(saved.messages.filter(m => m.role === 'user')).toHaveLength(2);
    expect(saved.messages.at(-1).content).toMatch(/Toast/i);
    expect(saved.messages.at(-1).content).toMatch(/10/);
    expect(saved.messages.at(-1).content).toMatch(/3,?000/);
    expect(events.some(event => event.type === 'delta' && event.text)).toBe(true);
    expect(events.filter(event => event.type === 'done')).toHaveLength(2);
    expect(events.some(event => event.type === 'tool')).toBe(false);
    await writeFile(new URL('../../../previews/copilot/ui-removal-live-results.json', import.meta.url), JSON.stringify({ provider: 'anthropic', model: env.ANTHROPIC_MODEL, isolatedTestDatabase: true, normalChat: true, streamingDeltasReceived: true, persistedConversation: true, historyContextRetained: true, savedGiftingBriefRetained: true, turns: events.filter(event => event.type === 'done').map(event => event.usage), checkedAt: new Date().toISOString() }, null, 2));
  } finally {
    env.EMBEDDED_COPILOT_ENABLED = enabled;
    await disconnectTestDb();
  }
}, 90000);
