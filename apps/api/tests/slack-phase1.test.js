import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as envModule from '../src/config/env.js';
import { encryptToken, decryptToken } from '../src/utils/tokenEncryption.js';
import { SlackConnection } from '../src/modules/integrations/slack/slackConnection.model.js';
import {
  storeOAuthState,
  generateOAuthState,
  clearMemoryOAuthStates,
  consumeOAuthState,
} from '../src/modules/integrations/slack/slackOAuthState.service.js';
import {
  SLACK_CONVERSATIONS_LIST_URL,
  SLACK_CONVERSATIONS_INFO_URL,
  SLACK_CHAT_POST_MESSAGE_URL,
  SLACK_AUTH_REVOKE_URL,
} from '../src/modules/integrations/slack/slack.constants.js';

let app;
let tenant;
let otherTenant;
let admin;
let adminToken;
let managerToken;
let otherAdminToken;
let fetchMock;

async function makeUser(role, scopeType, forTenant = tenant) {
  const user = await User.create({
    tenantId: forTenant._id,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: forTenant._id,
    userId: user._id,
    role,
    scopeType,
  });
  return { user, token: signAccessToken(user, assignment) };
}

function mockJson(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'slackConfigured').mockReturnValue(true);
  envModule.env.SLACK_CLIENT_ID = 'slack-client-id';
  envModule.env.SLACK_CLIENT_SECRET = 'slack-client-secret';
  envModule.env.SLACK_REDIRECT_URI = 'http://localhost:8080/api/integrations/slack/callback';
  envModule.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  envModule.env.APP_URL = 'http://localhost:8080';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearMemoryOAuthStates();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix-slack' });
  otherTenant = await Tenant.create({ name: 'OtherCo', slug: 'other-slack' });
  ({ user: admin, token: adminToken } = await makeUser('company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser('entity_manager', 'entity'));
  ({ token: otherAdminToken } = await makeUser('company_admin', 'tenant', otherTenant));
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('GET /api/integrations/slack/connect', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/integrations/slack/connect');
    expect(res.status).toBe(401);
  });

  it('rejects entity managers (admin-only write)', async () => {
    const res = await request(app)
      .get('/api/integrations/slack/connect')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns authorizeUrl with secure state, all bot scopes, and never leaks client secret', async () => {
    const res = await request(app)
      .get('/api/integrations/slack/connect')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authorizeUrl).toContain('https://slack.com/oauth/v2/authorize');
    expect(res.body.authorizeUrl).toContain('client_id=slack-client-id');
    expect(JSON.stringify(res.body)).not.toContain('slack-client-secret');
    const url = new URL(res.body.authorizeUrl);
    expect(url.searchParams.get('state')?.length).toBeGreaterThanOrEqual(32);
    const scopes = (url.searchParams.get('scope') || '').split(',').filter(Boolean);
    expect(scopes).toEqual(['channels:read', 'chat:write', 'chat:write.public']);
  });
});

describe('GET /api/integrations/slack/callback', () => {
  it('rejects invalid state', async () => {
    const res = await request(app).get(
      '/api/integrations/slack/callback?code=abc&state=not-a-real-state',
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('slack=error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects replayed / expired state', async () => {
    const state = generateOAuthState();
    await storeOAuthState(state, { tenantId: tenant._id, userId: admin._id });
    await consumeOAuthState(state);
    const res = await request(app).get(
      `/api/integrations/slack/callback?code=abc&state=${state}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('slack=error');
  });

  it('redirects cancelled on access_denied', async () => {
    const res = await request(app).get(
      '/api/integrations/slack/callback?error=access_denied&state=x',
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('slack=cancelled');
  });

  it('exchanges code, encrypts token, upserts workspace, and redirects connected', async () => {
    const state = generateOAuthState();
    await storeOAuthState(state, { tenantId: tenant._id, userId: admin._id });
    fetchMock.mockResolvedValueOnce(
      mockJson({
        ok: true,
        access_token: 'xoxb-bot-secret-token',
        bot_user_id: 'U_BOT',
        team: { id: 'T_TEAM', name: 'Shelfmerch Swag' },
        authed_user: { id: 'U_ADMIN' },
      }),
    );

    const res = await request(app).get(
      `/api/integrations/slack/callback?code=oauth-code&state=${state}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('slack=connected');
    expect(JSON.stringify(res.headers)).not.toContain('xoxb-bot-secret-token');
    expect(JSON.stringify(res.headers)).not.toContain('slack-client-secret');

    const stored = await SlackConnection.findOne({ tenantId: tenant._id, teamId: 'T_TEAM' });
    expect(stored).toBeTruthy();
    expect(stored.status).toBe('connected');
    expect(stored.encryptedBotToken).toBeTruthy();
    expect(stored.encryptedBotToken).not.toBe('xoxb-bot-secret-token');
    expect(decryptToken(stored.encryptedBotToken)).toBe('xoxb-bot-secret-token');

    const body = fetchMock.mock.calls[0][1].body;
    expect(String(body)).toContain('client_secret');
  });

  it('reconnect upsert does not create duplicates', async () => {
    await SlackConnection.create({
      tenantId: tenant._id,
      teamId: 'T_TEAM',
      teamName: 'Old',
      encryptedBotToken: encryptToken('old-token'),
      installedByUserId: admin._id,
      status: 'connected',
      connectedAt: new Date(),
    });
    const state = generateOAuthState();
    await storeOAuthState(state, { tenantId: tenant._id, userId: admin._id });
    fetchMock.mockResolvedValueOnce(
      mockJson({
        ok: true,
        access_token: 'xoxb-new',
        bot_user_id: 'U_BOT',
        team: { id: 'T_TEAM', name: 'Shelfmerch Swag' },
      }),
    );
    await request(app).get(`/api/integrations/slack/callback?code=c&state=${state}`);
    expect(await SlackConnection.countDocuments({ tenantId: tenant._id, teamId: 'T_TEAM' })).toBe(1);
    const stored = await SlackConnection.findOne({ tenantId: tenant._id, teamId: 'T_TEAM' });
    expect(decryptToken(stored.encryptedBotToken)).toBe('xoxb-new');
  });
});

describe('Slack connection / channels / message / disconnect', () => {
  async function seedConnection(overrides = {}) {
    return SlackConnection.create({
      tenantId: tenant._id,
      teamId: 'T_TEAM',
      teamName: 'Shelfmerch Swag',
      encryptedBotToken: encryptToken('xoxb-live'),
      installedByUserId: admin._id,
      status: 'connected',
      connectedAt: new Date(),
      defaultChannelId: '',
      defaultChannelName: '',
      ...overrides,
    });
  }

  it('returns null connection when not connected', async () => {
    const res = await request(app)
      .get('/api/integrations/slack/connection')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.connection).toBeNull();
  });

  it('returns public connection without token', async () => {
    await seedConnection({ defaultChannelId: 'C1', defaultChannelName: 'general' });
    const res = await request(app)
      .get('/api/integrations/slack/connection')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.connection.teamName).toBe('Shelfmerch Swag');
    expect(JSON.stringify(res.body)).not.toContain('xoxb-live');
    expect(res.body.connection.encryptedBotToken).toBeUndefined();
  });

  it('enforces tenant isolation on connection status', async () => {
    await seedConnection();
    const res = await request(app)
      .get('/api/integrations/slack/connection')
      .set('Authorization', `Bearer ${otherAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.connection).toBeNull();
  });

  it('lists channels with tenant bot token', async () => {
    await seedConnection();
    fetchMock.mockResolvedValueOnce(
      mockJson({
        ok: true,
        channels: [{ id: 'C1', name: 'general', is_private: false, is_member: true }],
        response_metadata: { next_cursor: '' },
      }),
    );
    const res = await request(app)
      .get('/api/integrations/slack/channels')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.channels).toEqual([
      { id: 'C1', name: 'general', is_private: false, is_member: true },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(SLACK_CONVERSATIONS_LIST_URL);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer xoxb-live');
  });

  it('validates default channel via conversations.info', async () => {
    await seedConnection();
    fetchMock.mockResolvedValueOnce(
      mockJson({ ok: true, channel: { id: 'C9', name: 'all-shelfmerch-swag' } }),
    );
    const res = await request(app)
      .put('/api/integrations/slack/default-channel')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ channelId: 'C9' });
    expect(res.status).toBe(200);
    expect(res.body.connection.defaultChannelId).toBe('C9');
    expect(res.body.connection.defaultChannelName).toBe('all-shelfmerch-swag');
    expect(String(fetchMock.mock.calls[0][0])).toContain(SLACK_CONVERSATIONS_INFO_URL);
  });

  it('sends test message to default channel', async () => {
    await seedConnection({ defaultChannelId: 'C1', defaultChannelName: 'general' });
    fetchMock.mockResolvedValueOnce(mockJson({ ok: true, ts: '123.456' }));
    const res = await request(app)
      .post('/api/integrations/slack/test-message')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.channelId).toBe('C1');
    expect(String(fetchMock.mock.calls[0][0])).toBe(SLACK_CHAT_POST_MESSAGE_URL);
  });

  it('maps not_in_channel safely', async () => {
    await seedConnection({ defaultChannelId: 'C1', defaultChannelName: 'general' });
    fetchMock.mockResolvedValueOnce(mockJson({ ok: false, error: 'not_in_channel' }));
    const res = await request(app)
      .post('/api/integrations/slack/test-message')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SLACK_NOT_IN_CHANNEL');
    expect(res.body.error.message).toMatch(/could not post to that channel/i);
    expect(res.body.error.message).not.toMatch(/Invite @ShelfMerch/i);
  });

  it('marks needs_attention on token_revoked', async () => {
    await seedConnection({ defaultChannelId: 'C1', defaultChannelName: 'general' });
    fetchMock.mockResolvedValueOnce(mockJson({ ok: false, error: 'token_revoked' }));
    const res = await request(app)
      .post('/api/integrations/slack/test-message')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SLACK_AUTH_FAILED');
    const stored = await SlackConnection.findOne({ tenantId: tenant._id });
    expect(stored.status).toBe('needs_attention');
  });

  it('disconnect clears token and does not affect other tenant', async () => {
    await seedConnection();
    await SlackConnection.create({
      tenantId: otherTenant._id,
      teamId: 'T_OTHER',
      teamName: 'Other',
      encryptedBotToken: encryptToken('xoxb-other'),
      installedByUserId: admin._id,
      status: 'connected',
      connectedAt: new Date(),
    });
    fetchMock.mockResolvedValueOnce(mockJson({ ok: true, revoked: true }));

    const res = await request(app)
      .post('/api/integrations/slack/disconnect')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.disconnected).toBe(true);

    const local = await SlackConnection.findOne({ tenantId: tenant._id });
    expect(local.status).toBe('disconnected');
    expect(local.encryptedBotToken).toBe('');

    const peer = await SlackConnection.findOne({ tenantId: otherTenant._id });
    expect(peer.status).toBe('connected');
    expect(decryptToken(peer.encryptedBotToken)).toBe('xoxb-other');
    expect(String(fetchMock.mock.calls[0][0])).toBe(SLACK_AUTH_REVOKE_URL);
  });
});
