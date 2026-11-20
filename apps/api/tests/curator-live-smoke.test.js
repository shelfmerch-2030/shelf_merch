// Opt-in real Claude smoke test. Catalog, conversation and usage data stay in an isolated test database.
import { expect, it, vi } from 'vitest';
import { connectTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { logger } from '../src/config/logger.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import { writeFile } from 'node:fs/promises';

it.skipIf(process.env.CURATOR_LIVE_SMOKE !== '1')('curates actual test catalog records with the configured live Claude provider', async () => {
  const enabled = env.EMBEDDED_COPILOT_ENABLED;
  const logLevel = logger.level;
  const complete = adapter.streamAnthropicCompletion;
  const diagnostic = vi.spyOn(adapter, 'streamAnthropicCompletion').mockImplementation(async args => {
    try { return await complete(args); }
    catch (error) {
      const message = String(error.error?.error?.message || error.error?.message || error.message || '').replaceAll(env.ANTHROPIC_API_KEY || 'unused-secret', '[redacted]').slice(0, 500);
      console.error(JSON.stringify({ provider: 'anthropic', status: error.status, message }));
      throw error;
    }
  });
  try {
    expect(env.COPILOT_AI_PROVIDER).toBe('anthropic');
    expect(Boolean(env.ANTHROPIC_API_KEY)).toBe(true);
    env.EMBEDDED_COPILOT_ENABLED = 'true';
    logger.level = 'error'; // Provider errors log only class, code and HTTP status; never credentials.
    await connectTestDb();
    const tenant = await makeTenant();
    const { user } = await makeUser(tenant, 'company_admin');
    const product = await CatalogProduct.create({ sku: 'LIVE-SMOKE-LAMP', name: 'Desk Lamp', category: 'Work Essentials', basePriceInr: 1200, status: 'active', variants: [{ sku: 'LIVE-LAMP', stock: 15 }] });
    const conversation = await createConversation({ tenantId: tenant._id, userId: user._id });
    const toolCtx = buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: user._id, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] } });
    const events = [];
    await streamAssistantTurn({ tenantId: tenant._id, userId: user._id, role: 'company_admin', conversationId: String(conversation._id), toolCtx, mode: 'curator', content: 'I need unique welcome gifts for 10 Toast employees at ₹3,000 each. Avoid mugs, bottles, apparel and bags. A useful desk lamp would be great.', onEvent: e => events.push(e) });
    const saved = await CopilotConversation.findById(conversation._id);
    const curation = saved.messages.at(-1).artifacts[0].curation;
    expect(curation.brief).toMatchObject({ company: 'Toast', recipients: 10, budgetPerRecipient: 3000, source: 'shelfmerch' });
    expect(curation.brief.exclusions).toEqual(expect.arrayContaining(['mugs', 'bottles', 'apparel', 'bags']));
    expect(curation.concepts.length).toBeGreaterThan(0);
    expect(curation.concepts[0].items[0]).toMatchObject({ id: String(product._id), price: 1200 });
    expect(events.at(-1).type).toBe('done');
    const followupEvents = [];
    const turn = content => streamAssistantTurn({ tenantId: tenant._id, userId: user._id, role: 'company_admin', conversationId: String(conversation._id), toolCtx, mode: 'curator', content, onEvent: e => followupEvents.push(e) });
    await turn('Show ideas outside ShelfMerch. Keep my existing requirements.');
    await turn('Show me more unique ideas.');
    const refined = await CopilotConversation.findById(conversation._id);
    const external = refined.messages.at(-1).artifacts[0].curation;
    expect(external.brief).toMatchObject({ company: 'Toast', recipients: 10, budgetPerRecipient: 3000, source: 'external' });
    expect(external.concepts.length).toBeGreaterThan(0);
    expect(followupEvents.some(e => /catalog|kits/.test(e.name || ''))).toBe(false);
    expect(external.concepts.flatMap(c => c.items).every(i => i.source === 'inspiration' && i.price === null && !i.imageUrl)).toBe(true);
    await writeFile(new URL('../../../previews/copilot/curator-live-results.json', import.meta.url), JSON.stringify({ liveProvider: 'anthropic', model: env.ANTHROPIC_MODEL, isolatedTestCatalog: true, catalogConcepts: curation.concepts.length, externalFollowup: true, preservedToastAndConstraints: true, externalCatalogReads: 0, turns: [...events, ...followupEvents].filter(e => e.type === 'done').map(e => e.usage), checkedAt: new Date().toISOString() }, null, 2));
  } finally {
    env.EMBEDDED_COPILOT_ENABLED = enabled;
    logger.level = logLevel;
    diagnostic.mockRestore();
    await disconnectTestDb();
  }
}, 90000);
