import { readFileSync } from 'node:fs';
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
import { encryptToken } from '../src/utils/tokenEncryption.js';
import { ApiError } from '../src/utils/errors.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import {
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_EMPLOYMENTS_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_LOCATIONS_URL,
} from '../src/modules/integrations/merge/merge.constants.js';
import { mergeRequest } from '../src/modules/integrations/merge/mergeHttp.js';
import { syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';
import {
  isMergeSyncJobRetryable,
  markMergeSyncJobFailed,
  processMergeHrisSyncJob,
} from '../src/jobs/mergeHrisSync.worker.js';

const ACCOUNT_TOKEN = 'phase2-account-token-secret';

const { jobs, fakeQueue } = vi.hoisted(() => {
  const jobs = new Map();
  const fakeQueue = {
    async getJob(id) {
      return jobs.get(id);
    },
    async add(_name, data, opts) {
      if (jobs.has(opts.jobId)) {
        throw new Error(`JobId ${opts.jobId} already exists`);
      }
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
        async updateProgress() {},
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
let otherTenant;
let admin;
let adminToken;
let managerToken;
let fetchMock;

function mockJson(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null;
      },
    },
    json: async () => data,
  };
}

function doneStatusBody() {
  const row = (modelId, modelName) => ({
    model_id: modelId,
    model_name: modelName,
    status: 'DONE',
    last_sync_result: 'DONE',
    is_initial_sync: false,
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

function isSyncStatus(url) {
  return String(url).includes('/hris/v1/sync-status');
}

function mockHappyMerge(employees = [employeeRow()]) {
  fetchMock.mockImplementation(async (url) => {
    const href = String(url);
    if (isSyncStatus(href)) return mockJson(doneStatusBody());
    if (href.startsWith(MERGE_HRIS_GROUPS_URL) || href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
      return mockJson({ next: null, results: [] });
    }
    if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
      return mockJson({ next: null, results: employees });
    }
    if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
      return mockJson({ next: null, results: [] });
    }
    return mockJson({ next: null, results: [] });
  });
}

function employeeRow(id = 'emp-1', email = 'ada@phase2.test') {
  return {
    id,
    remote_id: 'E1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    display_full_name: 'Ada Lovelace',
    work_email: email,
    employment_status: 'ACTIVE',
  };
}

function jobFor(conn) {
  const progress = [];
  const job = {
    id: `merge-hris-sync-${conn._id}`,
    data: {
      tenantId: String(tenant._id),
      connectionId: String(conn._id),
      requestedByUserId: String(admin._id),
      reason: 'manual',
    },
    opts: { attempts: 3 },
    attemptsMade: 1,
    updateProgress: async (value) => {
      const row = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
      progress.push({ value, status: row.lastSyncStatus });
    },
  };
  return { job, progress };
}

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

async function seedConnection(overrides = {}) {
  return MergeConnection.create({
    tenantId: tenant._id,
    connectedByUserId: admin._id,
    provider: 'deel',
    encryptedAccountToken: encryptToken(ACCOUNT_TOKEN),
    status: 'connected',
    connectedAt: new Date(),
    lastSyncStatus: 'idle',
    ...overrides,
  });
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'mergeConfigured').mockReturnValue(true);
  envModule.env.MERGE_API_KEY = 'test-merge-api-key';
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
  tenant = await Tenant.create({ name: 'Phase2', slug: `phase2-${Date.now()}` });
  otherTenant = await Tenant.create({ name: 'Other', slug: `phase2-other-${Date.now()}` });
  ({ user: admin, token: adminToken } = await makeUser('company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser('entity_manager', 'entity'));
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('POST /sync enqueues a Merge HRIS job', () => {
  it('A/B. returns 202 quickly and does not call Merge', async () => {
    const conn = await seedConnection();
    const started = Date.now();
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      success: true,
      queued: true,
      alreadyQueuedOrRunning: false,
      connectionId: String(conn._id),
      syncStatus: 'queued',
    });
    expect(res.body.jobId).toBe(`merge-hris-sync-${conn._id}`);
    expect(res.body.sync).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.lastSyncStatus).toBe('queued');
    expect(stored.lastSyncRequestedAt).toBeTruthy();
    expect(stored.lastError).toBeFalsy();

    const queued = jobs.get(`merge-hris-sync-${conn._id}`);
    expect(queued.data).toEqual({
      tenantId: String(tenant._id),
      connectionId: String(conn._id),
      requestedByUserId: String(admin._id),
      reason: 'manual',
    });
    expect(queued.opts.attempts).toBe(3);
    expect(queued.opts.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });

  it('C. a second Sync now does not enqueue another job', async () => {
    const conn = await seedConnection();
    const first = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(first.status).toBe(202);
    expect(first.body.queued).toBe(true);
    expect(second.status).toBe(202);
    expect(second.body.queued).toBe(false);
    expect(second.body.alreadyQueuedOrRunning).toBe(true);
    expect(second.body.syncStatus).toBe('queued');
    expect(jobs.size).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a disconnected connection before enqueueing', async () => {
    const conn = await seedConnection({ status: 'disconnected', encryptedAccountToken: '' });
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('MERGE_CONNECTION_INACTIVE');
    expect(jobs.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects another tenant connection', async () => {
    const conn = await seedConnection({ tenantId: otherTenant._id });
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(jobs.size).toBe(0);
  });

  it('rejects a manager', async () => {
    const conn = await seedConnection();
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
    expect(jobs.size).toBe(0);
  });

  it('does not run the import when the queue is unavailable', async () => {
    const actual = await vi.importActual('../src/jobs/queues.js');
    const conn = await seedConnection();
    await expect(
      actual.enqueueMergeHrisSync(
        {
          tenantId: String(tenant._id),
          connectionId: String(conn._id),
          reason: 'manual',
        },
        { ensureReady: async () => false, queue: fakeQueue },
      ),
    ).rejects.toMatchObject({ code: 'MERGE_QUEUE_UNAVAILABLE', status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jobs.size).toBe(0);
  });

  it('refuses a job payload that carries a credential', async () => {
    const actual = await vi.importActual('../src/jobs/queues.js');
    await expect(
      actual.enqueueMergeHrisSync(
        {
          tenantId: String(tenant._id),
          connectionId: String(new MergeConnection()._id),
          reason: 'manual',
          accountToken: ACCOUNT_TOKEN,
        },
        { ensureReady: async () => true, queue: fakeQueue },
      ),
    ).rejects.toMatchObject({ code: 'MERGE_SYNC_JOB_INVALID' });
    expect(jobs.size).toBe(0);
  });
});

describe('merge-hris-sync worker', () => {
  it('D/E. moves queued to syncing to success with stage progress', async () => {
    const conn = await seedConnection({ lastSyncStatus: 'queued' });
    mockHappyMerge();
    const { job, progress } = jobFor(conn);
    await processMergeHrisSyncJob(job);

    expect(progress.map((row) => row.value)).toEqual([10, 20, 30, 40, 50, 70, 85, 95, 100]);
    expect(progress.some((row) => row.status === 'syncing')).toBe(true);
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.lastSyncStatus).toBe('success');
    expect(stored.lastSyncAt).toBeTruthy();
    expect(stored.lastSyncStartedAt).toBeTruthy();
    expect(stored.lastSyncFinishedAt).toBeTruthy();
    expect(stored.syncLockToken).toBeFalsy();
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('F. failure moves the connection to failed', async () => {
    const conn = await seedConnection({ lastSyncStatus: 'queued' });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-keep',
      displayName: 'Ada',
      workEmail: 'keep@phase2.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    fetchMock.mockResolvedValue(mockJson({ detail: 'nope' }, 401));

    await expect(processMergeHrisSyncJob(jobFor(conn).job)).rejects.toMatchObject({
      code: 'MERGE_AUTH_FAILED',
    });

    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.lastSyncStatus).toBe('failed');
    expect(stored.lastError).toBe('MERGE_AUTH_FAILED');
    expect(stored.status).toBe('needs_attention');
    expect(stored.syncLockToken).toBeFalsy();
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('H. a disconnected queued connection does not call Merge', async () => {
    const conn = await seedConnection({
      status: 'disconnected',
      encryptedAccountToken: '',
      lastSyncStatus: 'queued',
    });
    await expect(processMergeHrisSyncJob(jobFor(conn).job)).rejects.toMatchObject({
      code: 'MERGE_CONNECTION_INACTIVE',
    });
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.status).toBe('disconnected');
    expect(stored.lastSyncStatus).toBe('failed');
    expect(stored.lastError).toBe('MERGE_CONNECTION_INACTIVE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops when the account token was cleared', async () => {
    const conn = await seedConnection({
      encryptedAccountToken: '',
      lastSyncStatus: 'queued',
    });
    await expect(processMergeHrisSyncJob(jobFor(conn).job)).rejects.toMatchObject({
      code: 'MERGE_TOKEN_MISSING',
    });
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.status).toBe('connected');
    expect(stored.lastSyncStatus).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('I. two attempts cannot import the same connection at once', async () => {
    const conn = await seedConnection();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let employeeCalls = 0;
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        employeeCalls += 1;
        if (employeeCalls === 1) await gate;
      }
      if (isSyncStatus(href)) return mockJson(doneStatusBody());
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({ next: null, results: [employeeRow()] });
      }
      return mockJson({ next: null, results: [] });
    });

    const first = syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
      reason: 'manual',
    });
    const deadline = Date.now() + 3000;
    let held = null;
    while (Date.now() < deadline) {
      held = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
      if (held?.syncLockToken) break;
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(held.syncLockToken).toBeTruthy();

    let secondError;
    try {
      await syncMergeConnection({
        tenantId: tenant._id,
        connectionId: conn._id,
        reason: 'manual',
      });
    } catch (err) {
      secondError = err;
    }
    expect(secondError?.code).toBe('MERGE_SYNC_IN_PROGRESS');

    release();
    const result = await first;
    expect(result.connection.lastSyncStatus).toBe('success');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('J. SYNCING plus an empty employee page does not prune', async () => {
    const conn = await seedConnection({ lastSyncStatus: 'queued' });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-keep',
      displayName: 'Ada Lovelace',
      workEmail: 'keep@phase2.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Ada Lovelace',
      email: 'keep@phase2.test',
      source: 'hris',
      mergeEmployeeId: 'emp-keep',
      mergeConnectionId: conn._id,
      hrisLinkStatus: 'current',
    });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (isSyncStatus(href)) {
        return mockJson({
          next: null,
          results: [
            {
              model_id: 'hris.Employee',
              model_name: 'Employee',
              status: 'SYNCING',
              last_sync_result: 'SYNCING',
              is_initial_sync: true,
            },
          ],
        });
      }
      return mockJson({ next: null, results: [] });
    });

    await processMergeHrisSyncJob(jobFor(conn).job);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'keep@phase2.test' });
    expect(contact.hrisLinkStatus).toBe('current');
  });

  it('K. a retried import does not duplicate employees or contacts', async () => {
    const conn = await seedConnection({ lastSyncStatus: 'queued' });
    mockHappyMerge();
    await processMergeHrisSyncJob(jobFor(conn).job);
    await processMergeHrisSyncJob(jobFor(conn).job);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).toBe(1);
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'ada@phase2.test' })).toBe(1);
  });

  it('clears a crashed syncing row so the status cannot stick', async () => {
    const conn = await seedConnection({
      lastSyncStatus: 'syncing',
      syncLockToken: 'dead-worker',
      syncLockUntil: new Date(Date.now() + 60_000),
    });
    await markMergeSyncJobFailed({
      tenantId: tenant._id,
      connectionId: conn._id,
      err: { code: 'SYNC_FAILED' },
    });
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.lastSyncStatus).toBe('failed');
    expect(stored.lastError).toBe('SYNC_FAILED');
    expect(stored.syncLockToken).toBeFalsy();
    expect(stored.syncLockUntil).toBeNull();
    expect(stored.status).toBe('connected');
  });

  it('a retry after an expired lease upserts the same employee', async () => {
    const conn = await seedConnection({
      lastSyncStatus: 'syncing',
      syncLockToken: 'dead-worker',
      syncLockUntil: new Date(Date.now() - 1000),
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-1',
      displayName: 'Ada Lovelace',
      workEmail: 'ada@phase2.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    mockHappyMerge();
    await processMergeHrisSyncJob(jobFor(conn).job);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).toBe(1);
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.lastSyncStatus).toBe('success');
  });
});

describe('Merge HTTP retries', () => {
  it('G. retries 429, 5xx, and network errors a bounded number of times', async () => {
    fetchMock.mockResolvedValue(mockJson({}, 429, { 'retry-after': '0' }));
    await expect(mergeRequest('https://api.merge.dev/api/hris/v1/employees')).rejects.toMatchObject({
      code: 'MERGE_RATE_LIMITED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(mockJson({}, 503, { 'retry-after': '0' }));
    await expect(mergeRequest('https://api.merge.dev/api/hris/v1/employees')).rejects.toMatchObject({
      code: 'MERGE_UPSTREAM_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(Object.assign(new Error('socket hang up'), { name: 'TypeError' }));
    await expect(mergeRequest('https://api.merge.dev/api/hris/v1/employees')).rejects.toMatchObject({
      code: 'MERGE_UNREACHABLE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(mockJson({ detail: 'bad' }, 401));
    await expect(mergeRequest('https://api.merge.dev/api/hris/v1/employees')).rejects.toMatchObject({
      code: 'MERGE_AUTH_FAILED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(isMergeSyncJobRetryable(new ApiError(502, 'limited', 'MERGE_RATE_LIMITED'))).toBe(true);
    expect(isMergeSyncJobRetryable(new ApiError(502, 'down', 'MERGE_UPSTREAM_ERROR'))).toBe(true);
    expect(isMergeSyncJobRetryable(new ApiError(502, 'down', 'MERGE_UNREACHABLE'))).toBe(true);
    expect(isMergeSyncJobRetryable(new ApiError(502, 'auth', 'MERGE_AUTH_FAILED'))).toBe(false);
    expect(isMergeSyncJobRetryable(new ApiError(400, 'gone', 'MERGE_CONNECTION_INACTIVE'))).toBe(false);
  });

  it('a 429 during import stays retryable for the job', async () => {
    const conn = await seedConnection({ lastSyncStatus: 'queued' });
    fetchMock.mockImplementation(async (url) => {
      if (isSyncStatus(String(url))) return mockJson(doneStatusBody());
      return mockJson({}, 429, { 'retry-after': '0' });
    });
    await expect(processMergeHrisSyncJob(jobFor(conn).job)).rejects.toMatchObject({
      code: 'MERGE_RATE_LIMITED',
      name: 'ApiError',
    });
    const groupCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).startsWith(MERGE_HRIS_GROUPS_URL),
    );
    expect(groupCalls).toHaveLength(3);
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.lastSyncStatus).toBe('syncing');
    expect(stored.lastError).toBe('MERGE_RATE_LIMITED');
  });
});

describe('secrets stay out of the queue, response, and logs', () => {
  it('L. does not put tokens in the job, response, or logs', async () => {
    const lines = [];
    const record = (obj) => {
      lines.push(JSON.stringify(obj));
    };
    const info = vi.spyOn(logger, 'info').mockImplementation(record);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(record);
    const error = vi.spyOn(logger, 'error').mockImplementation(record);
    try {
      const conn = await seedConnection();
      const res = await request(app)
        .post(`/api/integrations/merge/connections/${conn._id}/sync`)
        .set('Authorization', `Bearer ${adminToken}`);
      const job = jobs.get(`merge-hris-sync-${conn._id}`);
      const blob = JSON.stringify({ body: res.body, data: job.data, lines });
      expect(blob).not.toContain(ACCOUNT_TOKEN);
      expect(blob).not.toContain('test-merge-api-key');
      expect(blob).not.toContain('encryptedAccountToken');
      expect(Object.keys(job.data).sort()).toEqual([
        'connectionId',
        'reason',
        'requestedByUserId',
        'tenantId',
      ]);
    } finally {
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe('worker registration', () => {
  it('starts the Merge worker from the existing worker entrypoint', () => {
    const workerIndex = readFileSync(new URL('../src/jobs/index.js', import.meta.url), 'utf8');
    const pm2 = readFileSync(new URL('../../../ecosystem.config.js', import.meta.url), 'utf8');
    expect(workerIndex).toContain('startMergeHrisSyncWorker');
    expect(pm2).toContain('src/jobs/index.js');
  });
});
