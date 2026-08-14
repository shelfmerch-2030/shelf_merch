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
import { Contact } from '../src/modules/contacts/contact.model.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import { MergeHrisDepartment } from '../src/modules/integrations/merge/models/mergeHrisDepartment.model.js';
import { MergeHrisLocation } from '../src/modules/integrations/merge/models/mergeHrisLocation.model.js';
import { MergeHrisEmployment } from '../src/modules/integrations/merge/models/mergeHrisEmployment.model.js';
import {
  MERGE_ACCOUNT_TOKEN_URL,
  MERGE_ACCOUNT_DETAILS_URL,
  MERGE_DELETE_ACCOUNT_URL,
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_EMPLOYMENTS_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_LOCATIONS_URL,
} from '../src/modules/integrations/merge/merge.constants.js';

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
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix-merge-p2' });
  otherTenant = await Tenant.create({ name: 'OtherCo', slug: 'other-merge-p2' });
  ({ user: admin, token: adminToken } = await makeUser('company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser('entity_manager', 'entity'));
  ({ token: otherAdminToken } = await makeUser('company_admin', 'tenant', otherTenant));
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('POST /api/integrations/merge/exchange-token', () => {
  it('rejects unauthenticated exchange', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .send({ publicToken: 'pub', integration: 'workday' });
    expect(res.status).toBe(401);
  });

  it('rejects unauthorized role', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ publicToken: 'pub', integration: 'workday' });
    expect(res.status).toBe(403);
  });

  it('rejects unsupported integration slug', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'pub', integration: 'not-real' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing publicToken', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'workday' });
    expect(res.status).toBe(400);
  });

  it('exchanges public token, encrypts account token, and returns safe connection', async () => {
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_ACCOUNT_TOKEN_URL('pub-token-1').split('/pub-token-1')[0])) {
        return mockJson({
          account_token: 'acct-secret-token-xyz',
          id: 'linked-acc-1',
          integration: { name: 'Workday', slug: 'workday' },
        });
      }
      if (href.startsWith(MERGE_ACCOUNT_DETAILS_URL)) {
        return mockJson({
          id: 'linked-acc-1',
          integration: 'Workday',
          integration_slug: 'workday',
          end_user_organization_name: 'Rubix',
          status: 'COMPLETE',
        });
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'pub-token-1', integration: 'workday' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.connection.provider).toBe('workday');
    expect(res.body.connection.status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain('acct-secret-token-xyz');
    expect(JSON.stringify(res.body)).not.toContain('test-merge-api-key');
    expect(res.body.connection.encryptedAccountToken).toBeUndefined();

    const stored = await MergeConnection.findOne({ tenantId: tenant._id, provider: 'workday' });
    expect(stored).toBeTruthy();
    expect(stored.encryptedAccountToken).toBeTruthy();
    expect(stored.encryptedAccountToken).not.toBe('acct-secret-token-xyz');
    expect(decryptToken(stored.encryptedAccountToken)).toBe('acct-secret-token-xyz');
  });

  it('re-link updates existing connection instead of creating a duplicate', async () => {
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'bamboohr',
      encryptedAccountToken: encryptToken('old-token'),
      status: 'connected',
      connectedAt: new Date('2024-01-01'),
    });

    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/account-token/')) {
        return mockJson({
          account_token: 'new-token-456',
          id: 'linked-acc-2',
          integration: { slug: 'bamboohr', name: 'BambooHR' },
        });
      }
      if (href.includes('/account-details')) {
        return mockJson({
          id: 'linked-acc-2',
          integration_slug: 'bamboohr',
          integration: 'BambooHR',
        });
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'pub-2', integration: 'bamboohr' });

    expect(res.status).toBe(200);
    const count = await MergeConnection.countDocuments({
      tenantId: tenant._id,
      provider: 'bamboohr',
    });
    expect(count).toBe(1);
    const stored = await MergeConnection.findOne({ tenantId: tenant._id, provider: 'bamboohr' });
    expect(decryptToken(stored.encryptedAccountToken)).toBe('new-token-456');
  });

  it('sanitizes Merge API errors without leaking secrets', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({ detail: 'Invalid key secret-value-abc' }, 401),
    );

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'bad', integration: 'gusto' });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('secret-value-abc');
    expect(JSON.stringify(res.body)).not.toContain('test-merge-api-key');
  });
});

describe('GET /api/integrations/merge/connections', () => {
  it('returns connected status without secrets and enforces tenant isolation', async () => {
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'keka',
      encryptedAccountToken: encryptToken('tenant-a-secret'),
      status: 'connected',
      connectedAt: new Date(),
    });
    await MergeConnection.create({
      tenantId: otherTenant._id,
      connectedByUserId: admin._id,
      provider: 'keka',
      encryptedAccountToken: encryptToken('tenant-b-secret'),
      status: 'connected',
      connectedAt: new Date(),
    });

    const res = await request(app)
      .get('/api/integrations/merge/connections')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.connections).toHaveLength(1);
    expect(res.body.connections[0].provider).toBe('keka');
    expect(res.body.connections[0].status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain('tenant-a-secret');
    expect(JSON.stringify(res.body)).not.toContain('tenant-b-secret');

    const other = await request(app)
      .get('/api/integrations/merge/connections')
      .set('Authorization', `Bearer ${otherAdminToken}`);
    expect(other.body.connections).toHaveLength(1);
    expect(other.body.connections[0].provider).toBe('keka');
  });
});

describe('POST /api/integrations/merge/connections/:connectionId/sync', () => {
  async function seedConnection(forTenant = tenant, provider = 'workday') {
    return MergeConnection.create({
      tenantId: forTenant._id,
      connectedByUserId: admin._id,
      provider,
      encryptedAccountToken: encryptToken('sync-account-token'),
      status: 'connected',
      connectedAt: new Date(),
      lastSyncStatus: 'idle',
    });
  }

  function mockSyncPages() {
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) {
        return mockJson({
          next: null,
          results: [
            { id: 'dept-1', remote_id: 'D1', name: 'Engineering', type: 'DEPARTMENT', parent_group: null },
          ],
        });
      }
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
        return mockJson({
          next: null,
          results: [
            {
              id: 'loc-1',
              remote_id: 'L1',
              name: 'HQ',
              street_1: '1 Main',
              city: 'Bengaluru',
              state: 'KA',
              zip_code: '560001',
              country: 'IN',
            },
          ],
        });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({
          next: null,
          results: [
            {
              id: 'emp-1',
              remote_id: 'E1',
              first_name: 'Ada',
              last_name: 'Lovelace',
              display_full_name: 'Ada Lovelace',
              work_email: 'ada@rubix.net',
              employment_status: 'ACTIVE',
              manager: null,
              groups: ['dept-1'],
              work_location: 'loc-1',
              start_date: '2024-01-01T00:00:00Z',
              modified_at: '2024-06-01T00:00:00Z',
            },
            {
              id: 'emp-2',
              remote_id: 'E2',
              first_name: 'Grace',
              last_name: 'Hopper',
              work_email: 'grace@rubix.net',
              employment_status: 'INACTIVE',
              groups: ['dept-1'],
              work_location: 'loc-1',
            },
          ],
        });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
        return mockJson({
          next: null,
          results: [
            {
              id: 'empl-1',
              employee: 'emp-1',
              job_title: 'Engineer',
              employment_type: 'FULL_TIME',
              effective_date: '2024-01-01T00:00:00Z',
              pay_frequency: 'MONTHLY',
              pay_period: 'MONTH',
            },
          ],
        });
      }
      return mockJson({}, 404);
    });
  }

  it('rejects unauthorized sync', async () => {
    const conn = await seedConnection();
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects wrong-tenant connection', async () => {
    const conn = await seedConnection(otherTenant);
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects disconnected connection', async () => {
    const conn = await seedConnection();
    conn.status = 'disconnected';
    await conn.save();
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('MERGE_CONNECTION_INACTIVE');
  });

  it('syncs departments, locations, employees, employments idempotently without Contacts/Users', async () => {
    const conn = await seedConnection();
    const manualContact = await Contact.create({
      tenantId: tenant._id,
      name: 'Manual Contact',
      email: 'manual@rubix.net',
      role: 'Member',
      source: 'manual',
    });
    const usersBefore = await User.countDocuments({ tenantId: tenant._id });
    mockSyncPages();

    const first = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.sync.employees.created).toBe(2);
    expect(first.body.sync.departments.created).toBe(1);
    expect(first.body.sync.locations.created).toBe(1);
    expect(first.body.sync.employments.created).toBe(1);
    expect(first.body.sync.contacts).toBeUndefined();
    expect(JSON.stringify(first.body)).not.toContain('sync-account-token');

    const emp = await MergeHrisEmployee.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
    });
    expect(emp.workEmail).toBe('ada@rubix.net');
    expect(emp.jobTitle).toBe('Engineer');
    expect(emp.departmentMergeIds).toEqual(['dept-1']);
    expect(emp.employmentStatus).toBe('ACTIVE');

    const inactive = await MergeHrisEmployee.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-2',
    });
    expect(inactive.employmentStatus).toBe('INACTIVE');

    expect(await MergeHrisDepartment.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await MergeHrisLocation.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await MergeHrisEmployment.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'ada@rubix.net' })).toBe(0);

    const untouched = await Contact.findOne({ _id: manualContact._id, tenantId: tenant._id });
    expect(untouched.name).toBe('Manual Contact');
    expect(untouched.source).toBe('manual');
    expect(await User.countDocuments({ tenantId: tenant._id })).toBe(usersBefore);

    const refreshed = await MergeConnection.findOne({
      _id: conn._id,
      tenantId: tenant._id,
    });
    expect(refreshed.lastSyncStatus).toBe('success');
    expect(refreshed.lastSyncAt).toBeTruthy();

    // Second sync is idempotent and still does not touch Contacts
    mockSyncPages();
    const second = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.sync.contacts).toBeUndefined();
    expect(second.body.sync.employees.created).toBe(0);
    expect(second.body.sync.employees.unchanged).toBe(2);
    expect(second.body.sync.departments.unchanged).toBe(1);
    expect(second.body.sync.locations.unchanged).toBe(1);
    expect(second.body.sync.employments.unchanged).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(2);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('lists HRIS employees from MergeHrisEmployee with tenant isolation', async () => {
    const conn = await seedConnection();
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-list-1',
      displayName: 'Ada Lovelace',
      workEmail: 'ada@rubix.net',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });
    const otherConn = await seedConnection(otherTenant, 'workday');
    await MergeHrisEmployee.create({
      tenantId: otherTenant._id,
      connectionId: otherConn._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-other',
      displayName: 'Other Person',
      workEmail: 'other@other.co',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });

    const res = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.employees).toHaveLength(1);
    expect(res.body.employees[0].workEmail).toBe('ada@rubix.net');
    expect(JSON.stringify(res.body)).not.toContain('sync-account-token');
    expect(JSON.stringify(res.body)).not.toContain('encrypted');
  });

  it('records failure status when Merge sync fails', async () => {
    const conn = await seedConnection();
    fetchMock.mockResolvedValue(mockJson({ detail: 'boom-secret' }, 500));

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('boom-secret');
    expect(JSON.stringify(res.body)).not.toContain('sync-account-token');

    const refreshed = await MergeConnection.findOne({
      _id: conn._id,
      tenantId: tenant._id,
    });
    expect(refreshed.lastSyncStatus).toBe('failed');
    expect(refreshed.status).toBe('connected');
  });

  it('maps Merge scope 403 to MERGE_SCOPES_DISABLED and keeps connection connected', async () => {
    const conn = await seedConnection();
    fetchMock.mockResolvedValue(
      mockJson(
        {
          non_field_errors: [
            'The Group endpoint is inaccessible. To access this data, enable the relevant Scopes in your Merge dashboard.',
          ],
        },
        403,
      ),
    );

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('MERGE_SCOPES_DISABLED');
    expect(res.body.error?.message).toMatch(/scopes are disabled/i);
    expect(JSON.stringify(res.body)).not.toContain('sync-account-token');

    const refreshed = await MergeConnection.findOne({
      _id: conn._id,
      tenantId: tenant._id,
    });
    expect(refreshed.status).toBe('connected');
    expect(refreshed.lastSyncStatus).toBe('failed');
    expect(refreshed.lastError).toBe('MERGE_SCOPES_DISABLED');
  });

  it('maps invalid-token 401 to MERGE_AUTH_FAILED and sets needs_attention', async () => {
    const conn = await seedConnection();
    fetchMock.mockResolvedValue(mockJson({ detail: 'Invalid account token secret-xyz' }, 401));

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('MERGE_AUTH_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('secret-xyz');
    expect(JSON.stringify(res.body)).not.toContain('sync-account-token');

    const refreshed = await MergeConnection.findOne({
      _id: conn._id,
      tenantId: tenant._id,
    });
    expect(refreshed.status).toBe('needs_attention');
    expect(refreshed.lastSyncStatus).toBe('failed');
  });

  it('recovers needs_attention to connected when account-details is COMPLETE', async () => {
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'deel',
      encryptedAccountToken: encryptToken('recover-account-token'),
      status: 'needs_attention',
      connectedAt: new Date(),
      lastSyncStatus: 'failed',
      lastError: 'MERGE_AUTH_FAILED',
    });

    fetchMock.mockImplementation(async (url) => {
      if (String(url).startsWith(MERGE_ACCOUNT_DETAILS_URL)) {
        return mockJson({
          id: 'linked-recover',
          status: 'COMPLETE',
          integration_slug: 'deel',
          integration: 'Deel',
          account_type: 'TEST',
        });
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .get('/api/integrations/merge/connections')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.connections).toHaveLength(1);
    expect(res.body.connections[0].provider).toBe('deel');
    expect(res.body.connections[0].status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain('recover-account-token');

    const refreshed = await MergeConnection.findOne({
      tenantId: tenant._id,
      provider: 'deel',
    });
    expect(refreshed.status).toBe('connected');
  });

  it('successful sync after prior scope failure restores success state', async () => {
    const conn = await seedConnection();
    conn.lastSyncStatus = 'failed';
    conn.lastError = 'MERGE_SCOPES_DISABLED';
    await conn.save();
    mockSyncPages();

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.connection.status).toBe('connected');
    expect(res.body.connection.lastSyncStatus).toBe('success');
    expect(res.body.connection.lastError).toBeFalsy();
    expect(JSON.stringify(res.body)).not.toContain('sync-account-token');
  });

  it('uses decrypted account token server-side via X-Account-Token header', async () => {
    const conn = await seedConnection();
    mockSyncPages();

    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const employeeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith(MERGE_HRIS_EMPLOYEES_URL),
    );
    expect(employeeCall).toBeTruthy();
    expect(employeeCall[1].headers['X-Account-Token']).toBe('sync-account-token');
    expect(employeeCall[1].headers.Authorization).toBe('Bearer test-merge-api-key');
  });

  it('syncs only the selected provider token when multiple providers coexist', async () => {
    const deel = await seedConnection(tenant, 'deel');
    deel.encryptedAccountToken = encryptToken('deel-token-only');
    await deel.save();
    const workday = await seedConnection(tenant, 'workday');
    workday.encryptedAccountToken = encryptToken('workday-token-only');
    await workday.save();

    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) {
        return mockJson({ next: null, results: [] });
      }
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
        return mockJson({ next: null, results: [] });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({ next: null, results: [] });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
        return mockJson({ next: null, results: [] });
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${deel._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const accountTokens = fetchMock.mock.calls.map(([, opts]) => opts?.headers?.['X-Account-Token']);
    expect(accountTokens.every((t) => t === 'deel-token-only')).toBe(true);
    expect(accountTokens).not.toContain('workday-token-only');

    const workdayFresh = await MergeConnection.findOne({
      _id: workday._id,
      tenantId: tenant._id,
    });
    expect(workdayFresh.status).toBe('connected');
    expect(decryptToken(workdayFresh.encryptedAccountToken)).toBe('workday-token-only');
  });
});

describe('POST /api/integrations/merge/connections/:connectionId/disconnect', () => {
  it('unlinks Merge account, clears token, preserves employees and peer providers', async () => {
    const workday = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'workday',
      encryptedAccountToken: encryptToken('workday-secret'),
      endUserOriginId: `${tenant._id}:hris:workday`,
      status: 'connected',
      connectedAt: new Date(),
      lastSyncAt: new Date('2026-01-15T10:00:00.000Z'),
      lastSyncStatus: 'success',
    });
    const deel = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'deel',
      encryptedAccountToken: encryptToken('deel-secret'),
      endUserOriginId: `${tenant._id}:hris:deel`,
      status: 'connected',
      connectedAt: new Date(),
      lastSyncStatus: 'success',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: workday._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-wd-1',
      displayName: 'Ada Workday',
      firstName: 'Ada',
      lastName: 'Workday',
      workEmail: 'ada@example.com',
      employmentStatus: 'ACTIVE',
      source: 'merge',
    });

    fetchMock.mockImplementation(async (url) => {
      if (String(url) === MERGE_DELETE_ACCOUNT_URL) {
        return mockJson({});
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${workday._id}/disconnect`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.connection.status).toBe('disconnected');
    expect(res.body.connection.provider).toBe('workday');
    expect(JSON.stringify(res.body)).not.toContain('workday-secret');
    expect(JSON.stringify(res.body)).not.toContain('deel-secret');
    expect(JSON.stringify(res.body)).not.toContain('test-merge-api-key');

    const deleteCall = fetchMock.mock.calls.find(([url]) => String(url) === MERGE_DELETE_ACCOUNT_URL);
    expect(deleteCall).toBeTruthy();
    expect(deleteCall[1].method).toBe('POST');
    expect(deleteCall[1].headers['X-Account-Token']).toBe('workday-secret');

    const workdayFresh = await MergeConnection.findOne({
      _id: workday._id,
      tenantId: tenant._id,
    });
    expect(workdayFresh.status).toBe('disconnected');
    expect(workdayFresh.encryptedAccountToken).toBe('');
    expect(workdayFresh.endUserOriginId).toBe(`${tenant._id}:hris:workday`);
    expect(workdayFresh.lastSyncAt?.toISOString()).toBe('2026-01-15T10:00:00.000Z');

    const deelFresh = await MergeConnection.findOne({
      _id: deel._id,
      tenantId: tenant._id,
    });
    expect(deelFresh.status).toBe('connected');
    expect(decryptToken(deelFresh.encryptedAccountToken)).toBe('deel-secret');

    expect(await MergeHrisEmployee.countDocuments({
      tenantId: tenant._id,
      connectionId: workday._id,
    })).toBe(1);
  });

  it('rejects wrong-tenant disconnect', async () => {
    const conn = await MergeConnection.create({
      tenantId: otherTenant._id,
      connectedByUserId: admin._id,
      provider: 'keka',
      encryptedAccountToken: encryptToken('other-tenant-secret'),
      status: 'connected',
      connectedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/disconnect`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    const still = await MergeConnection.findOne({
      _id: conn._id,
      tenantId: otherTenant._id,
    });
    expect(still.status).toBe('connected');
    expect(decryptToken(still.encryptedAccountToken)).toBe('other-tenant-secret');
  });

  it('reconnect after disconnect reuses origin id and does not duplicate rows', async () => {
    const originId = `${tenant._id}:hris:bamboohr`;
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'bamboohr',
      encryptedAccountToken: '',
      endUserOriginId: originId,
      status: 'disconnected',
      connectedAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSyncAt: new Date('2026-01-10T00:00:00.000Z'),
      lastSyncStatus: 'success',
    });

    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/account-token/')) {
        return mockJson({
          account_token: 'new-bamboo-token',
          id: 'linked-1',
          integration: { name: 'BambooHR', slug: 'bamboohr' },
        });
      }
      if (href.startsWith(MERGE_ACCOUNT_DETAILS_URL)) {
        return mockJson({
          id: 'linked-1',
          status: 'COMPLETE',
          integration: 'BambooHR',
          end_user_origin_id: originId,
          end_user_organization_name: 'Rubix',
        });
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'pub-reconnect', integration: 'bamboohr' });

    expect(res.status).toBe(200);
    expect(res.body.connection.status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain('new-bamboo-token');

    const count = await MergeConnection.countDocuments({
      tenantId: tenant._id,
      provider: 'bamboohr',
    });
    expect(count).toBe(1);
    const stored = await MergeConnection.findOne({ tenantId: tenant._id, provider: 'bamboohr' });
    expect(stored.endUserOriginId).toBe(originId);
    expect(decryptToken(stored.encryptedAccountToken)).toBe('new-bamboo-token');
    expect(stored.lastSyncAt?.toISOString()).toBe('2026-01-10T00:00:00.000Z');
  });
});
