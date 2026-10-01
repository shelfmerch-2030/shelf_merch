import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as envModule from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { encryptToken, decryptToken } from '../src/utils/tokenEncryption.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import {
  MERGE_ACCOUNT_DETAILS_URL,
  MERGE_ACCOUNT_TOKEN_URL,
  MERGE_CREATE_LINK_TOKEN_URL,
  MERGE_DELETE_ACCOUNT_URL,
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_ISSUES_URL,
} from '../src/modules/integrations/merge/merge.constants.js';
import { syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';
import { disconnectMergeConnection } from '../src/modules/integrations/merge/merge.service.js';
import { processMergeHrisSyncJob } from '../src/jobs/mergeHrisSync.worker.js';

const ACCOUNT_TOKEN = 'phase4-account-token-secret';
const WEBHOOK_SECRET = 'phase4-webhook-secret';
const ISSUE_SECRET = 'provider-secret-token-abcdefghijklmnopqrstuvwxyz';

const { jobs, fakeQueue } = vi.hoisted(() => {
  const jobs = new Map();
  const fakeQueue = {
    async getJob(id) {
      return jobs.get(id);
    },
    async add(_name, data, opts) {
      if (jobs.has(opts.jobId)) throw new Error(`JobId ${opts.jobId} already exists`);
      const job = {
        id: opts.jobId,
        data,
        opts,
        state: 'waiting',
        async getState() {
          return this.state;
        },
        async remove() {
          jobs.delete(this.id);
        },
      };
      jobs.set(opts.jobId, job);
      return job;
    },
  };
  return { jobs, fakeQueue };
});

vi.mock('../src/jobs/queues.js', async () => {
  const actual = await vi.importActual('../src/jobs/queues.js');
  return {
    ...actual,
    enqueueMergeHrisSync: (input) =>
      actual.enqueueMergeHrisSync(input, {
        queue: fakeQueue,
        ensureReady: async () => true,
      }),
  };
});

let app;
let tenant;
let admin;
let adminToken;
let fetchMock;

function signBody(raw) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function mockJson(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => data,
  };
}

function postWebhook(raw, signature = signBody(raw)) {
  return request(app)
    .post('/api/integrations/merge/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Merge-Webhook-Signature', signature)
    .send(raw);
}

function envelope(event, linkedAccountId, data = {}) {
  return JSON.stringify({
    hook: {
      id: 'e8affe31-8ae0-4b37-8c50-d86303094dc4',
      event,
      target: 'https://webhook.site/105606a8-cfa3-4415-bae0-954e25137f00',
    },
    linked_account: {
      id: linkedAccountId,
      integration: 'BambooHR',
      integration_slug: 'bamboohr',
      category: 'hris',
      end_user_origin_id: 'origin-from-body-do-not-trust',
      end_user_email_address: 'person@example.test',
      status: 'COMPLETE',
      account_type: 'PRODUCTION',
    },
    data,
  });
}

async function makeAdmin() {
  const user = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: user._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  admin = user;
  return signAccessToken(user, assignment);
}

function reload(id) {
  return MergeConnection.findOne({ _id: id, tenantId: tenant._id });
}

async function seedConnection(overrides = {}) {
  return MergeConnection.create({
    tenantId: tenant._id,
    connectedByUserId: admin._id,
    provider: 'deel',
    category: 'hris',
    encryptedAccountToken: encryptToken(ACCOUNT_TOKEN),
    mergeLinkedAccountId: `linked-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    endUserOriginId: `${tenant._id}:hris:deel`,
    status: 'connected',
    connectedAt: new Date(),
    lastSyncStatus: 'idle',
    ...overrides,
  });
}

function doneStatus(status = 'DONE') {
  const row = (modelId, modelName) => ({
    model_id: modelId,
    model_name: modelName,
    status,
    last_sync_result: status,
    is_initial_sync: status !== 'DONE',
  });
  return {
    next: null,
    results: [
      row('hris.Employee', 'Employee'),
      row('hris.Employment', 'Employment'),
      row('hris.Group', 'Group'),
      row('hris.Location', 'Location'),
    ],
  };
}

function healthyMerge({ issues = [] } = {}) {
  fetchMock.mockImplementation(async (url) => {
    const href = String(url);
    if (href.startsWith(MERGE_ACCOUNT_DETAILS_URL)) return mockJson({ status: 'COMPLETE' });
    if (href.startsWith(MERGE_HRIS_ISSUES_URL)) return mockJson({ next: null, results: issues });
    if (href.includes('/hris/v1/sync-status')) return mockJson(doneStatus());
    return mockJson({ next: null, results: [] });
  });
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'mergeConfigured').mockReturnValue(true);
  envModule.env.MERGE_API_KEY = 'test-merge-api-key';
  envModule.env.MERGE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  envModule.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  jobs.clear();
  tenant = await Tenant.create({ name: 'Phase4', slug: `phase4-${Date.now()}` });
  adminToken = await makeAdmin();
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('Phase 4 Merge connection lifecycle', () => {
  it('1/2. a new HRIS connection enqueues one full initial sync', async () => {
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_ACCOUNT_TOKEN_URL('pub-new').split('/pub-new')[0])) {
        return mockJson({ account_token: ACCOUNT_TOKEN, id: 'linked-new', integration: { slug: 'deel', name: 'Deel' } });
      }
      if (href.startsWith(MERGE_ACCOUNT_DETAILS_URL)) {
        return mockJson({
          id: 'linked-new',
          status: 'COMPLETE',
          integration_slug: 'deel',
          integration: 'Deel',
          end_user_origin_id: `${tenant._id}:hris:deel`,
        });
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'pub-new', integration: 'deel' });

    expect(res.status).toBe(200);
    expect(res.body.connection.status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain(ACCOUNT_TOKEN);
    const stored = await MergeConnection.findOne({ tenantId: tenant._id, provider: 'deel' });
    const job = jobs.get(`merge-hris-sync:${stored._id}`);
    expect(job.data).toEqual({
      tenantId: String(tenant._id),
      connectionId: String(stored._id),
      requestedByUserId: String(admin._id),
      reason: 'initial',
    });
    expect(jobs.size).toBe(1);

    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/hris/v1/sync-status')) return mockJson(doneStatus());
      return mockJson({ next: null, results: [] });
    });
    const imported = await syncMergeConnection({
      tenantId: tenant._id,
      connectionId: stored._id,
      reason: 'initial',
    });
    expect(imported.sync.mode).toBe('full');
    const employeeCall = fetchMock.mock.calls.find((entry) => String(entry[0]).startsWith(MERGE_HRIS_EMPLOYEES_URL));
    expect(new URL(String(employeeCall[0])).searchParams.get('modified_after')).toBeNull();
  });

  it('3. initial SYNCING does not prune or set lastFullSyncAt', async () => {
    const conn = await seedConnection();
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-keep',
      firstName: 'Kept',
    });
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/hris/v1/sync-status')) return mockJson(doneStatus('SYNCING'));
      return mockJson({ next: null, results: [] });
    });
    const result = await syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
      reason: 'initial',
    });
    expect(result.sync.mode).toBe('full');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
    const stored = await reload(conn._id);
    expect(stored.lastFullSyncAt).toBeNull();
    expect(stored.status).toBe('connected');
  });

  it('4/5. Issue.new and Issue.reopened mark needs_attention without storing the body', async () => {
    const conn = await seedConnection();
    const raw = envelope('Issue.new', conn.mergeLinkedAccountId, {
      error_description: `Missing Permissions ${ISSUE_SECRET}`,
      error_details: ['employee ssn 123-45-6789'],
      end_user: { email_address: 'person@example.test' },
    });
    const res = await postWebhook(raw);
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(false);
    expect(jobs.size).toBe(0);
    let stored = await reload(conn._id);
    expect(stored.status).toBe('needs_attention');
    expect(stored.lastSyncStatus).toBe('idle');
    expect(stored.mergeIssueStatus).toBe('ONGOING');
    expect(stored.mergeIssueError).not.toContain(ISSUE_SECRET);
    expect(stored.mergeIssueError).not.toContain('123-45-6789');

    stored.status = 'connected';
    stored.mergeIssueStatus = '';
    await stored.save();
    const reopened = await postWebhook(
      envelope('Issue.reopened', conn.mergeLinkedAccountId, { error_description: 'Expired authentication' }),
    );
    expect(reopened.body.queued).toBe(false);
    stored = await reload(conn._id);
    expect(stored.status).toBe('needs_attention');
    expect(stored.mergeIssueError).toContain('Expired authentication');
  });

  it('6/7. Issue.resolved follows current Merge health, not the event alone', async () => {
    const conn = await seedConnection({ status: 'needs_attention', mergeIssueStatus: 'ONGOING' });
    healthyMerge({
      issues: [{ id: 'issue-2', status: 'ONGOING', is_muted: false, error_description: 'Missing Permissions' }],
    });
    const blocked = await postWebhook(envelope('Issue.resolved', conn.mergeLinkedAccountId, { status: 'RESOLVED' }));
    expect(blocked.body.queued).toBe(false);
    expect(jobs.size).toBe(0);
    let stored = await reload(conn._id);
    expect(stored.status).toBe('needs_attention');

    healthyMerge({ issues: [] });
    const cleared = await postWebhook(envelope('Issue.resolved', conn.mergeLinkedAccountId, { status: 'RESOLVED' }));
    expect(cleared.body.queued).toBe(false);
    expect(jobs.size).toBe(0);
    stored = await reload(conn._id);
    expect(stored.status).toBe('connected');
    expect(stored.mergeIssueStatus).toBe('');
  });

  it('8. Issue.muted does not restore connected', async () => {
    const conn = await seedConnection({ status: 'needs_attention', mergeIssueStatus: 'ONGOING' });
    healthyMerge({ issues: [] });
    const res = await postWebhook(envelope('Issue.muted', conn.mergeLinkedAccountId, { is_muted: true }));
    expect(res.body.queued).toBe(false);
    const stored = await reload(conn._id);
    expect(stored.status).toBe('needs_attention');
    expect(stored.mergeIssueStatus).toBe('MUTED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('9-14. relink reuses the connection, origin, and cursors, and enqueues one recovery sync', async () => {
    const origin = `${tenant._id}:hris:deel`;
    const cursors = {
      employee: new Date('2026-05-01T12:00:00.000Z'),
      employment: new Date('2026-05-01T12:00:00.000Z'),
      group: new Date('2026-05-01T12:00:00.000Z'),
      location: new Date('2026-05-01T12:00:00.000Z'),
      contact: new Date('2026-05-01T12:00:00.000Z'),
    };
    const conn = await seedConnection({
      status: 'needs_attention',
      endUserOriginId: origin,
      lastSyncAt: new Date('2026-05-01T00:00:00.000Z'),
      lastFullSyncAt: new Date('2026-05-01T00:00:00.000Z'),
      mergeSyncCursors: cursors,
      lastError: 'RELINK_NEEDED',
    });
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === MERGE_CREATE_LINK_TOKEN_URL) {
        expect(JSON.parse(init.body).end_user_origin_id).toBe(origin);
        expect(JSON.parse(init.body).integration).toBe('deel');
        return mockJson({ link_token: 'link-token-relink' });
      }
      if (String(url).startsWith(MERGE_ACCOUNT_DETAILS_URL)) return mockJson({ status: 'COMPLETE' });
      if (String(url).startsWith(MERGE_HRIS_ISSUES_URL)) return mockJson({ next: null, results: [] });
      return mockJson({}, 404);
    });

    const link = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'deel' });
    expect(link.status).toBe(200);
    expect(link.body.linkToken).toBe('link-token-relink');
    expect(JSON.stringify(link.body)).not.toContain('test-merge-api-key');

    const before = await MergeConnection.countDocuments({ tenantId: tenant._id });
    const raw = envelope('LinkedAccount.linked', conn.mergeLinkedAccountId, {
      is_relink: true,
      account_token: 'webhook-account-token-should-not-stick',
    });
    const first = await postWebhook(raw);
    const second = await postWebhook(raw);
    expect(first.body.queued).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.alreadyQueuedOrRunning).toBe(true);
    expect(jobs.size).toBe(1);
    expect(jobs.get(`merge-hris-sync:${conn._id}`).data.reason).toBe('manual');
    expect(JSON.stringify(jobs.get(`merge-hris-sync:${conn._id}`).data)).not.toContain('webhook-account-token');

    const stored = await reload(conn._id);
    expect(await MergeConnection.countDocuments({ tenantId: tenant._id })).toBe(before);
    expect(String(stored._id)).toBe(String(conn._id));
    expect(stored.endUserOriginId).toBe(origin);
    expect(stored.status).toBe('connected');
    expect(stored.mergeSyncCursors.employee.toISOString()).toBe(cursors.employee.toISOString());
    expect(stored.lastFullSyncAt.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(decryptToken(stored.encryptedAccountToken)).toBe(ACCOUNT_TOKEN);
  });

  it('15/16. LinkedAccount.deleted disconnects and scheduled sync skips it', async () => {
    const conn = await seedConnection({ mergeLinkedAccountId: 'linked-deleted' });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-remain',
    });
    const other = await seedConnection({
      provider: 'gusto',
      mergeLinkedAccountId: 'linked-still',
      endUserOriginId: `${tenant._id}:hris:gusto`,
    });
    const res = await postWebhook(envelope('LinkedAccount.deleted', 'linked-deleted', {}));
    expect(res.body.queued).toBe(false);
    const stored = await reload(conn._id);
    expect(stored.status).toBe('disconnected');
    expect(stored.disconnectedByUser).toBe(false);
    expect(stored.encryptedAccountToken).toBe('');
    expect(stored.mergeLinkedAccountId).toBe('linked-deleted');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-remain' })).toBe(1);

    fetchMock.mockImplementation(async () => mockJson({ status: 'COMPLETE' }));
    await processMergeHrisSyncJob({ name: 'schedule', data: {}, id: 'merge-hris-schedule' });
    expect(jobs.has(`merge-hris-sync:${conn._id}`)).toBe(false);
    expect(jobs.has(`merge-hris-sync:${other._id}`)).toBe(true);
  });

  it('17. a running import cannot mark a deleted connection connected', async () => {
    const conn = await seedConnection({
      mergeSyncCursors: { employee: new Date('2026-04-01T00:00:00.000Z') },
      lastFullSyncAt: new Date('2026-04-01T00:00:00.000Z'),
    });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/hris/v1/sync-status')) return mockJson(doneStatus());
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        await MergeConnection.updateOne(
          { _id: conn._id, tenantId: tenant._id },
          { $set: { status: 'disconnected', encryptedAccountToken: '' } },
        );
      }
      return mockJson({ next: null, results: [] });
    });
    await expect(
      syncMergeConnection({ tenantId: tenant._id, connectionId: conn._id, reason: 'initial' }),
    ).rejects.toMatchObject({ code: 'MERGE_CONNECTION_INACTIVE' });
    const stored = await reload(conn._id);
    expect(stored.status).toBe('disconnected');
    expect(stored.lastFullSyncAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(stored.mergeSyncCursors.employee.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('18. Issue.resolved cannot undo a user disconnect', async () => {
    const conn = await seedConnection({ mergeLinkedAccountId: 'linked-user-off' });
    fetchMock.mockImplementation(async (url) => {
      if (String(url).startsWith(MERGE_DELETE_ACCOUNT_URL)) return mockJson({});
      if (String(url).startsWith(MERGE_ACCOUNT_DETAILS_URL)) return mockJson({ status: 'COMPLETE' });
      if (String(url).startsWith(MERGE_HRIS_ISSUES_URL)) return mockJson({ next: null, results: [] });
      return mockJson({});
    });
    await disconnectMergeConnection({ tenantId: tenant._id, connectionId: conn._id });
    const after = await postWebhook(
      envelope('Issue.resolved', 'linked-user-off', { status: 'RESOLVED', error_description: 'fixed' }),
    );
    expect(after.body.ignored).toBe(true);
    const stored = await reload(conn._id);
    expect(stored.status).toBe('disconnected');
    expect(stored.disconnectedByUser).toBe(true);

    const kept = await seedConnection({
      provider: 'bamboohr',
      status: 'disconnected',
      disconnectedByUser: true,
      encryptedAccountToken: encryptToken(ACCOUNT_TOKEN),
      mergeLinkedAccountId: 'linked-kept',
      endUserOriginId: `${tenant._id}:hris:bamboohr`,
    });
    const again = await postWebhook(envelope('Issue.resolved', 'linked-kept', { status: 'RESOLVED' }));
    expect(again.body.ignored).toBe(true);
    const row = await reload(kept._id);
    expect(row.status).toBe('disconnected');
    expect(row.disconnectedByUser).toBe(true);
  });

  it('19/20. auth failure is needs_attention; rate limit and 5xx are sync failures only', async () => {
    const auth = await seedConnection({ provider: 'gusto', endUserOriginId: `${tenant._id}:hris:gusto`, mergeLinkedAccountId: 'linked-auth' });
    fetchMock.mockImplementation(async () => mockJson({ detail: 'unauthorized' }, 401));
    await expect(
      syncMergeConnection({ tenantId: tenant._id, connectionId: auth._id, reason: 'manual' }),
    ).rejects.toMatchObject({ code: 'MERGE_AUTH_FAILED' });
    expect((await reload(auth._id)).status).toBe('needs_attention');
    expect((await reload(auth._id)).lastSyncStatus).toBe('failed');

    const limited = await seedConnection({
      provider: 'hibob',
      endUserOriginId: `${tenant._id}:hris:hibob`,
      mergeLinkedAccountId: 'linked-limit',
    });
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/hris/v1/sync-status')) return mockJson(doneStatus());
      return mockJson({ detail: 'slow down' }, 429, { 'retry-after': '0' });
    });
    await expect(
      syncMergeConnection({ tenantId: tenant._id, connectionId: limited._id, reason: 'manual' }),
    ).rejects.toMatchObject({ code: 'MERGE_RATE_LIMITED' });
    expect((await reload(limited._id)).status).toBe('connected');
    expect((await reload(limited._id)).lastSyncStatus).toBe('failed');

    const down = await seedConnection({
      provider: 'ukg-pro',
      endUserOriginId: `${tenant._id}:hris:ukg-pro`,
      mergeLinkedAccountId: 'linked-down',
    });
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/hris/v1/sync-status')) return mockJson(doneStatus());
      return mockJson({ detail: 'boom' }, 502);
    });
    await expect(
      syncMergeConnection({ tenantId: tenant._id, connectionId: down._id, reason: 'scheduled' }),
    ).rejects.toMatchObject({ code: 'MERGE_UPSTREAM_ERROR' });
    expect((await reload(down._id)).status).toBe('connected');
  });

  it('21. an ambiguous linked-account id fails closed', async () => {
    const first = await seedConnection({ mergeLinkedAccountId: 'linked-shared', provider: 'deel' });
    const second = await seedConnection({
      mergeLinkedAccountId: 'linked-shared',
      provider: 'gusto',
      endUserOriginId: `${tenant._id}:hris:gusto`,
    });
    const res = await postWebhook(
      envelope('Issue.new', 'linked-shared', { error_description: 'Missing Permissions' }),
    );
    expect(res.body.ignored).toBe(true);
    expect((await reload(first._id)).status).toBe('connected');
    expect((await reload(second._id)).status).toBe('connected');
  });

  it('22/23/24. tokens and issue secrets stay out of logs and queue payloads', async () => {
    const lines = [];
    const record = (obj) => lines.push(JSON.stringify(obj));
    const info = vi.spyOn(logger, 'info').mockImplementation(record);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(record);
    const error = vi.spyOn(logger, 'error').mockImplementation(record);
    try {
      const conn = await seedConnection({ lastSyncAt: new Date('2026-05-01T00:00:00.000Z') });
      healthyMerge({ issues: [] });
      const linked = envelope('LinkedAccount.linked', conn.mergeLinkedAccountId, {
        is_relink: true,
        account_token: ACCOUNT_TOKEN,
      });
      const issue = envelope('Issue.new', conn.mergeLinkedAccountId, {
        error_description: `Bad API Key ${ISSUE_SECRET}`,
        end_user: { email_address: 'person@example.test' },
      });
      const linkedRes = await postWebhook(linked);
      const issueRes = await postWebhook(issue);
      const job = jobs.get(`merge-hris-sync:${conn._id}`);
      const blob = JSON.stringify({ linked: linkedRes.body, issue: issueRes.body, data: job?.data, lines });
      expect(blob).not.toContain(ACCOUNT_TOKEN);
      expect(blob).not.toContain(ISSUE_SECRET);
      expect(blob).not.toContain(WEBHOOK_SECRET);
      expect(blob).not.toContain('test-merge-api-key');
      expect(blob).not.toContain('person@example.test');
    } finally {
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
