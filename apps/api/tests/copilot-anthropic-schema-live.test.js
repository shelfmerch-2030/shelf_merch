// Explicit opt-in: real Claude, isolated MongoDB, synthetic prompts, READ execution only.
import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectTestDb, disconnectTestDb } from './setup.js';
import { authHeader, makeTenant, makeUser } from './helpers.js';
import { WRITE_FLAG_KEYS } from '../src/modules/copilot/copilotWriteFlags.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';
import * as copilotTools from '../src/modules/copilot/copilotTools.js';

it.skipIf(process.env.COPILOT_ANTHROPIC_SCHEMA_LIVE !== '1')('streams Hello and a real read-only tool round trip with every PREPARE schema present', async () => {
  const keys = ['COPILOT_AI_PROVIDER', 'EMBEDDED_COPILOT_ENABLED', ...Object.values(WRITE_FLAG_KEYS)];
  const previous = Object.fromEntries(keys.map(key => [key, env[key]]));
  const requestIds = [], executedReads = [];
  try {
    env.COPILOT_AI_PROVIDER = 'anthropic';
    env.EMBEDDED_COPILOT_ENABLED = 'true';
    for (const key of Object.values(WRITE_FLAG_KEYS)) env[key] = 'true';
    const client = adapter.createAnthropicClient().withOptions({
      fetch: async (...args) => {
        const response = await fetch(...args);
        requestIds.push(response.headers.get('request-id'));
        return response;
      },
    });
    vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue(client);
    const run = copilotTools.runCopilotTool;
    vi.spyOn(copilotTools, 'runCopilotTool').mockImplementation(async (name, ...args) => {
      // Fail closed before any PREPARE, EXECUTE, financial, or store handler can run.
      if (name !== 'catalog_list_categories') throw new Error('Live test allows only catalog_list_categories');
      executedReads.push(name);
      return run(name, ...args);
    });
    await connectTestDb();
    const tenant = await makeTenant();
    const { token } = await makeUser(tenant, 'company_admin');
    const app = createApp();
    const turns = [];
    for (const content of ['Hello', 'List the available catalog categories. Use the category listing tool to read them. Do not make any changes.']) {
      const created = await request(app).post('/api/v1/copilot/conversations').set(authHeader(token)).send({});
      expect(created.status).toBe(201);
      const response = await request(app).post(`/api/v1/copilot/conversations/${created.body.id}/messages`).set(authHeader(token)).send({ content });
      expect(response.status).toBe(200);
      const events = response.text.split('\n').filter(line => line.startsWith('data: ') && line.slice(6).trim() !== '[DONE]').map(line => JSON.parse(line.slice(6)));
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'delta' && e.text)).toBe(true);
      expect(events.at(-1).type).toBe('done');
      turns.push({ prompt: content, httpStatus: response.status, streamingTextReceived: true, completed: true, tools: events.filter(e => e.type === 'tool').map(e => ({ name: e.name, status: e.status })) });
    }
    expect(executedReads).toContain('catalog_list_categories');
    await writeFile(new URL('../../../previews/copilot/anthropic-schema-live-results.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), provider: 'anthropic', model: env.ANTHROPIC_MODEL, isolatedTestDatabase: true, allPrepareSchemasIncluded: true, allowedExecution: ['catalog_list_categories'], executedReads, requestIds, turns }, null, 2));
  } finally {
    vi.restoreAllMocks();
    Object.assign(env, previous);
    await disconnectTestDb();
  }
}, 120000);
