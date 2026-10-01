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
import { encryptToken } from '../src/utils/tokenEncryption.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import {
  MERGE_ACCOUNT_DETAILS_URL,
  MERGE_FULL_RECONCILE_MS,
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_INCREMENTAL_OVERLAP_MS,
  MERGE_SCHEDULE_EVERY_MS,
} from '../src/modules/integrations/merge/merge.constants.js';
import { syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';
import {
  enqueueScheduledMergeHrisSyncs,
  registerMergeHrisSyncSchedule,
} from '../src/modules/integrations/merge/mergeSchedule.js';
import { processMergeHrisSyncJob } from '../src/jobs/mergeHrisSync.worker.js';

const ACCOUNT_TOKEN = 'phase3-account-token-secret';
const WEBHOOK_SECRET = 'phase3-webhook-secret';

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
let fetchMock;

function signBody(raw) {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(raw)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Fixtures follow Merge's published webhook guide:
 * https://docs.merge.dev/merge-unified/reading-data/webhooks/merge-webhooks
 * hook.event is PascalCase. Common-model sync data uses model_id `hris.Employee`.
 * Changed and removed data is the common-model object, including remote_was_deleted.
 */
function documentedMergeWebhook(event, linkedAccountId, extra = {}) {
  const category = extra.linked?.category || 'hris';
  const payload = {
    hook: {
      id: 'e8affe31-8ae0-4b37-8c50-d86303094dc4',
      event,
      target: 'https://webhook.site/105606a8-cfa3-4415-bae0-954e25137f00',
    },
    linked_account: {
      id: linkedAccountId,
      integration: 'BambooHR',
      integration_slug: 'bamboohr',
      category,
      end_user_origin_id: '12345678910',
      end_user_organization_name: 'Example Organization',
      end_user_email_address: 'fixture.enduser@example.test',
      status: 'COMPLETE',
      webhook_listener_url: 'https://api.merge.dev/api/integrations/webhook-listener/abcd1234defg5678',
      is_duplicate: false,
      account_type: 'PRODUCTION',
      ...(extra.linked || {}),
    },
    data: documentedWebhookData(event, extra.data),
  };
  return JSON.stringify(payload);
}

function documentedWebhookData(event, overrides = {}) {
  if (event === 'LinkedAccount.sync_completed') {
    return {
      is_initial_sync: false,
      integration_name: 'BambooHR',
      integration_id: 'bamboohr',
      sync_status: {
        'hris.Employee': {
          last_sync_finished: '2023-12-29T18:53:09Z',
          last_sync_result: 'DONE',
          data_fresh_as_of: '2023-12-29T18:30:00Z',
          sync_status_reason: null,
        },
        'hris.Employment': {
          last_sync_finished: '2023-12-29T18:54:09Z',
          last_sync_result: 'DONE',
          data_fresh_as_of: '2023-12-29T18:31:00Z',
          sync_status_reason: null,
        },
        'hris.Group': {
          last_sync_finished: '2023-12-29T18:55:09Z',
          last_sync_result: 'DONE',
          data_fresh_as_of: '2023-12-29T18:32:00Z',
          sync_status_reason: null,
        },
        'hris.Location': {
          last_sync_finished: '2023-12-29T18:56:09Z',
          last_sync_result: 'PARTIALLY_SYNCED',
          data_fresh_as_of: '2023-12-29T18:33:00Z',
          sync_status_reason: null,
        },
      },
      ...overrides,
    };
  }
  if (event.endsWith('.synced')) {
    const model = event.slice(0, event.lastIndexOf('.'));
    return {
      integration_name: 'BambooHR',
      integration_id: 'bamboohr',
      synced_fields: ['first_name', 'last_name'],
      sync_status: {
        model_name: model,
        model_id: `hris.${model}`,
        last_sync_start: '2023-09-27T20:50:47.490402Z',
        next_sync_start: '2023-09-28T20:50:47.490402Z',
        status: 'DONE',
        last_sync_result: 'DONE',
        last_sync_finished: '2023-09-27T20:53:47.490402Z',
        data_fresh_as_of: '2023-09-27T20:50:47.490402Z',
        sync_status_reason: null,
        is_initial_sync: false,
      },
      ...overrides,
    };
  }
  if (event === 'LinkedAccount.linked') {
    return { account_token: ACCOUNT_TOKEN, is_relink: false, ...overrides };
  }
  if (event === 'Issue.new') {
    return {
      id: 'issue-1',
      status: 'ONGOING',
      error_description: 'Bad API Key',
      error_details: [],
      ...overrides,
    };
  }
  if (event.endsWith('.removed')) {
    return {
      id: '7f00a6cb-e85e-44b2-b804-15c8743ab19c',
      remote_id: 'remote-removed',
      first_name: 'Fixture',
      last_name: 'Removed',
      work_email: 'fixture.removed@example.test',
      remote_was_deleted: true,
      modified_at: '2023-09-22T20:20:06.709059Z',
      ...overrides,
    };
  }
  return {
    id: '22582af6-b45e-4d34-bed6-77bb40effa97',
    remote_id: '97134123',
    first_name: 'Fixture',
    last_name: 'Changed',
    work_email: 'fixture.changed@example.test',
    remote_was_deleted: false,
    modified_at: '2023-09-22T20:20:06.709059Z',
    tenantId: 'do-not-trust',
    ...overrides,
  };
}

function webhookRaw(event, linkedAccountId, extra = {}) {
  return documentedMergeWebhook(event, linkedAccountId, extra);
}

function mockJson(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => data,
  };
}

function doneStatus() {
  const row = (modelId, modelName, status = 'DONE') => ({
    model_id: modelId,
    model_name: modelName,
    status,
    last_sync_result: status,
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

function employeeRow(id = 'emp-1', email = 'ada@phase3.test') {
  return {
    id,
    first_name: 'Ada',
    last_name: 'Lovelace',
    work_email: email,
    employment_status: 'ACTIVE',
  };
}

function mockPages({ statusBody = doneStatus(), employees = [employeeRow()], onEmployees } = {}) {
  fetchMock.mockImplementation(async (url) => {
    const href = String(url);
    if (href.includes('/hris/v1/sync-status')) return mockJson(statusBody);
    if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
      if (onEmployees) await onEmployees();
      return mockJson({ next: null, results: employees });
    }
    return mockJson({ next: null, results: [] });
  });
}

function employeeRequestUrl() {
  const call = fetchMock.mock.calls.find((entry) => String(entry[0]).startsWith(MERGE_HRIS_EMPLOYEES_URL));
  return call ? String(call[0]) : '';
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

async function seedConnection(overrides = {}) {
  return MergeConnection.create({
    tenantId: tenant._id,
    connectedByUserId: admin._id,
    provider: 'deel',
    category: 'hris',
    encryptedAccountToken: encryptToken(ACCOUNT_TOKEN),
    mergeLinkedAccountId: `linked-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  tenant = await Tenant.create({ name: 'Phase3', slug: `phase3-${Date.now()}` });
  await makeAdmin();
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('Merge webhooks', () => {
  async function postWebhook(raw, signature = signBody(raw)) {
    return request(app)
      .post('/api/integrations/merge/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Merge-Webhook-Signature', signature)
      .send(raw);
  }

  it('1. a valid HRIS webhook enqueues a background sync', async () => {
    const conn = await seedConnection();
    const raw = webhookRaw('Employee.changed', conn.mergeLinkedAccountId);
    const res = await postWebhook(raw);
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const job = jobs.get(`merge-hris-sync-${conn._id}`);
    expect(job.data).toEqual({
      tenantId: String(tenant._id),
      connectionId: String(conn._id),
      requestedByUserId: null,
      reason: 'webhook',
    });
  });

  it('2. an invalid signature is rejected', async () => {
    const conn = await seedConnection();
    const raw = webhookRaw('Employee.changed', conn.mergeLinkedAccountId);
    const res = await postWebhook(raw, 'not-a-valid-signature');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('MERGE_WEBHOOK_SIGNATURE_INVALID');
    expect(jobs.size).toBe(0);
  });

  it('3. a duplicate webhook does not enqueue a second job', async () => {
    const conn = await seedConnection();
    const raw = webhookRaw('LinkedAccount.sync_completed', conn.mergeLinkedAccountId);
    const first = await postWebhook(raw);
    const second = await postWebhook(raw);
    expect(first.body.queued).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.queued).toBe(false);
    expect(second.body.alreadyQueuedOrRunning).toBe(true);
    expect(jobs.size).toBe(1);
  });

  it('4. an irrelevant event is acknowledged and not queued', async () => {
    const conn = await seedConnection();
    const raw = webhookRaw('AsyncPassthrough.resolved', conn.mergeLinkedAccountId);
    const res = await postWebhook(raw);
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe(true);
    expect(res.body.queued).toBe(false);
    expect(jobs.size).toBe(0);

    const ats = webhookRaw('Candidate.changed', conn.mergeLinkedAccountId, {
      linked: { category: 'ats', integration: 'Ashby', integration_slug: 'ashby' },
    });
    const atsRes = await postWebhook(ats);
    expect(atsRes.body.ignored).toBe(true);
    expect(jobs.size).toBe(0);
  });

  it('accepts documented HRIS event strings and ignores unrelated documented events', async () => {
    const conn = await seedConnection();
    const enqueue = [
      'LinkedAccount.sync_completed',
      'Employee.added',
      'Employee.changed',
      'Employee.removed',
      'Employee.synced',
      'Employment.changed',
      'Group.synced',
      'Location.added',
      'employee.added',
    ];
    for (const event of enqueue) {
      jobs.clear();
      const res = await postWebhook(webhookRaw(event, conn.mergeLinkedAccountId));
      expect(res.status, event).toBe(200);
      expect(res.body.ignored, event).toBe(false);
      expect(res.body.queued || res.body.alreadyQueuedOrRunning, event).toBe(true);
    }

    jobs.clear();
    const ignore = [
      'Candidate.synced',
      'Candidate.removed',
      'AsyncPassthrough.resolved',
      'AsyncPost.completed',
    ];
    for (const event of ignore) {
      const res = await postWebhook(webhookRaw(event, conn.mergeLinkedAccountId));
      expect(res.status, event).toBe(200);
      expect(res.body.ignored, event).toBe(true);
      expect(res.body.queued, event).toBe(false);
    }
    expect(jobs.size).toBe(0);
  });

  it('20. tokens stay out of webhook logs, payloads, and responses', async () => {
    const lines = [];
    const record = (obj) => lines.push(JSON.stringify(obj));
    const info = vi.spyOn(logger, 'info').mockImplementation(record);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(record);
    const error = vi.spyOn(logger, 'error').mockImplementation(record);
    try {
      const conn = await seedConnection();
      const raw = webhookRaw('Employee.synced', conn.mergeLinkedAccountId, {
        data: { account_token: ACCOUNT_TOKEN },
      });
      const linked = webhookRaw('LinkedAccount.linked', conn.mergeLinkedAccountId);
      const linkedRes = await postWebhook(linked);
      expect(linkedRes.status).toBe(200);
      const changed = await postWebhook(webhookRaw('Employee.changed', conn.mergeLinkedAccountId));
      expect(changed.body.queued || changed.body.alreadyQueuedOrRunning).toBe(true);
      const res = await postWebhook(raw);
      const job = jobs.get(`merge-hris-sync-${conn._id}`);
      const blob = JSON.stringify({ body: res.body, data: job.data, lines });
      expect(blob).not.toContain(ACCOUNT_TOKEN);
      expect(blob).not.toContain(WEBHOOK_SECRET);
      expect(blob).not.toContain('test-merge-api-key');
      expect(blob).not.toContain('fixture.enduser@example.test');
      expect(blob).not.toContain('fixture.changed@example.test');
    } finally {
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe('scheduled Merge sync', () => {
  it('registers a 6 hour repeat on the existing queue', async () => {
    const added = [];
    await registerMergeHrisSyncSchedule({
      async add(name, data, opts) {
        added.push({ name, data, opts });
      },
    });
    expect(added).toHaveLength(1);
    expect(added[0].name).toBe('schedule');
    expect(added[0].data).toEqual({});
    expect(added[0].opts.repeat.every).toBe(MERGE_SCHEDULE_EVERY_MS);
    expect(MERGE_SCHEDULE_EVERY_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('5/6. enqueues connected HRIS accounts and skips the rest', async () => {
    const ready = await seedConnection({
      mergeLinkedAccountId: 'linked-ready',
      lastSyncAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    await seedConnection({
      provider: 'bamboohr',
      status: 'disconnected',
      encryptedAccountToken: '',
      mergeLinkedAccountId: 'linked-gone',
    });
    await seedConnection({
      provider: 'hibob',
      status: 'connected',
      encryptedAccountToken: '',
      mergeLinkedAccountId: 'linked-notoken',
    });
    await seedConnection({
      provider: 'google-workspace',
      category: 'directory',
      mergeLinkedAccountId: 'linked-directory',
    });
    const recovered = await seedConnection({
      provider: 'gusto',
      status: 'needs_attention',
      encryptedAccountToken: encryptToken('recover-token'),
      mergeLinkedAccountId: 'linked-recover',
    });
    const stillBroken = await seedConnection({
      provider: 'ukg-pro',
      status: 'needs_attention',
      encryptedAccountToken: encryptToken('broken-token'),
      mergeLinkedAccountId: 'linked-broken',
    });

    fetchMock.mockImplementation(async (url, init) => {
      if (!String(url).startsWith(MERGE_ACCOUNT_DETAILS_URL)) return mockJson({});
      const accountToken = init?.headers?.['X-Account-Token'];
      return mockJson({ status: accountToken === 'recover-token' ? 'COMPLETE' : 'RELINK_NEEDED' });
    });

    await processMergeHrisSyncJob({ name: 'schedule', data: {}, id: 'merge-hris-schedule' });

    expect(jobs.has(`merge-hris-sync-${ready._id}`)).toBe(true);
    expect(jobs.get(`merge-hris-sync-${ready._id}`).data.reason).toBe('scheduled');
    expect(jobs.has(`merge-hris-sync-${recovered._id}`)).toBe(true);
    expect(jobs.has(`merge-hris-sync-${stillBroken._id}`)).toBe(false);
    expect(jobs.size).toBe(2);
    const broken = await MergeConnection.findOne({ _id: stillBroken._id, tenantId: tenant._id });
    expect(broken.status).toBe('needs_attention');
  });
});

describe('incremental Merge import', () => {
  const cursor = new Date('2026-05-01T12:00:00.000Z');
  const recentFull = new Date('2026-05-01T00:00:00.000Z');

  async function runSync(conn, reason, now) {
    mockPages();
    return syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
      reason,
      now,
    });
  }

  it('7/10. uses the stored watermark minus the overlap', async () => {
    const conn = await seedConnection({
      lastFullSyncAt: recentFull,
      mergeSyncCursors: { employee: cursor, employment: cursor, group: cursor, location: cursor },
    });
    await runSync(conn, 'scheduled', new Date('2026-05-01T18:00:00.000Z'));
    const modifiedAfter = new URL(employeeRequestUrl()).searchParams.get('modified_after');
    expect(modifiedAfter).toBe(new Date(cursor.getTime() - MERGE_INCREMENTAL_OVERLAP_MS).toISOString());
    expect(MERGE_INCREMENTAL_OVERLAP_MS).toBe(5 * 60 * 1000);
  });

  it('8/9. manual and initial syncs stay full', async () => {
    const conn = await seedConnection({
      lastFullSyncAt: recentFull,
      mergeSyncCursors: { employee: cursor },
    });
    await runSync(conn, 'manual', new Date('2026-05-01T18:00:00.000Z'));
    expect(new URL(employeeRequestUrl()).searchParams.get('modified_after')).toBeNull();

    fetchMock.mockReset();
    mockPages();
    await syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
      reason: 'initial',
      now: new Date('2026-05-01T19:00:00.000Z'),
    });
    expect(new URL(employeeRequestUrl()).searchParams.get('modified_after')).toBeNull();
  });

  it('11. advances the watermark only after the model import completes', async () => {
    const now = new Date('2026-05-01T18:00:00.000Z');
    const conn = await seedConnection({
      lastFullSyncAt: recentFull,
      mergeSyncCursors: { employee: cursor },
    });
    const result = await runSync(conn, 'scheduled', now);
    expect(result.sync.mode).toBe('incremental');
    expect(result.sync.reason).toBe('scheduled');
    expect(result.sync.models.employees.mode).toBe('incremental');
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.mergeSyncCursors.employee.toISOString()).toBe(now.toISOString());
    expect(stored.lastFullSyncAt.toISOString()).toBe(recentFull.toISOString());
  });

  it('12/18. a failed model keeps the previous watermark', async () => {
    const conn = await seedConnection({
      lastFullSyncAt: recentFull,
      mergeSyncCursors: { employee: cursor },
    });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/hris/v1/sync-status')) return mockJson(doneStatus());
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) return mockJson({}, 500, { 'retry-after': '0' });
      return mockJson({ next: null, results: [] });
    });
    await expect(
      processMergeHrisSyncJob({
        id: `merge-hris-sync-${conn._id}`,
        name: 'sync',
        data: {
          tenantId: String(tenant._id),
          connectionId: String(conn._id),
          requestedByUserId: null,
          reason: 'scheduled',
        },
        opts: { attempts: 3 },
        attemptsMade: 1,
        updateProgress: async () => {},
      }),
    ).rejects.toMatchObject({ code: 'MERGE_UPSTREAM_ERROR' });
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.mergeSyncCursors.employee.toISOString()).toBe(cursor.toISOString());
    expect(stored.lastFullSyncAt.toISOString()).toBe(recentFull.toISOString());
    expect(stored.lastError).toBe('MERGE_UPSTREAM_ERROR');
  });

  it('13. the next window still includes records modified during the previous run', async () => {
    const conn = await seedConnection({
      lastFullSyncAt: recentFull,
      mergeSyncCursors: { employee: cursor, employment: cursor, group: cursor, location: cursor },
    });
    const firstNow = new Date(cursor.getTime() + 10 * 60 * 1000);
    await runSync(conn, 'webhook', firstNow);
    const changedDuringRun = new Date(firstNow.getTime() + 60 * 1000);
    fetchMock.mockReset();
    mockPages();
    const secondNow = new Date(firstNow.getTime() + 10 * 60 * 1000);
    await syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
      reason: 'webhook',
      now: secondNow,
    });
    const modifiedAfter = new Date(new URL(employeeRequestUrl()).searchParams.get('modified_after'));
    expect(modifiedAfter.getTime()).toBe(firstNow.getTime() - MERGE_INCREMENTAL_OVERLAP_MS);
    expect(modifiedAfter.getTime()).toBeLessThanOrEqual(changedDuringRun.getTime());
  });

  it('14. an incremental response does not prune employees that were absent', async () => {
    const conn = await seedConnection({
      lastFullSyncAt: recentFull,
      mergeSyncCursors: { employee: cursor },
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-keep',
      displayName: 'Kept',
      workEmail: 'keep@phase3.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Kept',
      email: 'keep@phase3.test',
      source: 'hris',
      mergeEmployeeId: 'emp-keep',
      mergeConnectionId: conn._id,
      hrisLinkStatus: 'current',
    });
    mockPages({ employees: [employeeRow('emp-1', 'ada@phase3.test')] });
    await syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
      reason: 'scheduled',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'keep@phase3.test' });
    expect(contact.hrisLinkStatus).toBe('current');
  });

  it('15/16/17. full reconciliation follows the 24 hour rule and Phase 1 prune gates', async () => {
    const staleFull = new Date('2026-01-01T00:00:00.000Z');
    const due = new Date(staleFull.getTime() + MERGE_FULL_RECONCILE_MS + 1000);
    const dueConn = await seedConnection({
      lastFullSyncAt: staleFull,
      mergeSyncCursors: { employee: staleFull },
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: dueConn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-stale',
      displayName: 'Stale',
      workEmail: 'stale@phase3.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    await runSync(dueConn, 'scheduled', due);
    expect(new URL(employeeRequestUrl()).searchParams.get('modified_after')).toBeNull();
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-stale' })).toBe(0);
    const afterDue = await MergeConnection.findOne({ _id: dueConn._id, tenantId: tenant._id });
    expect(afterDue.lastFullSyncAt.toISOString()).toBe(due.toISOString());

    const recentConn = await seedConnection({
      provider: 'bamboohr',
      lastFullSyncAt: new Date(due.getTime() - 60 * 60 * 1000),
      mergeSyncCursors: { employee: cursor },
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: recentConn._id,
      provider: 'bamboohr',
      mergeEmployeeId: 'emp-recent',
      displayName: 'Recent',
      workEmail: 'recent@phase3.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    fetchMock.mockReset();
    await runSync(recentConn, 'scheduled', due);
    expect(new URL(employeeRequestUrl()).searchParams.get('modified_after')).toBeTruthy();
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-recent' })).toBe(1);
    const afterRecent = await MergeConnection.findOne({ _id: recentConn._id, tenantId: tenant._id });
    expect(afterRecent.lastFullSyncAt.toISOString()).not.toBe(due.toISOString());

    const syncingConn = await seedConnection({
      provider: 'hibob',
      lastFullSyncAt: staleFull,
      mergeSyncCursors: { employee: staleFull },
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: syncingConn._id,
      provider: 'hibob',
      mergeEmployeeId: 'emp-syncing',
      displayName: 'Syncing',
      workEmail: 'syncing@phase3.test',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    fetchMock.mockReset();
    mockPages({
      statusBody: {
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
      },
      employees: [],
    });
    await syncMergeConnection({
      tenantId: tenant._id,
      connectionId: syncingConn._id,
      reason: 'scheduled',
      now: due,
    });
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-syncing' })).toBe(1);
    const afterSyncing = await MergeConnection.findOne({ _id: syncingConn._id, tenantId: tenant._id });
    expect(afterSyncing.lastFullSyncAt.toISOString()).toBe(staleFull.toISOString());
  });

  it('19. disconnect during sync does not advance watermarks or lastFullSyncAt', async () => {
    const conn = await seedConnection({
      lastFullSyncAt: recentFull,
      mergeSyncCursors: { employee: cursor, group: cursor },
    });
    mockPages({
      onEmployees: async () => {
        await MergeConnection.updateOne(
          { _id: conn._id, tenantId: tenant._id },
          { $set: { status: 'disconnected', encryptedAccountToken: '' } },
        );
      },
    });
    await expect(
      syncMergeConnection({
        tenantId: tenant._id,
        connectionId: conn._id,
        reason: 'scheduled',
        now: new Date('2026-05-01T18:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'MERGE_CONNECTION_INACTIVE' });
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.status).toBe('disconnected');
    expect(stored.mergeSyncCursors.employee.toISOString()).toBe(cursor.toISOString());
    expect(stored.mergeSyncCursors.group.toISOString()).toBe(cursor.toISOString());
    expect(stored.lastFullSyncAt.toISOString()).toBe(recentFull.toISOString());
  });
});

describe('scheduled sweep helper', () => {
  it('returns enqueue results for eligible connections', async () => {
    const conn = await seedConnection();
    const queued = await enqueueScheduledMergeHrisSyncs();
    expect(queued.map((row) => row.connectionId)).toEqual([String(conn._id)]);
    expect(queued[0].reason === 'scheduled' || queued[0].queued === true).toBe(true);
  });
});
