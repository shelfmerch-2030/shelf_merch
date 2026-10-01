import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as envModule from '../src/config/env.js';
import { decryptToken } from '../src/utils/tokenEncryption.js';
import {
  MERGE_HRIS_INTEGRATIONS,
  mergeProviderSourceCategory,
  mergeProviderOriginSegment,
} from '../src/modules/integrations/merge/merge.constants.js';
import { buildMergeEndUserOriginId } from '../src/modules/integrations/merge/merge.service.js';
import { normalizeMergeEmploymentStatus, syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import {
  MERGE_ACCOUNT_TOKEN_URL,
  MERGE_ACCOUNT_DETAILS_URL,
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_LOCATIONS_URL,
  MERGE_HRIS_EMPLOYMENTS_URL,
} from '../src/modules/integrations/merge/merge.constants.js';

let app;
let tenant;
let otherTenant;
let admin;
let adminToken;
let managerToken;
let fetchMock;

async function importSync(connOrId, { tenantId: forTenant = tenant._id } = {}) {
  const connectionId = connOrId && connOrId._id ? connOrId._id : connOrId;
  try {
    const result = await syncMergeConnection({
      tenantId: forTenant,
      connectionId,
      reason: 'manual',
    });
    return { status: 200, body: { success: true, ...result } };
  } catch (err) {
    return {
      status: err?.status || 500,
      body: { success: false, error: { code: err?.code, message: err?.message } },
    };
  }
}

async function makeUser(tenantDoc, role, scopeType) {
  const user = await User.create({
    tenantId: tenantDoc._id,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenantDoc._id,
    userId: user._id,
    role,
    scopeType,
  });
  return { user, token: signAccessToken(user, assignment) };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'mergeConfigured').mockReturnValue(true);
  envModule.env.MERGE_API_KEY = 'test-merge-api-key';
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix-gw' });
  otherTenant = await Tenant.create({ name: 'OtherCo', slug: 'other-gw' });
  ({ user: admin, token: adminToken } = await makeUser(tenant, 'company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser(tenant, 'entity_manager', 'entity'));
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('Google Workspace Merge constants', () => {
  it('includes google-workspace in the allowlist as a directory provider', () => {
    expect(MERGE_HRIS_INTEGRATIONS).toContain('google-workspace');
    expect(mergeProviderSourceCategory('google-workspace')).toBe('directory');
    expect(mergeProviderOriginSegment('google-workspace')).toBe('directory');
    expect(mergeProviderSourceCategory('gusto')).toBe('hris');
  });

  it('builds directory origin ids for Google Workspace', () => {
    const id = buildMergeEndUserOriginId({
      tenantId: 'tenant123',
      integration: 'google-workspace',
      existingOriginId: '',
      hasLegacyConnection: false,
    });
    expect(id).toBe('tenant123:directory:google-workspace');
  });

  it('maps suspended Google users to SUSPENDED status', () => {
    expect(normalizeMergeEmploymentStatus('SUSPENDED')).toBe('SUSPENDED');
    expect(normalizeMergeEmploymentStatus('ACTIVE')).toBe('ACTIVE');
    expect(normalizeMergeEmploymentStatus('INACTIVE')).toBe('INACTIVE');
  });
});

describe('Google Workspace connection + sync', () => {
  it('rejects entity managers from creating a Google Workspace link token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ link_token: 'x' }),
    });
    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ integration: 'google-workspace' });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges token, encrypts account token, stores directory category, and never leaks token', async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/account-token/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            account_token: 'gw-secret-token',
            id: 'linked-gw-1',
            integration: { slug: 'google-workspace', name: 'Google Workspace' },
          }),
        };
      }
      if (u.includes('/account-details')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'linked-gw-1',
            integration_slug: 'google-workspace',
            integration: 'Google Workspace',
            end_user_origin_id: `${tenant._id}:directory:google-workspace`,
            end_user_organization_name: 'Rubix',
            status: 'COMPLETE',
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'pub-gw', integration: 'google-workspace' });

    expect(res.status).toBe(200);
    expect(res.body.connection.provider).toBe('google-workspace');
    expect(res.body.connection.category).toBe('directory');
    expect(JSON.stringify(res.body)).not.toContain('gw-secret-token');
    expect(res.body.connection).not.toHaveProperty('encryptedAccountToken');

    const stored = await MergeConnection.findOne({
      tenantId: tenant._id,
      provider: 'google-workspace',
    });
    expect(stored.category).toBe('directory');
    expect(stored.endUserOriginId).toBe(`${tenant._id}:directory:google-workspace`);
    expect(decryptToken(stored.encryptedAccountToken)).toBe('gw-secret-token');
  });

  it('syncs Google Workspace users idempotently and keeps tenants isolated', async () => {
    const { encryptToken } = await import('../src/utils/tokenEncryption.js');
    const conn = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      category: 'directory',
      status: 'connected',
      encryptedAccountToken: encryptToken('gw-sync-token'),
      endUserOriginId: `${tenant._id}:directory:google-workspace`,
      connectedAt: new Date(),
    });

    const otherConn = await MergeConnection.create({
      tenantId: otherTenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      category: 'directory',
      status: 'connected',
      encryptedAccountToken: encryptToken('other-token'),
      endUserOriginId: `${otherTenant._id}:directory:google-workspace`,
      connectedAt: new Date(),
    });

    await MergeHrisEmployee.create({
      tenantId: otherTenant._id,
      connectionId: otherConn._id,
      provider: 'google-workspace',
      mergeEmployeeId: 'emp-shared-external',
      remoteEmployeeId: 'remote-1',
      displayName: 'Other Tenant User',
      workEmail: 'shared@example.com',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });

    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.startsWith(MERGE_HRIS_GROUPS_URL) || u.includes('/groups')) {
        return { ok: true, status: 200, json: async () => ({ results: [], next: null }) };
      }
      if (u.includes('/locations')) {
        return { ok: true, status: 200, json: async () => ({ results: [], next: null }) };
      }
      if (u.includes('/employments')) {
        return { ok: true, status: 200, json: async () => ({ results: [], next: null }) };
      }
      if (u.includes('/employees')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 'emp-shared-external',
                remote_id: 'remote-1',
                first_name: 'Ada',
                last_name: 'Lovelace',
                display_full_name: 'Ada Lovelace',
                work_email: 'ada@rubix.test',
                employment_status: 'SUSPENDED',
              },
            ],
            next: null,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ results: [], next: null }) };
    });

    const sync1 = await importSync(conn._id);
    expect(sync1.status).toBe(200);

    const sync2 = await importSync(conn._id);
    expect(sync2.status).toBe(200);

    const mine = await MergeHrisEmployee.find({
      tenantId: tenant._id,
      provider: 'google-workspace',
    });
    expect(mine).toHaveLength(1);
    expect(mine[0].workEmail).toBe('ada@rubix.test');
    expect(mine[0].employmentStatus).toBe('SUSPENDED');

    const theirs = await MergeHrisEmployee.find({
      tenantId: otherTenant._id,
      mergeEmployeeId: 'emp-shared-external',
    });
    expect(theirs).toHaveLength(1);
    expect(theirs[0].displayName).toBe('Other Tenant User');
  });

  it('disconnect preserves imported Google Workspace users and reuses origin on reconnect link', async () => {
    const { encryptToken } = await import('../src/utils/tokenEncryption.js');
    const originId = `${tenant._id}:directory:google-workspace`;
    const conn = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      category: 'directory',
      status: 'connected',
      encryptedAccountToken: encryptToken('gw-disc-token'),
      endUserOriginId: originId,
      connectedAt: new Date(),
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'google-workspace',
      mergeEmployeeId: 'emp-keep',
      displayName: 'Keep Me',
      workEmail: 'keep@rubix.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });

    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/delete-account')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (String(url).includes('create-link-token') || String(url).includes('/integrations/create-link-token')) {
        return { ok: true, status: 200, json: async () => ({ link_token: 'relink' }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const disc = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/disconnect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(disc.status).toBe(200);

    const kept = await MergeHrisEmployee.find({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' });
    expect(kept).toHaveLength(1);

    const stored = await MergeConnection.findOne({
      _id: conn._id,
      tenantId: tenant._id,
    });
    expect(stored.status).toBe('disconnected');
    expect(stored.encryptedAccountToken).toBe('');
    expect(stored.endUserOriginId).toBe(originId);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ link_token: 'relink-token' }),
    });
    const link = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'google-workspace' });
    expect(link.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
    expect(body.end_user_origin_id).toBe(originId);
  });

  it('does not auto-merge the same person from Workday and Google Workspace', async () => {
    const { encryptToken } = await import('../src/utils/tokenEncryption.js');
    const gw = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      category: 'directory',
      status: 'connected',
      encryptedAccountToken: encryptToken('a'),
      endUserOriginId: `${tenant._id}:directory:google-workspace`,
    });
    const wd = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'workday',
      category: 'hris',
      status: 'connected',
      encryptedAccountToken: encryptToken('b'),
      endUserOriginId: `${tenant._id}:hris:workday`,
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: gw._id,
      provider: 'google-workspace',
      mergeEmployeeId: 'gw-1',
      workEmail: 'same@rubix.test',
      displayName: 'Same Person GW',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: wd._id,
      provider: 'workday',
      mergeEmployeeId: 'wd-1',
      workEmail: 'same@rubix.test',
      displayName: 'Same Person WD',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    const rows = await MergeHrisEmployee.find({
      tenantId: tenant._id,
      workEmail: 'same@rubix.test',
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.provider))).toEqual(new Set(['google-workspace', 'workday']));
  });

  it('maps Google Workspace auth failure to needs_attention without leaking tokens', async () => {
    const { encryptToken } = await import('../src/utils/tokenEncryption.js');
    const conn = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      category: 'directory',
      status: 'connected',
      encryptedAccountToken: encryptToken('gw-auth-fail-token'),
      endUserOriginId: `${tenant._id}:directory:google-workspace`,
      connectedAt: new Date(),
    });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid account token gw-auth-fail-token' }),
    });

    const res = await importSync(conn._id);

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('MERGE_AUTH_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('gw-auth-fail-token');

    const refreshed = await MergeConnection.findOne({
      _id: conn._id,
      tenantId: tenant._id,
    });
    expect(refreshed.status).toBe('needs_attention');
  });

  it('recovers Google Workspace needs_attention when account-details is COMPLETE', async () => {
    const { encryptToken } = await import('../src/utils/tokenEncryption.js');
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      category: 'directory',
      status: 'needs_attention',
      encryptedAccountToken: encryptToken('gw-recover-token'),
      endUserOriginId: `${tenant._id}:directory:google-workspace`,
      connectedAt: new Date(),
      lastSyncStatus: 'failed',
      lastError: 'MERGE_AUTH_FAILED',
    });

    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_ACCOUNT_DETAILS_URL) || href.includes('/account-details')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'linked-gw-recover',
            status: 'COMPLETE',
            integration_slug: 'google-workspace',
            integration: 'Google Workspace',
          }),
        };
      }
      if (href.includes('/hris/v1/issues')) {
        return { ok: true, status: 200, json: async () => ({ next: null, results: [] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const res = await request(app)
      .get('/api/integrations/merge/connections')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.connections).toHaveLength(1);
    expect(res.body.connections[0].provider).toBe('google-workspace');
    expect(res.body.connections[0].status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain('gw-recover-token');

    const refreshed = await MergeConnection.findOne({
      tenantId: tenant._id,
      provider: 'google-workspace',
    });
    expect(refreshed.status).toBe('connected');
  });
});
