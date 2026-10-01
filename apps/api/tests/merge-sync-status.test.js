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
import { MergeHrisEmployment } from '../src/modules/integrations/merge/models/mergeHrisEmployment.model.js';
import {
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_EMPLOYMENTS_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_LOCATIONS_URL,
  MERGE_HRIS_SYNC_STATUS_URL,
} from '../src/modules/integrations/merge/merge.constants.js';
import { getMergeSyncStatus, isMergeModelSnapshotAuthoritative } from '../src/modules/integrations/merge/mergeSyncStatus.js';
import { syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';

const ACCOUNT_TOKEN = 'phase1-account-token';

let app;
let tenant;
let adminToken;
let fetchMock;

function mockJson(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function statusRow(modelId, modelName, overrides = {}) {
  return {
    model_id: modelId,
    model_name: modelName,
    status: 'DONE',
    last_sync_result: 'DONE',
    is_initial_sync: false,
    last_sync_start: '2024-06-01T00:00:00.000Z',
    last_sync_finished: '2024-06-01T00:05:00.000Z',
    data_fresh_as_of: '2024-06-01T00:00:00.000Z',
    sync_status_reason: null,
    ...overrides,
  };
}

function syncStatusBody({ employee = {}, employment = {}, group = {}, location = {} } = {}) {
  return {
    next: null,
    results: [
      statusRow('hris.Employee', 'Employee', employee),
      statusRow('hris.Employment', 'Employment', employment),
      statusRow('hris.Group', 'Group', group),
      statusRow('hris.Location', 'Location', location),
      // Display name must not be treated as the Employee model.
      statusRow('hris.TimeOff', 'Employee', { status: 'DONE', last_sync_result: 'DONE' }),
    ],
  };
}

function employeeRow(id, email) {
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

/**
 * @param {object} options
 * @param {boolean} [options.statusFails]
 * @param {object} [options.statusBody]
 * @param {object[]} [options.employees]
 * @param {object[]|null} [options.employments]
 * @param {boolean} [options.truncateEmployees]
 */
function mockMerge({
  statusFails = false,
  statusBody = syncStatusBody(),
  employees = [],
  employments = [],
  truncateEmployees = false,
} = {}) {
  fetchMock.mockImplementation(async (url) => {
    const href = String(url);
    if (href.startsWith(MERGE_HRIS_SYNC_STATUS_URL)) {
      if (statusFails) return mockJson({ detail: 'status down' }, 500);
      return mockJson(statusBody);
    }
    if (href.startsWith(MERGE_HRIS_GROUPS_URL) || href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
      return mockJson({ next: null, results: [] });
    }
    if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
      if (truncateEmployees) {
        return mockJson({ results: [employeeRow('emp-page', 'paged@rubix.net')], next: 'cursor-next' });
      }
      return mockJson({ next: null, results: employees });
    }
    if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
      return mockJson({ next: null, results: employments });
    }
    return mockJson({}, 404);
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
  return signAccessToken(user, assignment);
}

async function seedConnection() {
  return MergeConnection.create({
    tenantId: tenant._id,
    connectedByUserId: tenant._id,
    provider: 'deel',
    encryptedAccountToken: encryptToken(ACCOUNT_TOKEN),
    status: 'connected',
    connectedAt: new Date(),
    lastSyncStatus: 'idle',
  });
}

async function seedEmployee(conn, mergeEmployeeId, email, jobTitle = 'Engineer') {
  await MergeHrisEmployee.create({
    tenantId: tenant._id,
    connectionId: conn._id,
    provider: 'deel',
    mergeEmployeeId,
    workEmail: email,
    displayName: 'Ada Lovelace',
    firstName: 'Ada',
    lastName: 'Lovelace',
    employmentStatus: 'ACTIVE',
    jobTitle,
    lastSyncedAt: new Date('2024-01-01T00:00:00.000Z'),
    source: 'merge',
  });
  await Contact.create({
    tenantId: tenant._id,
    name: 'Ada Lovelace',
    email,
    source: 'hris',
    mergeEmployeeId,
    mergeConnectionId: conn._id,
    hrisLinkStatus: 'current',
    employmentStatus: 'ACTIVE',
    designation: jobTitle,
  });
}

async function sync(conn) {
  try {
    const result = await syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
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
  tenant = await Tenant.create({ name: 'Phase1', slug: `phase1-${Date.now()}` });
  adminToken = await makeAdmin();
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('Merge /sync-status client', () => {
  it('follows the cursor and requests page_size 100', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJson({
          next: 'cursor-2',
          results: [statusRow('hris.Employee', 'Employee', { status: 'SYNCING', is_initial_sync: true })],
        }),
      )
      .mockResolvedValueOnce(
        mockJson({
          next: null,
          results: [statusRow('hris.Employment', 'Employment', { status: 'SYNCING', is_initial_sync: true })],
        }),
      );

    const snapshot = await getMergeSyncStatus(ACCOUNT_TOKEN, {
      logContext: { organizationId: 'org', connectionId: 'conn' },
    });

    expect(snapshot.listComplete).toBe(true);
    expect(snapshot.models.employee.status).toBe('SYNCING');
    expect(snapshot.models.employee.isInitialSync).toBe(true);
    expect(snapshot.models.employment.status).toBe('SYNCING');
    expect(snapshot.models.group).toBeNull();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(2);
    expect(urls[0].startsWith(MERGE_HRIS_SYNC_STATUS_URL)).toBe(true);
    expect(urls[0]).toContain('page_size=100');
    expect(urls[1]).toContain('cursor=cursor-2');
    expect(urls[1]).toContain('page_size=100');
    expect(fetchMock.mock.calls[0][1].headers['X-Account-Token']).toBe(ACCOUNT_TOKEN);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-merge-api-key');
  });

  it('treats only DONE + finished initial sync as an authoritative snapshot', () => {
    expect(
      isMergeModelSnapshotAuthoritative({
        status: 'DONE',
        lastSyncResult: 'DONE',
        isInitialSync: false,
      }),
    ).toBe(true);
    for (const status of ['SYNCING', 'PAUSED', 'FAILED', 'DISABLED', 'PARTIALLY_SYNCED']) {
      expect(
        isMergeModelSnapshotAuthoritative({
          status,
          lastSyncResult: 'DONE',
          isInitialSync: false,
        }),
      ).toBe(false);
      expect(
        isMergeModelSnapshotAuthoritative({
          status: 'DONE',
          lastSyncResult: status,
          isInitialSync: false,
        }),
      ).toBe(false);
    }
    expect(
      isMergeModelSnapshotAuthoritative({
        status: 'DONE',
        lastSyncResult: 'DONE',
        isInitialSync: true,
      }),
    ).toBe(false);
    expect(isMergeModelSnapshotAuthoritative(null)).toBe(false);
  });
});

describe('Merge manual sync safety gate', () => {
  it('A. SYNCING + empty employees does not prune employees or stale contacts', async () => {
    const conn = await seedConnection();
    await seedEmployee(conn, 'emp-keep', 'keep@rubix.net');
    mockMerge({
      statusBody: syncStatusBody({
        employee: { status: 'SYNCING', last_sync_result: 'SYNCING', is_initial_sync: true },
        employment: { status: 'SYNCING', last_sync_result: 'SYNCING', is_initial_sync: true },
      }),
      employees: [],
    });

    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.mergeSyncInProgress).toBe(true);
    expect(res.body.employeeSnapshotAuthoritative).toBe(false);
    expect(res.body.mergeSyncStateKnown).toBe(true);
    expect(res.body.sync.employees.pruned).toBe(0);
    expect(res.body.sync.employees.pruneSkippedReason).toBe('merge_sync_not_ready');
    expect(res.body.connection.lastSyncStatus).toBe('success');
    expect(res.body.connection.mergeModelSync.employee.status).toBe('SYNCING');
    expect(res.body.connection.mergeModelSync.employee.isInitialSync).toBe(true);
    expect(res.body.connection.mergeModelSync.employee.modelId).toBe('hris.Employee');

    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'keep@rubix.net' });
    expect(contact.hrisLinkStatus).toBe('current');
    expect(contact.mergeEmployeeId).toBe('emp-keep');
  });

  it('B. SYNCING + partial employees upserts returned rows and keeps missing ones', async () => {
    const conn = await seedConnection();
    await seedEmployee(conn, 'emp-keep', 'keep@rubix.net');
    mockMerge({
      statusBody: syncStatusBody({
        employee: { status: 'SYNCING', last_sync_result: null, is_initial_sync: true },
      }),
      employees: [employeeRow('emp-new', 'new@rubix.net')],
    });

    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.mergeSyncInProgress).toBe(true);
    expect(res.body.sync.employees.created).toBe(1);
    expect(res.body.sync.employees.pruned).toBe(0);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-new' })).toBe(1);
    const kept = await Contact.findOne({ tenantId: tenant._id, email: 'keep@rubix.net' });
    expect(kept.hrisLinkStatus).toBe('current');
  });

  it('C. DONE + complete pagination prunes employees absent from the snapshot', async () => {
    const conn = await seedConnection();
    await seedEmployee(conn, 'emp-keep', 'keep@rubix.net');
    await seedEmployee(conn, 'emp-stale', 'stale@rubix.net');
    mockMerge({
      employees: [employeeRow('emp-keep', 'keep@rubix.net')],
      employments: [
        {
          id: 'empl-keep',
          employee: 'emp-keep',
          job_title: 'Engineer',
          effective_date: '2024-01-01T00:00:00.000Z',
        },
      ],
    });

    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.mergeSyncInProgress).toBe(false);
    expect(res.body.employeeSnapshotAuthoritative).toBe(true);
    expect(res.body.sync.employees.pruned).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-stale' })).toBe(0);
    const stale = await Contact.findOne({ tenantId: tenant._id, email: 'stale@rubix.net' });
    expect(stale.hrisLinkStatus).toBe('stale');
    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.mergeModelSync.employee.status).toBe('DONE');
    expect(stored.mergeModelSync.employee.lastSyncResult).toBe('DONE');
    expect(stored.mergeModelSync.employee.isInitialSync).toBe(false);
    expect(stored.mergeModelSync.employee.lastSyncFinished).toBeInstanceOf(Date);
    expect(stored.mergeModelSync.employee.dataFreshAsOf).toBeInstanceOf(Date);
    expect(stored.lastSyncStatus).toBe('success');
  });

  it('D. DONE + truncated employee pagination does not prune', async () => {
    const conn = await seedConnection();
    await seedEmployee(conn, 'emp-keep', 'keep@rubix.net');
    mockMerge({ truncateEmployees: true });

    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.employeeSnapshotAuthoritative).toBe(false);
    expect(res.body.sync.employees.pruneSkippedReason).toBe('incomplete');
    expect(res.body.sync.employees.pruned).toBe(0);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
  });

  it('E. Employment SYNCING + empty employments does not delete rows or blank titles', async () => {
    const conn = await seedConnection();
    await seedEmployee(conn, 'emp-keep', 'keep@rubix.net', 'Engineer');
    await MergeHrisEmployment.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'deel',
      mergeEmploymentId: 'empl-keep',
      mergeEmployeeId: 'emp-keep',
      jobTitle: 'Engineer',
      source: 'merge',
    });
    mockMerge({
      statusBody: syncStatusBody({
        employment: { status: 'SYNCING', last_sync_result: 'SYNCING', is_initial_sync: true },
      }),
      employees: [employeeRow('emp-keep', 'keep@rubix.net')],
      employments: [],
    });

    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.sync.employments.pruned).toBe(0);
    expect(res.body.sync.employments.pruneSkippedReason).toBe('merge_sync_not_ready');
    expect(await MergeHrisEmployment.countDocuments({ tenantId: tenant._id, mergeEmploymentId: 'empl-keep' })).toBe(1);
    const emp = await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' });
    expect(emp.jobTitle).toBe('Engineer');
    expect(res.body.connection.mergeModelSync.employment.status).toBe('SYNCING');
    expect(res.body.connection.mergeModelSync.group.status).toBe('DONE');
    expect(res.body.connection.mergeModelSync.location.status).toBe('DONE');
  });

  it('F. sync-status failure still imports without pruning', async () => {
    const conn = await seedConnection();
    await seedEmployee(conn, 'emp-keep', 'keep@rubix.net');
    mockMerge({
      statusFails: true,
      employees: [employeeRow('emp-new', 'new@rubix.net')],
    });

    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.mergeSyncStateKnown).toBe(false);
    expect(res.body.employeeSnapshotAuthoritative).toBe(false);
    expect(res.body.mergeSyncInProgress).toBe(false);
    expect(res.body.sync.employees.created).toBe(1);
    expect(res.body.sync.employees.pruned).toBe(0);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-keep' })).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-new' })).toBe(1);
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'keep@rubix.net' });
    expect(contact.hrisLinkStatus).toBe('current');
  });

  it('G. account token and API key stay out of the response and logs', async () => {
    const conn = await seedConnection();
    const info = vi.spyOn(logger, 'info');
    const warn = vi.spyOn(logger, 'warn');
    mockMerge({ employees: [employeeRow('emp-keep', 'keep@rubix.net')] });

    const res = await sync(conn);
    expect(res.status).toBe(200);

    const responseText = JSON.stringify(res.body);
    expect(responseText).not.toContain(ACCOUNT_TOKEN);
    expect(responseText).not.toContain('test-merge-api-key');
    expect(responseText).not.toContain('encryptedAccountToken');

    const logged = JSON.stringify(info.mock.calls) + JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(ACCOUNT_TOKEN);
    expect(logged).not.toContain('test-merge-api-key');
    expect(logged).toContain('Merge sync status fetched');
    expect(logged).toContain('Merge employee prune decision');

    const statusCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith(MERGE_HRIS_SYNC_STATUS_URL));
    expect(statusCall[1].headers['X-Account-Token']).toBe(ACCOUNT_TOKEN);

    info.mockRestore();
    warn.mockRestore();
  });
});
