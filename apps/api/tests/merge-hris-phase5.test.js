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
import { MergeHrisEmployment } from '../src/modules/integrations/merge/models/mergeHrisEmployment.model.js';
import { MergeHrisDepartment } from '../src/modules/integrations/merge/models/mergeHrisDepartment.model.js';
import { MergeHrisLocation } from '../src/modules/integrations/merge/models/mergeHrisLocation.model.js';
import {
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_EMPLOYMENTS_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_ISSUES_URL,
  MERGE_HRIS_LOCATIONS_URL,
  MERGE_ACCOUNT_DETAILS_URL,
} from '../src/modules/integrations/merge/merge.constants.js';
import { syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';
import { reconcileMergeConnectionHealth } from '../src/modules/integrations/merge/merge.service.js';
import { recoverStaleMergeSyncs } from '../src/modules/integrations/merge/mergeSyncRun.service.js';
import { acquireMergeSyncLock } from '../src/modules/integrations/merge/mergeSyncLock.js';
import { enqueueScheduledMergeHrisSyncs } from '../src/modules/integrations/merge/mergeSchedule.js';
import { processMergeHrisSyncJob } from '../src/jobs/mergeHrisSync.worker.js';

const ACCOUNT_TOKEN = 'phase5-account-token-secret';
const EMPLOYEE_EMAIL = 'phase5.person@example.test';

const { jobs, fakeQueue } = vi.hoisted(() => {
  const jobs = new Map();
  const fakeQueue = {
    async getJob(id) {
      return jobs.get(id) || null;
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
let adminUser;
let adminToken;
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

function statusBody() {
  const row = (modelId, modelName) => ({
    model_id: modelId,
    model_name: modelName,
    status: 'DONE',
    last_sync_result: 'DONE',
    is_initial_sync: false,
    last_sync_start: '2024-06-01T00:00:00.000Z',
    last_sync_finished: '2024-06-01T00:05:00.000Z',
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

function employee(id, email = EMPLOYEE_EMAIL) {
  return {
    id,
    remote_id: id,
    first_name: 'Ada',
    last_name: 'Lovelace',
    display_full_name: 'Ada Lovelace',
    work_email: email,
    employment_status: 'ACTIVE',
  };
}

function page(results, next) {
  return mockJson({ results, next });
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'mergeConfigured').mockReturnValue(true);
  envModule.env.MERGE_API_KEY = 'test-merge-api-key';
  envModule.env.MERGE_WEBHOOK_SECRET = 'phase5-webhook-secret';
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
  tenant = await Tenant.create({ name: 'Phase5', slug: `phase5-${Date.now()}` });
  const user = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: `admin-${Date.now()}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: user._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  adminUser = user;
  adminToken = signAccessToken(user, assignment);
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

async function seedConnection(extra = {}) {
  return MergeConnection.create({
    tenantId: tenant._id,
    connectedByUserId: adminUser._id,
    provider: 'workday',
    category: 'hris',
    encryptedAccountToken: encryptToken(ACCOUNT_TOKEN),
    status: 'connected',
    connectedAt: new Date(),
    lastSyncStatus: 'idle',
    ...extra,
  });
}

/**
 * Two pages per model. Page 2 is served only after page 1 has been written.
 */
function mockTwoPages({ onEmployeePage2, employmentStatus = 200 } = {}) {
  const wrote = { group: false, location: false, employee: false, employment: false };
  fetchMock.mockImplementation(async (url) => {
    const href = String(url);
    if (href.includes('/hris/v1/sync-status')) return mockJson(statusBody());
    if (href.startsWith(MERGE_HRIS_GROUPS_URL)) {
      if (!href.includes('cursor=')) return page([{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }], 'g2');
      wrote.group = Boolean(await MergeHrisDepartment.findOne({ tenantId: tenant._id, mergeDepartmentId: 'dept-1' }));
      return page([{ id: 'dept-2', name: 'Design', type: 'DEPARTMENT' }], null);
    }
    if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
      if (!href.includes('cursor=')) return page([{ id: 'loc-1', name: 'HQ', city: 'Austin' }], 'l2');
      wrote.location = Boolean(await MergeHrisLocation.findOne({ tenantId: tenant._id, mergeLocationId: 'loc-1' }));
      return page([{ id: 'loc-2', name: 'Remote', city: 'Denver' }], null);
    }
    if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
      if (!href.includes('cursor=')) return page([employee('emp-1')], 'e2');
      wrote.employee = Boolean(await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' }));
      if (onEmployeePage2) await onEmployeePage2();
      return page([employee('emp-2', 'phase5.other@example.test')], null);
    }
    if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
      if (employmentStatus !== 200) return mockJson({ detail: 'down' }, employmentStatus);
      if (!href.includes('cursor=')) {
        return page([{ id: 'job-1', employee: 'emp-1', job_title: 'Engineer', effective_date: '2024-01-01T00:00:00Z' }], 'm2');
      }
      wrote.employment = Boolean(
        await MergeHrisEmployment.findOne({ tenantId: tenant._id, mergeEmploymentId: 'job-1' }),
      );
      return page([{ id: 'job-2', employee: 'emp-2', job_title: 'Designer', effective_date: '2024-02-01T00:00:00Z' }], null);
    }
    return mockJson({}, 404);
  });
  return wrote;
}

async function sync(connection, extra = {}) {
  return syncMergeConnection({
    tenantId: tenant._id,
    connectionId: connection._id,
    reason: 'manual',
    ...extra,
  });
}

describe('Phase 5 large-directory sync', () => {
  it('1-4. writes each model page before requesting the next page', async () => {
    const conn = await seedConnection();
    const wrote = mockTwoPages();
    const result = await sync(conn);
    expect(wrote).toEqual({ group: true, location: true, employee: true, employment: true });
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(2);
    expect(await MergeHrisDepartment.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(2);
    expect(await MergeHrisLocation.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(2);
    expect(await MergeHrisEmployment.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(2);
    expect(result.sync.employees.processed).toBe(2);
  });

  it('5-6. a failed page write does not advance the checkpoint', async () => {
    const conn = await seedConnection();
    mockTwoPages();
    const original = MergeHrisEmployee.bulkWrite.bind(MergeHrisEmployee);
    let calls = 0;
    const spy = vi.spyOn(MergeHrisEmployee, 'bulkWrite').mockImplementation(async (...args) => {
      calls += 1;
      if (calls >= 2) throw Object.assign(new Error('page write failed'), { code: 'PAGE_WRITE_FAILED' });
      return original(...args);
    });
    await expect(sync(conn, { jobId: 'job-write', attempt: 1 })).rejects.toMatchObject({
      code: 'PAGE_WRITE_FAILED',
    });
    spy.mockRestore();
    expect(await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).toBeTruthy();
    expect(await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-2' })).toBeNull();
    const run = await MergeSyncRun.findOne({ tenantId: tenant._id, connectionId: conn._id });
    expect(run.models.employee.pagesProcessed).toBe(1);
    expect(run.models.employee.recordsProcessed).toBe(1);
    expect(run.status).toBe('failed');
    expect(run.failedModel).toBe('employee');
    expect(run.toPublicJSON().models.employee.nextCursor).toBeUndefined();
  });

  it('7-8/11/13/19. a retry restarts from page 1 and upserts the same rows', async () => {
    const conn = await seedConnection();
    const urls = [];
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      urls.push(href);
      if (href.includes('/hris/v1/sync-status')) return mockJson(statusBody());
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) return page([{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }], null);
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) return page([{ id: 'loc-1', name: 'HQ' }], null);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        if (!href.includes('cursor=')) return page([employee('emp-1')], 'e2');
        return page([employee('emp-2', 'phase5.other@example.test')], null);
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
        return page([{ id: 'job-1', employee: 'emp-1', job_title: 'Engineer' }], null);
      }
      return mockJson({}, 404);
    });
    const original = MergeHrisEmployee.bulkWrite.bind(MergeHrisEmployee);
    let calls = 0;
    const spy = vi.spyOn(MergeHrisEmployee, 'bulkWrite').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('crash'), { code: 'PAGE_WRITE_FAILED' });
      return original(...args);
    });
    await expect(sync(conn, { jobId: 'job-retry', attempt: 1 })).rejects.toMatchObject({ code: 'PAGE_WRITE_FAILED' });
    spy.mockRestore();
    const failed = await MergeSyncRun.findOne({ tenantId: tenant._id, jobId: 'job-retry' });
    urls.length = 0;
    const second = await sync(conn, { jobId: 'job-retry', attempt: 2 });
    const again = await MergeSyncRun.findOne({ tenantId: tenant._id, jobId: 'job-retry' });
    expect(String(again._id)).toBe(String(failed._id));
    expect(again.workerAttempt).toBe(2);
    expect(again.retryCount).toBe(1);
    expect(again.status).toBe('success');
    expect(JSON.stringify(again.toPublicJSON())).not.toContain('nextCursor');
    const retryEmployees = urls.filter((href) => href.startsWith(MERGE_HRIS_EMPLOYEES_URL));
    expect(retryEmployees[0]).not.toContain('cursor=');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(2);
    expect(second.sync.employees.created).toBe(1);
    expect(second.sync.employees.unchanged).toBe(1);
  });

  it('9. a full sync does not prune when pagination stops early', async () => {
    const conn = await seedConnection();
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      mergeEmployeeId: 'emp-old',
      workEmail: 'old@example.test',
      source: 'merge',
      provider: 'workday',
    });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/hris/v1/sync-status')) return mockJson(statusBody());
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) return page([], null);
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) return page([], null);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        if (!href.includes('cursor=')) return page([employee('emp-1')], 'e2');
        return mockJson({ next: 'e3' });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) return page([], null);
      return mockJson({}, 404);
    });
    const result = await sync(conn);
    expect(result.sync.employees.pruneSkippedReason).toBe('incomplete');
    expect(await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-old' })).toBeTruthy();
    expect(await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).toBeTruthy();
  });

  it('10. an incremental sync does not prune employees that were absent', async () => {
    const conn = await seedConnection({
      lastFullSyncAt: new Date(),
      lastSyncAt: new Date(),
      mergeSyncCursors: { employee: new Date('2026-05-01T00:00:00.000Z') },
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      mergeEmployeeId: 'emp-old',
      workEmail: 'old@example.test',
      source: 'merge',
      provider: 'workday',
    });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/hris/v1/sync-status')) return mockJson(statusBody());
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) return page([], null);
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) return page([], null);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        expect(href).toContain('modified_after=');
        return page([employee('emp-new', 'new@example.test')], null);
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) return page([], null);
      return mockJson({}, 404);
    });
    const result = await sync(conn, { reason: 'scheduled' });
    expect(result.sync.mode).toBe('incremental');
    expect(result.sync.employees.pruned || 0).toBe(0);
    expect(await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-old' })).toBeTruthy();
  });

  it('12/14/15/16. records metrics, the failed model, duration, and no secrets', async () => {
    const conn = await seedConnection();
    mockTwoPages();
    const ok = await sync(conn, { jobId: 'job-ok', attempt: 1 });
    const success = await MergeSyncRun.findOne({ tenantId: tenant._id, jobId: 'job-ok' });
    expect(success.status).toBe('success');
    expect(success.durationMs).toBeGreaterThanOrEqual(0);
    expect(success.models.employee.pagesProcessed).toBe(2);
    expect(success.models.employee.recordsProcessed).toBe(2);
    expect(success.models.group.pagesProcessed).toBe(2);
    expect(ok.sync.employees.processed).toBe(2);
    const publicRun = JSON.stringify(success.toPublicJSON());
    expect(publicRun).not.toContain(ACCOUNT_TOKEN);
    expect(publicRun).not.toContain(EMPLOYEE_EMAIL);
    expect(publicRun).not.toContain('test-merge-api-key');
    expect(publicRun).not.toContain('phase5-webhook-secret');
    expect(publicRun).not.toContain('Ada');

    const failing = await seedConnection({ provider: 'bamboohr' });
    mockTwoPages({ employmentStatus: 500 });
    await expect(sync(failing, { jobId: 'job-emp', attempt: 1 })).rejects.toBeTruthy();
    const failed = await MergeSyncRun.findOne({ tenantId: tenant._id, jobId: 'job-emp' });
    expect(failed.status).toBe('failed');
    expect(failed.failedModel).toBe('employment');
    expect(failed.errorCode).toBe('MERGE_UPSTREAM_ERROR');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: failing._id })).toBe(2);
    expect(JSON.stringify(failed.toPublicJSON())).not.toContain(ACCOUNT_TOKEN);
  });

  it('17. recovers a stale queued connection only when no job or lease is live', async () => {
    const stale = await seedConnection({
      lastSyncStatus: 'queued',
      lastSyncRequestedAt: new Date(Date.now() - 60 * 60 * 1000),
      syncLockUntil: new Date(Date.now() - 60 * 1000),
    });
    await MergeSyncRun.create({
      tenantId: tenant._id,
      connectionId: stale._id,
      jobId: `merge-hris-sync-${stale._id}`,
      reason: 'manual',
      status: 'running',
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      lastProgressAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const recovered = await recoverStaleMergeSyncs({ queue: fakeQueue, now: new Date() });
    expect(recovered).toBe(1);
    const row = await MergeConnection.findOne({ _id: stale._id, tenantId: tenant._id });
    expect(row.lastSyncStatus).toBe('failed');
    expect(row.lastError).toBe('MERGE_SYNC_STALE');
    const run = await MergeSyncRun.findOne({ tenantId: tenant._id, connectionId: stale._id });
    expect(run.status).toBe('stale');
  });

  it('18. does not mark a healthy long-running sync stale', async () => {
    const liveLock = await seedConnection({
      lastSyncStatus: 'syncing',
      lastSyncStartedAt: new Date(Date.now() - 60 * 60 * 1000),
      syncLockUntil: new Date(Date.now() + 60 * 1000),
      syncLockToken: 'live-token',
    });
    const freshProgress = await seedConnection({
      provider: 'bamboohr',
      lastSyncStatus: 'syncing',
      syncLockUntil: new Date(Date.now() - 1000),
    });
    await MergeSyncRun.create({
      tenantId: tenant._id,
      connectionId: freshProgress._id,
      reason: 'manual',
      status: 'running',
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      lastProgressAt: new Date(),
    });
    const activeJob = await seedConnection({
      provider: 'gusto',
      lastSyncStatus: 'syncing',
      lastSyncStartedAt: new Date(Date.now() - 60 * 60 * 1000),
      syncLockUntil: new Date(Date.now() - 1000),
    });
    jobs.set(`merge-hris-sync-${activeJob._id}`, {
      async getState() {
        return 'active';
      },
    });
    const recovered = await recoverStaleMergeSyncs({ queue: fakeQueue, now: new Date() });
    expect(recovered).toBe(0);
    for (const id of [liveLock._id, freshProgress._id, activeJob._id]) {
      const row = await MergeConnection.findOne({ _id: id, tenantId: tenant._id });
      expect(row.lastSyncStatus).toBe('syncing');
    }
  });

  it('20. counts rate-limit responses without storing upstream headers', async () => {
    const conn = await seedConnection();
    let limited = false;
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/hris/v1/sync-status')) return mockJson(statusBody());
      if (href.startsWith(MERGE_HRIS_GROUPS_URL) && !limited) {
        limited = true;
        return mockJson({ detail: 'slow down' }, 429, { 'retry-after': '0' });
      }
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) return page([{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }], null);
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) return page([], null);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) return page([employee('emp-1')], null);
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) return page([], null);
      return mockJson({}, 404);
    });
    await sync(conn, { jobId: 'job-rate', attempt: 1 });
    const run = await MergeSyncRun.findOne({ tenantId: tenant._id, jobId: 'job-rate' });
    expect(run.rateLimitCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(run.toPublicJSON())).not.toContain('retry-after');
  });

  it('21-22. one connection cannot import twice, and two connections can', async () => {
    const first = await seedConnection();
    const second = await seedConnection({ provider: 'bamboohr' });
    const held = await acquireMergeSyncLock({ tenantId: tenant._id, connectionId: first._id });
    expect(held).toBeTruthy();
    mockTwoPages();
    await expect(sync(first)).rejects.toMatchObject({ code: 'MERGE_SYNC_IN_PROGRESS' });
    const other = await sync(second);
    expect(other.sync.employees.processed).toBe(2);
  });

  it('23. a Redis outage does not import inside the API process', async () => {
    const conn = await seedConnection();
    const queues = await vi.importActual('../src/jobs/queues.js');
    await expect(
      queues.enqueueMergeHrisSync(
        { tenantId: String(tenant._id), connectionId: String(conn._id), reason: 'manual' },
        { ensureReady: async () => false, queue: fakeQueue },
      ),
    ).rejects.toMatchObject({ status: 503, code: 'MERGE_QUEUE_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
    const row = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(row.lastSyncStatus).not.toBe('syncing');
  });

  it('24. a connected HRIS row that has never synced is enqueued as initial', async () => {
    const fresh = await seedConnection();
    const seen = await seedConnection({
      provider: 'bamboohr',
      lastSyncAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    await processMergeHrisSyncJob({ name: 'schedule', data: {} });
    expect(jobs.get(`merge-hris-sync-${fresh._id}`).data.reason).toBe('initial');
    expect(jobs.get(`merge-hris-sync-${seen._id}`).data.reason).toBe('scheduled');
  });

  it('schedule enqueue failures do not mark a sync running', async () => {
    const conn = await seedConnection();
    await enqueueScheduledMergeHrisSyncs({
      enqueue: async () => {
        throw Object.assign(new Error('redis down'), { code: 'MERGE_QUEUE_UNAVAILABLE' });
      },
    });
    const row = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(row.lastSyncStatus).toBe('idle');
  });

  it('26. needs_attention stays put when the Issues API cannot be checked', async () => {
    const conn = await seedConnection({ status: 'needs_attention', lastError: 'MERGE_AUTH_FAILED' });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_ACCOUNT_DETAILS_URL)) {
        return mockJson({ id: 'linked', status: 'COMPLETE', integration: 'Workday' });
      }
      if (href.startsWith(MERGE_HRIS_ISSUES_URL)) return mockJson({ detail: 'unavailable' }, 503);
      return mockJson({}, 404);
    });
    const updated = await reconcileMergeConnectionHealth(conn, { requireIssues: true });
    expect(updated.status).toBe('needs_attention');
  });

  it('27. a disabled Employee scope marks the connection needs_attention', async () => {
    const conn = await seedConnection();
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/hris/v1/sync-status')) return mockJson(statusBody());
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) return page([], null);
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) return page([], null);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({ detail: 'Required scope is disabled for this linked account' }, 403);
      }
      return mockJson({}, 404);
    });
    await expect(sync(conn)).rejects.toMatchObject({ code: 'MERGE_SCOPES_DISABLED' });
    const row = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(row.status).toBe('needs_attention');
    expect(row.lastError).toBe('MERGE_SCOPES_DISABLED');
  });

  it('28. the sync status API returns operational fields only', async () => {
    const conn = await seedConnection();
    mockTwoPages();
    await sync(conn, { jobId: 'job-status', attempt: 1 });
    const res = await request(app)
      .get(`/api/integrations/merge/connections/${conn._id}/sync-runs`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.connectionId).toBe(String(conn._id));
    expect(res.body.lastSyncStatus).toBe('success');
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0].models.employee.pagesProcessed).toBe(2);
    expect(res.body.activeRun).toBeNull();
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain(ACCOUNT_TOKEN);
    expect(blob).not.toContain(EMPLOYEE_EMAIL);
    expect(blob).not.toContain('test-merge-api-key');
    expect(blob).not.toContain('phase5-webhook-secret');
    expect(blob).not.toContain('Ada');
    expect(blob).not.toContain('encryptedAccountToken');
  });
});
