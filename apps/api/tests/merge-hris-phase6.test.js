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
import { encryptToken } from '../src/utils/tokenEncryption.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeSyncRun } from '../src/modules/integrations/merge/mergeSyncRun.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import {
  MERGE_ACCOUNT_DETAILS_URL,
  MERGE_API_BASE,
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_ISSUES_URL,
  MERGE_SCHEDULE_EVERY_MS,
  MERGE_SCHEDULE_JOB_ID,
  MERGE_SCHEDULE_JOB_NAME,
} from '../src/modules/integrations/merge/merge.constants.js';
import { syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';
import { reconcileMergeConnectionHealth, buildMergeEndUserOriginId } from '../src/modules/integrations/merge/merge.service.js';
import { handleMergeLifecycleEvent } from '../src/modules/integrations/merge/mergeLifecycle.js';
import { handleMergeWebhook, verifyMergeWebhookSignature } from '../src/modules/integrations/merge/mergeWebhook.js';
import { findDuplicateMergeLinkedAccounts } from '../src/modules/integrations/merge/mergeLinkedAccountAudit.js';
import {
  enqueueScheduledMergeHrisSyncs,
  registerMergeHrisSyncSchedule,
} from '../src/modules/integrations/merge/mergeSchedule.js';
import { acquireMergeSyncLock } from '../src/modules/integrations/merge/mergeSyncLock.js';
import { recoverStaleMergeSyncs } from '../src/modules/integrations/merge/mergeSyncRun.service.js';
import { validateMergeEnvironment } from '../src/config/env.js';

const SECRET = 'phase6-webhook-secret';
const TOKEN = 'phase6-account-token-secret';

let app;
let tenant;
let otherTenant;
let admin;
let adminToken;
let otherToken;
let fetchMock;

function mockJson(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => data,
  };
}

function doneStatus() {
  const row = (modelId) => ({
    model_id: modelId,
    status: 'DONE',
    last_sync_result: 'DONE',
    is_initial_sync: false,
  });
  return {
    next: null,
    results: ['hris.Employee', 'hris.Employment', 'hris.Group', 'hris.Location'].map((id) => row(id)),
  };
}

function sign(raw) {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'mergeConfigured').mockReturnValue(true);
  envModule.env.MERGE_API_KEY = 'test-merge-api-key';
  envModule.env.MERGE_WEBHOOK_SECRET = SECRET;
  envModule.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Phase6', slug: `p6-${Date.now()}` });
  otherTenant = await Tenant.create({ name: 'Other', slug: `p6b-${Date.now()}` });
  admin = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: `admin-${Date.now()}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: admin._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  adminToken = signAccessToken(admin, assignment);
  const otherAdmin = await User.create({
    tenantId: otherTenant._id,
    name: 'Other',
    email: `other-${Date.now()}@test.io`,
    status: 'active',
  });
  const otherAssignment = await RoleAssignment.create({
    tenantId: otherTenant._id,
    userId: otherAdmin._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  otherToken = signAccessToken(otherAdmin, otherAssignment);
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

async function seed(extra = {}, forTenant = tenant) {
  return MergeConnection.create({
    tenantId: forTenant._id,
    connectedByUserId: admin._id,
    provider: 'workday',
    category: 'hris',
    encryptedAccountToken: encryptToken(TOKEN),
    status: 'connected',
    mergeLinkedAccountId: 'linked-current',
    endUserOriginId: `${forTenant._id}:hris:workday`,
    connectedAt: new Date(),
    lastSyncStatus: 'idle',
    ...extra,
  });
}

function mockDirectory() {
  fetchMock.mockImplementation(async (url) => {
    const href = String(url);
    if (href.includes('/hris/v1/sync-status')) return mockJson(doneStatus());
    if (href.includes('/hris/v1/employees')) {
      return mockJson({
        next: null,
        results: [{ id: 'emp-1', first_name: 'Ada', last_name: 'Lovelace', work_email: 'ada@example.test', employment_status: 'ACTIVE' }],
      });
    }
    return mockJson({ next: null, results: [] });
  });
}

describe('Phase 6 consistency', () => {
  it('1-3. health failures and a successful sync do not clear needs_attention, and 429 does not change health', async () => {
    const blocked = await seed({ status: 'needs_attention', lastError: 'MERGE_AUTH_FAILED' });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_ACCOUNT_DETAILS_URL)) return mockJson({ id: 'linked-current', status: 'COMPLETE' });
      if (href.startsWith(MERGE_HRIS_ISSUES_URL)) return mockJson({ detail: 'down' }, 503);
      return mockJson({}, 404);
    });
    const health = await reconcileMergeConnectionHealth(blocked, { requireIssues: true });
    expect(health.status).toBe('needs_attention');

    mockDirectory();
    const synced = await syncMergeConnection({ tenantId: tenant._id, connectionId: blocked._id, reason: 'manual' });
    expect(synced.connection.status).toBe('needs_attention');
    expect(synced.connection.lastSyncStatus).toBe('success');

    const healthy = await seed({ provider: 'bamboohr', mergeLinkedAccountId: 'linked-bamboo' });
    fetchMock.mockImplementation(async () => mockJson({ detail: 'slow' }, 429, { 'retry-after': '0' }));
    await expect(
      syncMergeConnection({ tenantId: tenant._id, connectionId: healthy._id, reason: 'manual', maxAttempts: 1 }),
    ).rejects.toMatchObject({ code: 'MERGE_RATE_LIMITED' });
    const row = await MergeConnection.findOne({ _id: healthy._id, tenantId: tenant._id });
    expect(row.status).toBe('connected');
    expect(row.lastSyncStatus).toBe('failed');
  });

  it('4-6. RELINK_NEEDED and INCOMPLETE need attention, and IDLE stays connected', async () => {
    const conn = await seed();
    for (const status of ['RELINK_NEEDED', 'INCOMPLETE']) {
      conn.status = 'connected';
      fetchMock.mockImplementation(async (url) => {
        if (String(url).startsWith(MERGE_ACCOUNT_DETAILS_URL)) return mockJson({ id: 'linked-current', status });
        return mockJson({}, 404);
      });
      const updated = await reconcileMergeConnectionHealth(conn, { requireIssues: true });
      expect(updated.status).toBe('needs_attention');
    }
    conn.status = 'connected';
    fetchMock.mockImplementation(async (url) => {
      if (String(url).startsWith(MERGE_ACCOUNT_DETAILS_URL)) return mockJson({ id: 'linked-current', status: 'IDLE' });
      return mockJson({}, 404);
    });
    const idle = await reconcileMergeConnectionHealth(conn, { requireIssues: true });
    expect(idle.status).toBe('connected');
  });

  it('7-8. Employee scope failure needs attention, and a disabled group scope does not', async () => {
    const required = await seed();
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/sync-status')) return mockJson(doneStatus());
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) return mockJson({ next: null, results: [] });
      if (href.includes('/locations')) return mockJson({ next: null, results: [] });
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({ detail: 'Required scope is disabled for this linked account' }, 403);
      }
      return mockJson({ next: null, results: [] });
    });
    await expect(syncMergeConnection({ tenantId: tenant._id, connectionId: required._id })).rejects.toMatchObject({
      code: 'MERGE_SCOPES_DISABLED',
    });
    expect((await MergeConnection.findOne({ _id: required._id, tenantId: tenant._id })).status).toBe('needs_attention');

    const optional = await seed({ provider: 'bamboohr', mergeLinkedAccountId: 'linked-optional' });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/sync-status')) return mockJson(doneStatus());
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) {
        return mockJson({ detail: 'Group scope is disabled for this linked account' }, 403);
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({
          next: null,
          results: [{ id: 'emp-1', work_email: 'ada@example.test', employment_status: 'ACTIVE', groups: null, work_location: null }],
        });
      }
      return mockJson({ next: null, results: [] });
    });
    const result = await syncMergeConnection({ tenantId: tenant._id, connectionId: optional._id });
    expect(result.connection.status).toBe('connected');
    expect(result.connection.lastError).toBe('MERGE_OPTIONAL_SCOPE_DISABLED');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: optional._id })).toBe(1);
  });

  it('9-11/14/27. disconnect and old linked-account webhooks fail closed, and replays stay idempotent', async () => {
    const conn = await seed({ disconnectedByUser: true, status: 'disconnected', encryptedAccountToken: '' });
    const issue = await handleMergeLifecycleEvent({
      hook: { id: 'hook-1', event: 'Issue.resolved' },
      linked_account: { id: 'linked-current', category: 'hris' },
    });
    expect(issue.ignored).toBe(true);
    const linked = await handleMergeLifecycleEvent({
      hook: { id: 'hook-1', event: 'LinkedAccount.linked' },
      linked_account: { id: 'linked-current', category: 'hris' },
      data: { is_relink: true },
    });
    expect(linked.ignored).toBe(true);
    const after = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(after.disconnectedByUser).toBe(true);
    expect(after.status).toBe('disconnected');

    const current = await seed({
      provider: 'bamboohr',
      mergeLinkedAccountId: 'linked-b',
      status: 'connected',
    });
    const stale = await handleMergeWebhook(
      Buffer.from(JSON.stringify({
        hook: { id: 'hook-old', event: 'Employee.changed' },
        linked_account: { id: 'linked-a', category: 'hris' },
      })),
      sign(JSON.stringify({
        hook: { id: 'hook-old', event: 'Employee.changed' },
        linked_account: { id: 'linked-a', category: 'hris' },
      })),
    );
    expect(stale.ignored).toBe(true);
    expect((await MergeConnection.findOne({ _id: current._id, tenantId: tenant._id })).mergeLinkedAccountId).toBe('linked-b');

    await seed({
      provider: 'gusto',
      mergeLinkedAccountId: 'linked-shared',
    }, otherTenant);
    await seed({
      provider: 'keka',
      mergeLinkedAccountId: 'linked-shared',
    });
    const ambiguous = await handleMergeLifecycleEvent({
      hook: { id: 'hook-2', event: 'Issue.new' },
      linked_account: { id: 'linked-shared', category: 'hris' },
      data: { error_description: 'token should-not-leak' },
    });
    expect(ambiguous.ignored).toBe(true);

    const once = await seed({ provider: 'deel', mergeLinkedAccountId: 'linked-deel', status: 'connected' });
    const body = {
      hook: { id: 'hook-3', event: 'Issue.new' },
      linked_account: { id: 'linked-deel', category: 'hris' },
      data: { error_description: 'needs relink' },
    };
    await handleMergeLifecycleEvent(body);
    await handleMergeLifecycleEvent(body);
    const replayed = await MergeConnection.findOne({ _id: once._id, tenantId: tenant._id });
    expect(replayed.status).toBe('needs_attention');
  });

  it('12. relink reuses the stored origin id', () => {
    const stored = `${tenant._id}:hris:workday`;
    expect(buildMergeEndUserOriginId({
      tenantId: tenant._id,
      integration: 'workday',
      existingOriginId: stored,
      hasLegacyConnection: false,
    })).toBe(stored);
    expect(buildMergeEndUserOriginId({
      tenantId: tenant._id,
      integration: 'workday',
      existingOriginId: String(tenant._id),
      hasLegacyConnection: true,
    })).toBe(String(tenant._id));
  });

  it('13. the duplicate audit reports rows and does not change them', async () => {
    const first = await seed({ mergeLinkedAccountId: 'linked-dup' });
    const second = await seed({
      provider: 'hibob',
      mergeLinkedAccountId: 'linked-dup',
    }, otherTenant);
    const before = await MergeConnection.countDocuments({ tenantId: tenant._id, mergeLinkedAccountId: 'linked-dup' })
      + await MergeConnection.countDocuments({ tenantId: otherTenant._id, mergeLinkedAccountId: 'linked-dup' });
    const duplicates = await findDuplicateMergeLinkedAccounts();
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].count).toBe(2);
    const ids = duplicates[0].connections.map((row) => row.connectionId).sort();
    expect(ids).toEqual([String(first._id), String(second._id)].sort());
    expect(JSON.stringify(duplicates)).not.toContain(TOKEN);
    const after = await MergeConnection.countDocuments({ tenantId: tenant._id, mergeLinkedAccountId: 'linked-dup' })
      + await MergeConnection.countDocuments({ tenantId: otherTenant._id, mergeLinkedAccountId: 'linked-dup' });
    expect(after).toBe(before);
  });

  it('15-16. queue dedupe and the database lease allow only one import', async () => {
    const conn = await seed();
    const jobs = new Map();
    const queue = {
      async getJob(id) {
        return jobs.get(id) || null;
      },
      async add(_name, data, opts) {
        if (jobs.has(opts.jobId)) throw new Error('JobId already exists');
        const job = { id: opts.jobId, data, state: 'waiting', async getState() { return this.state; }, async remove() { jobs.delete(this.id); } };
        jobs.set(opts.jobId, job);
        return job;
      },
    };
    const queues = await vi.importActual('../src/jobs/queues.js');
    const first = await queues.enqueueMergeHrisSync(
      { tenantId: String(tenant._id), connectionId: String(conn._id), reason: 'manual' },
      { queue, ensureReady: async () => true },
    );
    const second = await queues.enqueueMergeHrisSync(
      { tenantId: String(tenant._id), connectionId: String(conn._id), reason: 'webhook' },
      { queue, ensureReady: async () => true },
    );
    expect(first.queued).toBe(true);
    expect(second.alreadyQueuedOrRunning).toBe(true);
    expect(jobs.size).toBe(1);

    await acquireMergeSyncLock({ tenantId: tenant._id, connectionId: conn._id });
    mockDirectory();
    await expect(syncMergeConnection({ tenantId: tenant._id, connectionId: conn._id })).rejects.toMatchObject({
      code: 'MERGE_SYNC_IN_PROGRESS',
    });
  });

  it('17-19. schedule registration is one scheduler, and the sweep pages connections', async () => {
    const schedulers = new Map();
    const queue = {
      async upsertJobScheduler(id, repeat, template) {
        schedulers.set(id, { repeat, template });
      },
      async getRepeatableJobs() {
        return [{ name: MERGE_SCHEDULE_JOB_NAME, key: 'legacy-schedule' }];
      },
      async removeRepeatableByKey(key) {
        schedulers.set(`removed:${key}`, true);
      },
    };
    await registerMergeHrisSyncSchedule(queue);
    await registerMergeHrisSyncSchedule(queue);
    expect([...schedulers.keys()].filter((key) => key === MERGE_SCHEDULE_JOB_ID)).toHaveLength(1);
    expect(schedulers.get(MERGE_SCHEDULE_JOB_ID).repeat.every).toBe(MERGE_SCHEDULE_EVERY_MS);
    expect(schedulers.get('removed:legacy-schedule')).toBe(true);

    await seed({ mergeLinkedAccountId: 'linked-1', lastSyncAt: new Date() });
    await seed({ provider: 'bamboohr', mergeLinkedAccountId: 'linked-2', lastSyncAt: new Date() });
    const reasons = [];
    const queued = await enqueueScheduledMergeHrisSyncs({
      pageSize: 1,
      enqueue: async (input) => {
        reasons.push(input.reason);
        return { queued: true };
      },
    });
    expect(queued).toHaveLength(2);
    expect(reasons).toEqual(['scheduled', 'scheduled']);
  });

  it('20-22. a retry keeps one running sync-run until the final attempt, and stale recovery skips a live job', async () => {
    const conn = await seed();
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/sync-status')) return mockJson(doneStatus());
      return mockJson({ detail: 'down' }, 500, { 'retry-after': '0' });
    });
    await expect(
      syncMergeConnection({
        tenantId: tenant._id,
        connectionId: conn._id,
        jobId: 'job-budget',
        attempt: 1,
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ code: 'MERGE_UPSTREAM_ERROR' });
    const open = await MergeSyncRun.findOne({ tenantId: tenant._id, jobId: 'job-budget' });
    expect(open.status).toBe('running');
    await expect(
      syncMergeConnection({
        tenantId: tenant._id,
        connectionId: conn._id,
        jobId: 'job-budget',
        attempt: 3,
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ code: 'MERGE_UPSTREAM_ERROR' });
    const runs = await MergeSyncRun.find({ tenantId: tenant._id, jobId: 'job-budget' });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('failed');
    expect(String(runs[0]._id)).toBe(String(open._id));

    const live = await seed({
      provider: 'ukg-pro',
      mergeLinkedAccountId: 'linked-live',
      lastSyncStatus: 'syncing',
      syncLockUntil: new Date(Date.now() + 60_000),
      syncLockToken: 'held',
    });
    const recovered = await recoverStaleMergeSyncs({
      queue: { async getJob() { return { async getState() { return 'active'; } }; } },
      now: new Date(),
    });
    expect(recovered).toBe(0);
    expect((await MergeConnection.findOne({ _id: live._id, tenantId: tenant._id })).lastSyncStatus).toBe('syncing');
  });

  it('23-26. another tenant cannot read, sync, or disconnect, and a bad signature is rejected', async () => {
    const conn = await seed();
    const syncRes = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${otherToken}`);
    const runsRes = await request(app)
      .get(`/api/integrations/merge/connections/${conn._id}/sync-runs`)
      .set('Authorization', `Bearer ${otherToken}`);
    const disconnectRes = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/disconnect`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(syncRes.status).toBe(404);
    expect(runsRes.status).toBe(404);
    expect(disconnectRes.status).toBe(404);
    expect(JSON.stringify(runsRes.body)).not.toContain(TOKEN);

    const raw = JSON.stringify({ hook: { event: 'Employee.changed' }, linked_account: { id: 'linked-current' } });
    await expect(handleMergeWebhook(Buffer.from(raw), 'short')).rejects.toMatchObject({
      code: 'MERGE_WEBHOOK_SIGNATURE_INVALID',
    });
    expect(verifyMergeWebhookSignature(Buffer.from(raw), sign(raw), SECRET)).toBe(true);
    expect(verifyMergeWebhookSignature(Buffer.from(raw), '%%%', SECRET)).toBe(false);
  });

  it('28-29. config validation names missing keys and uses one Merge environment', () => {
    const secret = 'super-secret-webhook-value';
    expect(() => validateMergeEnvironment({
      MERGE_API_KEY: 'present-key',
      MERGE_WEBHOOK_SECRET: '',
      TOKEN_ENCRYPTION_KEY: '',
    })).toThrow(/MERGE_WEBHOOK_SECRET/);
    try {
      validateMergeEnvironment({ MERGE_API_KEY: 'present-key', MERGE_WEBHOOK_SECRET: secret, TOKEN_ENCRYPTION_KEY: '' });
    } catch (err) {
      expect(err.message).not.toContain(secret);
      expect(err.message).not.toContain('present-key');
    }
    expect(validateMergeEnvironment({ MERGE_API_KEY: '' })).toEqual({ enabled: false });
    expect(validateMergeEnvironment({
      NODE_ENV: 'development',
      MERGE_API_KEY: 'present-key',
      MERGE_WEBHOOK_SECRET: '',
      TOKEN_ENCRYPTION_KEY: 'abc',
    })).toMatchObject({ enabled: true, missing: ['MERGE_WEBHOOK_SECRET'] });
    expect(() => validateMergeEnvironment({
      NODE_ENV: 'production',
      MERGE_API_KEY: 'present-key',
      MERGE_WEBHOOK_SECRET: '',
      TOKEN_ENCRYPTION_KEY: 'abc',
    })).toThrow(/MERGE_WEBHOOK_SECRET/);
    expect(MERGE_API_BASE).toBe('https://api.merge.dev/api');
    expect(validateMergeEnvironment({
      MERGE_API_KEY: 'present-key',
      MERGE_WEBHOOK_SECRET: secret,
      TOKEN_ENCRYPTION_KEY: 'abc',
    }).environment).toBe('deployment');
  });
});
