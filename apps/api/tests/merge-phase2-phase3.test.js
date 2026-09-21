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
import { mergePaginateAll } from '../src/modules/integrations/merge/mergeHttp.js';
import { syncMergeConnection } from '../src/modules/integrations/merge/mergeSync.service.js';
import {
  acquireMergeSyncLock,
  renewMergeSyncLock,
} from '../src/modules/integrations/merge/mergeSyncLock.js';

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

describe('mergePaginateAll snapshot completeness', () => {
  function jsonOk(body) {
    return mockJson(body, 200);
  }

  it('returns complete=true for an empty results array with no next cursor', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ results: [], next: null }));
    const snapshot = await mergePaginateAll('https://api.merge.dev/api/hris/v1/employees', {
      accountToken: 'acct',
    });
    expect(snapshot.complete).toBe(true);
    expect(snapshot.malformed).toBe(false);
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.items).toEqual([]);
  });

  it('returns complete=false when results is missing', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ next: null }));
    const snapshot = await mergePaginateAll('https://api.merge.dev/api/hris/v1/employees', {
      accountToken: 'acct',
    });
    expect(snapshot.complete).toBe(false);
    expect(snapshot.malformed).toBe(true);
    expect(snapshot.items).toEqual([]);
  });

  it('returns complete=false when results is not an array', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ results: null, next: null }));
    const snapshot = await mergePaginateAll('https://api.merge.dev/api/hris/v1/employees', {
      accountToken: 'acct',
    });
    expect(snapshot.complete).toBe(false);
    expect(snapshot.malformed).toBe(true);
  });

  it('returns complete=false when pagination hits the page cap', async () => {
    fetchMock.mockImplementation(async () => jsonOk({ results: [{ id: 'e1' }], next: 'cursor-next' }));
    const snapshot = await mergePaginateAll('https://api.merge.dev/api/hris/v1/employees', {
      accountToken: 'acct',
      maxPages: 2,
    });
    expect(snapshot.complete).toBe(false);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.pageCount).toBe(2);
    expect(snapshot.items).toHaveLength(2);
  });

  it('returns complete=true after following next until empty', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOk({ results: [{ id: 'e1' }], next: 'c2' }))
      .mockResolvedValueOnce(jsonOk({ results: [{ id: 'e2' }], next: null }));
    const snapshot = await mergePaginateAll('https://api.merge.dev/api/hris/v1/employees', {
      accountToken: 'acct',
    });
    expect(snapshot.complete).toBe(true);
    expect(snapshot.items.map((r) => r.id)).toEqual(['e1', 'e2']);
  });
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

  it('exchanges Gusto public token without affecting an existing Deel connection', async () => {
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'deel',
      encryptedAccountToken: encryptToken('deel-secret-keep'),
      endUserOriginId: `${tenant._id}:hris:deel`,
      status: 'connected',
      connectedAt: new Date('2024-06-01'),
    });

    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/account-token/')) {
        return mockJson({
          account_token: 'gusto-acct-secret',
          id: 'linked-gusto-1',
          integration: { slug: 'gusto', name: 'Gusto' },
        });
      }
      if (href.includes('/account-details')) {
        return mockJson({
          id: 'linked-gusto-1',
          integration_slug: 'gusto',
          integration: 'Gusto',
          end_user_organization_name: 'Rubix',
          status: 'COMPLETE',
        });
      }
      return mockJson({}, 404);
    });

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'pub-gusto-1', integration: 'gusto' });

    expect(res.status).toBe(200);
    expect(res.body.connection.provider).toBe('gusto');
    expect(res.body.connection.status).toBe('connected');
    expect(JSON.stringify(res.body)).not.toContain('gusto-acct-secret');

    const gusto = await MergeConnection.findOne({ tenantId: tenant._id, provider: 'gusto' });
    expect(gusto).toBeTruthy();
    expect(gusto.endUserOriginId).toBe(`${tenant._id}:hris:gusto`);
    expect(decryptToken(gusto.encryptedAccountToken)).toBe('gusto-acct-secret');

    const deel = await MergeConnection.findOne({ tenantId: tenant._id, provider: 'deel' });
    expect(deel).toBeTruthy();
    expect(deel.status).toBe('connected');
    expect(decryptToken(deel.encryptedAccountToken)).toBe('deel-secret-keep');
    expect(deel.endUserOriginId).toBe(`${tenant._id}:hris:deel`);
  });

  it('sanitizes Merge API errors without leaking secrets', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson({ detail: 'Invalid key secret-value-abc' }, 401),
    );

    const res = await request(app)
      .post('/api/integrations/merge/exchange-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicToken: 'bad', integration: 'keka' });

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
            { id: 'team-1', remote_id: 'T1', name: 'Analytics', type: 'TEAM', parent_group: null },
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
              team: { id: 'team-1', name: 'Analytics' },
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

  it('syncs departments, locations, employees, employments and mirrors Contacts (not Users)', async () => {
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
    expect(first.body.sync.departments.created).toBe(2);
    expect(first.body.sync.locations.created).toBe(1);
    expect(first.body.sync.employments.created).toBe(1);
    expect(first.body.sync.contacts.created).toBe(2);
    expect(JSON.stringify(first.body)).not.toContain('sync-account-token');

    const emp = await MergeHrisEmployee.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
    });
    expect(emp.workEmail).toBe('ada@rubix.net');
    expect(emp.jobTitle).toBe('Engineer');
    expect(emp.departmentMergeIds).toEqual(['dept-1', 'team-1']);
    expect(emp.employmentStatus).toBe('ACTIVE');

    const engineering = await MergeHrisDepartment.findOne({
      tenantId: tenant._id,
      mergeDepartmentId: 'dept-1',
    });
    expect(engineering.groupType).toBe('DEPARTMENT');
    const analytics = await MergeHrisDepartment.findOne({
      tenantId: tenant._id,
      mergeDepartmentId: 'team-1',
    });
    expect(analytics.groupType).toBe('TEAM');

    const inactive = await MergeHrisEmployee.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-2',
    });
    expect(inactive.employmentStatus).toBe('INACTIVE');

    expect(await MergeHrisDepartment.countDocuments({ tenantId: tenant._id })).toBe(2);
    expect(await MergeHrisLocation.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await MergeHrisEmployment.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(3);
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'ada@rubix.net' })).toBe(1);

    const adaContact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(adaContact.source).toBe('hris');
    expect(adaContact.name).toBe('Ada Lovelace');
    expect(adaContact.designation).toBe('Engineer');
    expect(adaContact.mergeEmployeeId).toBe('emp-1');
    expect(String(adaContact.mergeConnectionId)).toBe(String(conn._id));
    expect(adaContact.department).toBe('Engineering');
    expect(adaContact.address?.country).toBe('IN');
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'grace@rubix.net' })).toBe(1);

    const graceContact = await Contact.findOne({ tenantId: tenant._id, email: 'grace@rubix.net' });
    expect(graceContact.mergeEmployeeId).toBe('emp-2');
    expect(String(graceContact.mergeConnectionId)).toBe(String(conn._id));

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

    // Second sync is idempotent for Merge models and updates existing Contacts
    mockSyncPages();
    const second = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.sync.contacts.created).toBe(0);
    expect(second.body.sync.contacts.updated).toBe(2);
    expect(second.body.sync.employees.created).toBe(0);
    expect(second.body.sync.employees.unchanged).toBe(2);
    expect(second.body.sync.departments.unchanged).toBe(2);
    expect(second.body.sync.locations.unchanged).toBe(1);
    expect(second.body.sync.employments.unchanged).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(2);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(3);
  });

  it('prunes leftover Merge employee UUIDs after a later snapshot sync', async () => {
    const conn = await seedConnection();
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-stale-uuid',
      remoteEmployeeId: 'E1',
      displayName: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      workEmail: 'ada@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: new Date('2026-08-14T07:47:42.499Z'),
      source: 'merge',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Ada Lovelace',
      email: 'ada@rubix.net',
      source: 'hris',
    });
    mockSyncPages();

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const ada = await MergeHrisEmployee.find({
      tenantId: tenant._id,
      connectionId: conn._id,
      workEmail: 'ada@rubix.net',
    });
    expect(ada).toHaveLength(1);
    expect(ada[0].mergeEmployeeId).toBe('emp-1');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-stale-uuid' })).toBe(0);
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'ada@rubix.net' })).toBe(1);
  });

  it('lists HRIS employees from MergeHrisEmployee with tenant isolation', async () => {
    const conn = await seedConnection();
    await MergeHrisLocation.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeLocationId: 'loc-list-1',
      name: 'Hyderabad Hub',
      street1: 'Madhapur',
      street2: '',
      city: 'Hyderabad',
      state: 'Telangana',
      zipCode: '500081',
      country: 'IN',
      source: 'merge',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-list-1',
      displayName: 'Ada Lovelace',
      workEmail: 'ada@rubix.net',
      employmentStatus: 'ACTIVE',
      locationMergeId: 'loc-list-1',
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
    expect(res.body.employees[0].connectionStatus).toBe('connected');
    expect(res.body.employees[0].address).toBe(
      'Madhapur, Hyderabad, Telangana 500081, India',
    );
    expect(res.body.employees[0].locationName).toBe('Hyderabad Hub');
    expect(JSON.stringify(res.body)).not.toContain('sync-account-token');
    expect(JSON.stringify(res.body)).not.toContain('encrypted');
  });

  it('hides stale Merge UUID rows from a prior relink on the same connection', async () => {
    const lastSyncAt = new Date('2026-09-09T11:49:13.794Z');
    const conn = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'workday',
      encryptedAccountToken: encryptToken('list-stale-token'),
      status: 'connected',
      connectedAt: new Date(),
      lastSyncAt,
      lastSyncStatus: 'success',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeEmployeeId: 'stale-id',
      remoteEmployeeId: '3658',
      displayName: 'Anjali Raj',
      workEmail: 'anjali@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: new Date('2026-08-14T07:47:42.499Z'),
      source: 'merge',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeEmployeeId: 'current-id',
      remoteEmployeeId: '3658',
      displayName: 'Anjali Raj',
      workEmail: 'anjali@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: lastSyncAt,
      source: 'merge',
    });

    const res = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const anjali = res.body.employees.filter((e) => e.workEmail === 'anjali@rubix.net');
    expect(anjali).toHaveLength(1);
    expect(anjali[0].mergeEmployeeId).toBe('current-id');
  });

  it('still lists the same email once per provider when both connections are current', async () => {
    const lastSyncAt = new Date('2026-09-09T11:49:13.794Z');
    const deel = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'deel',
      encryptedAccountToken: encryptToken('deel-list-token'),
      status: 'connected',
      connectedAt: new Date(),
      lastSyncAt,
      lastSyncStatus: 'success',
    });
    const gw = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      encryptedAccountToken: encryptToken('gw-list-token'),
      status: 'connected',
      connectedAt: new Date(),
      lastSyncAt,
      lastSyncStatus: 'success',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: deel._id,
      provider: 'deel',
      mergeEmployeeId: 'deel-1',
      displayName: 'Same Person Deel',
      workEmail: 'same@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: lastSyncAt,
      source: 'merge',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: gw._id,
      provider: 'google-workspace',
      mergeEmployeeId: 'gw-1',
      displayName: 'Same Person GW',
      workEmail: 'same@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: lastSyncAt,
      source: 'merge',
    });

    const res = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const rows = res.body.employees.filter((e) => e.workEmail === 'same@rubix.net');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((e) => e.provider))).toEqual(new Set(['deel', 'google-workspace']));
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

describe('Merge HRIS → Contact identity upsert', () => {
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

  function mockHrisSnapshot({
    employees = [
      {
        id: 'emp-1',
        remote_id: 'E1',
        first_name: 'John',
        last_name: 'Snow',
        display_full_name: 'John Snow',
        work_email: 'johnsnow1@gmail.com',
        employment_status: 'ACTIVE',
        groups: ['dept-1'],
        work_location: 'loc-1',
        start_date: '2024-01-01T00:00:00Z',
      },
    ],
    jobTitle = 'Ranger',
  } = {}) {
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) {
        return mockJson({
          next: null,
          results: [{ id: 'dept-1', name: 'Night Watch', type: 'DEPARTMENT' }],
        });
      }
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
        return mockJson({
          next: null,
          results: [
            {
              id: 'loc-1',
              name: 'Winterfell',
              street_1: 'Castle',
              city: 'North',
              state: 'KA',
              zip_code: '560001',
              country: 'IN',
            },
            {
              id: 'loc-2',
              name: 'Castle Black',
              street_1: 'Wall',
              city: 'North',
              state: 'KA',
              zip_code: '560002',
              country: 'IN',
            },
          ],
        });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({ next: null, results: employees });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
        return mockJson({
          next: null,
          results: employees.map((emp, i) => ({
            id: `empl-${i + 1}`,
            employee: emp.id,
            job_title: jobTitle,
            employment_type: 'FULL_TIME',
            effective_date: '2024-01-01T00:00:00Z',
          })),
        });
      }
      return mockJson({}, 404);
    });
  }

  it('creates a Contact on first HRIS sync and links Merge identity', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(1);
    expect(res.body.sync.contacts.updated).toBe(0);

    const contact = await Contact.findOne({
      tenantId: tenant._id,
      email: 'johnsnow1@gmail.com',
    });
    expect(contact).toBeTruthy();
    expect(contact.mergeEmployeeId).toBe('emp-1');
    expect(String(contact.mergeConnectionId)).toBe(String(conn._id));
    expect(contact.source).toBe('hris');
    expect(contact.hrisLinkStatus).toBe('current');
    expect(contact.name).toBe('John Snow');
  });

  it('second sync of unchanged employee updates the same Contact (created = 0)', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const before = await Contact.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
      mergeConnectionId: conn._id,
    });

    mockHrisSnapshot();
    const second = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(second.status).toBe(200);
    expect(second.body.sync.contacts.created).toBe(0);
    expect(second.body.sync.contacts.updated).toBe(1);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);

    const after = await Contact.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
      mergeConnectionId: conn._id,
    });
    expect(String(after._id)).toBe(String(before._id));
  });

  it('work-email change updates the same Contact and does not create a duplicate', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const before = await Contact.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
      mergeConnectionId: conn._id,
    });
    expect(before.email).toBe('johnsnow1@gmail.com');

    mockHrisSnapshot({
      employees: [
        {
          id: 'emp-1',
          remote_id: 'E1',
          first_name: 'John',
          last_name: 'Snow',
          display_full_name: 'John Snow',
          work_email: 'johnsnow@shelfmerch.com',
          employment_status: 'ACTIVE',
          groups: ['dept-1'],
          work_location: 'loc-1',
        },
      ],
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(0);
    expect(res.body.sync.contacts.updated).toBe(1);
    expect(res.body.sync.contacts.conflicts || 0).toBe(0);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);

    const after = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(after.email).toBe('johnsnow@shelfmerch.com');
    expect(after.mergeEmployeeId).toBe('emp-1');
    expect(String(after.mergeConnectionId)).toBe(String(conn._id));
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'johnsnow1@gmail.com' })).toBe(
      0,
    );
  });

  it('name/title/location changes update the same Contact', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot({ jobTitle: 'Ranger' });
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const before = await Contact.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
      mergeConnectionId: conn._id,
    });

    mockHrisSnapshot({
      jobTitle: 'Lord Commander',
      employees: [
        {
          id: 'emp-1',
          remote_id: 'E1',
          first_name: 'Jon',
          last_name: 'Snow',
          display_full_name: 'Jon Snow',
          work_email: 'johnsnow1@gmail.com',
          employment_status: 'ACTIVE',
          groups: ['dept-1'],
          work_location: 'loc-2',
        },
      ],
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(0);
    expect(res.body.sync.contacts.updated).toBe(1);

    const after = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(after.name).toBe('Jon Snow');
    expect(after.firstName).toBe('Jon');
    expect(after.designation).toBe('Lord Commander');
    expect(after.workLocation).toBe('Castle Black');
    expect(after.email).toBe('johnsnow1@gmail.com');
  });

  it('claims an existing manual Contact with matching email instead of duplicating', async () => {
    const conn = await seedConnection();
    const manual = await Contact.create({
      tenantId: tenant._id,
      name: 'Manual John',
      email: 'johnsnow1@gmail.com',
      role: 'Sender',
      source: 'manual',
    });

    mockHrisSnapshot();
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(0);
    expect(res.body.sync.contacts.updated).toBe(1);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);

    const claimed = await Contact.findOne({ _id: manual._id, tenantId: tenant._id });
    expect(claimed.mergeEmployeeId).toBe('emp-1');
    expect(String(claimed.mergeConnectionId)).toBe(String(conn._id));
    expect(claimed.source).toBe('hris');
    expect(claimed.hrisLinkStatus).toBe('current');
    expect(claimed.name).toBe('John Snow');
    expect(claimed.role).toBe('Sender');
  });

  it('does not cross-link the same Merge employee id across tenants', async () => {
    const connA = await seedConnection(tenant, 'workday');
    const connB = await seedConnection(otherTenant, 'workday');

    mockHrisSnapshot();
    await request(app)
      .post(`/api/integrations/merge/connections/${connA._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    mockHrisSnapshot();
    await request(app)
      .post(`/api/integrations/merge/connections/${connB._id}/sync`)
      .set('Authorization', `Bearer ${otherAdminToken}`);

    const contactA = await Contact.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
      mergeConnectionId: connA._id,
    });
    const contactB = await Contact.findOne({
      tenantId: otherTenant._id,
      mergeEmployeeId: 'emp-1',
      mergeConnectionId: connB._id,
    });

    expect(contactA).toBeTruthy();
    expect(contactB).toBeTruthy();
    expect(String(contactA._id)).not.toBe(String(contactB._id));
    expect(String(contactA.tenantId)).toBe(String(tenant._id));
    expect(String(contactB.tenantId)).toBe(String(otherTenant._id));
  });

  it('does not cross-link the same Merge employee id across connections in one tenant', async () => {
    const connWorkday = await seedConnection(tenant, 'workday');
    const connDeel = await seedConnection(tenant, 'deel');

    mockHrisSnapshot({
      employees: [
        {
          id: 'emp-1',
          remote_id: 'E1',
          first_name: 'John',
          last_name: 'Snow',
          display_full_name: 'John Snow',
          work_email: 'john-workday@rubix.net',
          employment_status: 'ACTIVE',
          groups: ['dept-1'],
          work_location: 'loc-1',
        },
      ],
    });
    await request(app)
      .post(`/api/integrations/merge/connections/${connWorkday._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    mockHrisSnapshot({
      employees: [
        {
          id: 'emp-1',
          remote_id: 'E1',
          first_name: 'John',
          last_name: 'Snow',
          display_full_name: 'John Snow',
          work_email: 'john-deel@rubix.net',
          employment_status: 'ACTIVE',
          groups: ['dept-1'],
          work_location: 'loc-1',
        },
      ],
    });
    await request(app)
      .post(`/api/integrations/merge/connections/${connDeel._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const workdayContact = await Contact.findOne({
      tenantId: tenant._id,
      mergeConnectionId: connWorkday._id,
      mergeEmployeeId: 'emp-1',
    });
    const deelContact = await Contact.findOne({
      tenantId: tenant._id,
      mergeConnectionId: connDeel._id,
      mergeEmployeeId: 'emp-1',
    });

    expect(workdayContact).toBeTruthy();
    expect(deelContact).toBeTruthy();
    expect(String(workdayContact._id)).not.toBe(String(deelContact._id));
    expect(workdayContact.email).toBe('john-workday@rubix.net');
    expect(deelContact.email).toBe('john-deel@rubix.net');
  });

  it('logs a controlled conflict when new email is already owned by another Contact', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const linked = await Contact.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
      mergeConnectionId: conn._id,
    });
    expect(linked.email).toBe('johnsnow1@gmail.com');

    const other = await Contact.create({
      tenantId: tenant._id,
      name: 'Other Person',
      email: 'johnsnow@shelfmerch.com',
      role: 'Member',
      source: 'manual',
    });

    const warnSpy = vi.spyOn(
      (await import('../src/config/logger.js')).logger,
      'warn',
    );

    mockHrisSnapshot({
      employees: [
        {
          id: 'emp-1',
          remote_id: 'E1',
          first_name: 'John',
          last_name: 'Snow',
          display_full_name: 'John Snow',
          work_email: 'johnsnow@shelfmerch.com',
          employment_status: 'ACTIVE',
          groups: ['dept-1'],
          work_location: 'loc-1',
        },
      ],
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(0);
    expect(res.body.sync.contacts.updated).toBe(0);
    expect(res.body.sync.contacts.conflicts).toBe(1);

    const conflictLogged = warnSpy.mock.calls.some(
      ([payload, msg]) =>
        payload?.code === 'MERGE_CONTACT_EMAIL_CONFLICT' &&
        String(msg).includes('email conflict'),
    );
    expect(conflictLogged).toBe(true);
    warnSpy.mockRestore();

    const stillLinked = await Contact.findOne({ _id: linked._id, tenantId: tenant._id });
    const stillOther = await Contact.findOne({ _id: other._id, tenantId: tenant._id });
    expect(stillLinked.email).toBe('johnsnow1@gmail.com');
    expect(stillLinked.mergeEmployeeId).toBe('emp-1');
    expect(stillOther.email).toBe('johnsnow@shelfmerch.com');
    expect(stillOther.mergeEmployeeId || '').toBe('');
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(2);
  });
});

describe('Merge HRIS snapshot prune, titles, org units, optional fields', () => {
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

  function mockPages({
    groups = [{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }],
    locations = [
      {
        id: 'loc-1',
        name: 'HQ',
        street_1: '1 Main',
        city: 'Austin',
        state: 'TX',
        zip_code: '78701',
        country: 'US',
      },
    ],
    employees = [
      {
        id: 'emp-1',
        remote_id: 'E1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        display_full_name: 'Ada Lovelace',
        work_email: 'ada@rubix.net',
        employment_status: 'ACTIVE',
        groups: ['dept-1'],
        work_location: 'loc-1',
      },
    ],
    employments = [
      {
        id: 'empl-1',
        employee: 'emp-1',
        job_title: 'Engineer',
        employment_type: 'FULL_TIME',
        effective_date: '2024-01-01T00:00:00Z',
      },
    ],
    employeesPayload,
    employmentsPayload,
  } = {}) {
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) {
        return mockJson({ next: null, results: groups });
      }
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
        return mockJson({ next: null, results: locations });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        if (employeesPayload) return mockJson(employeesPayload);
        return mockJson({ next: null, results: employees });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
        if (employmentsPayload) return mockJson(employmentsPayload);
        return mockJson({ next: null, results: employments });
      }
      return mockJson({ next: null, results: [] });
    });
  }

  it('does not prune when the employee snapshot is malformed', async () => {
    const conn = await seedConnection();
    mockPages();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(1);

    mockPages({ employeesPayload: { next: null } });
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sync.employees.pruneSkippedReason).toBe('incomplete');
    expect(res.body.sync.employees.pruned).toBe(0);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('does not prune when employee rows exist but none have ids', async () => {
    const conn = await seedConnection();
    mockPages();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    mockPages({ employees: [{ first_name: 'Nameless' }] });
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sync.employees.pruneSkippedReason).toBe('no_usable_ids');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('prunes all connection employees on a complete empty snapshot', async () => {
    const conn = await seedConnection();
    const otherConn = await seedConnection(otherTenant, 'workday');
    await MergeHrisEmployee.create({
      tenantId: otherTenant._id,
      connectionId: otherConn._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-other',
      displayName: 'Other Org',
      workEmail: 'other@example.com',
      source: 'merge',
    });
    mockPages();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(1);

    mockPages({ employees: [] });
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sync.employees.pruned).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: otherTenant._id })).toBe(1);
  });

  it('does not prune unfetched ids when employee pagination is truncated', async () => {
    const conn = await seedConnection();
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-local-only',
      displayName: 'Keep Me',
      workEmail: 'keep@rubix.net',
      source: 'merge',
    });

    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        return mockJson({ results: [{ id: 'emp-page', first_name: 'Paged' }], next: 'cursor-next' });
      }
      return mockJson({ next: null, results: [] });
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sync.employees.pruneSkippedReason).toBe('incomplete');
    expect(
      await MergeHrisEmployee.countDocuments({
        tenantId: tenant._id,
        mergeEmployeeId: 'emp-local-only',
      }),
    ).toBe(1);
  });

  it('clears job title when upstream employment title is removed', async () => {
    const conn = await seedConnection();
    mockPages();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(
      (await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).jobTitle,
    ).toBe('Engineer');

    mockPages({
      employments: [
        {
          id: 'empl-1',
          employee: 'emp-1',
          job_title: '',
          employment_type: 'FULL_TIME',
          effective_date: '2024-01-01T00:00:00Z',
        },
      ],
    });
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const emp = await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' });
    expect(emp.jobTitle).toBe('');
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(contact.designation).toBe('');
  });

  it('clears job title when a complete employment snapshot has no rows for the employee', async () => {
    const conn = await seedConnection();
    mockPages();
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    mockPages({ employments: [] });
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const emp = await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' });
    expect(emp.jobTitle).toBe('');
    expect(await MergeHrisEmployment.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('prefers DEPARTMENT over TEAM for display and does not invent IN country', async () => {
    const conn = await seedConnection();
    mockPages({
      groups: [
        { id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' },
        { id: 'team-1', name: 'Analytics', type: 'TEAM' },
        { id: 'cc-1', name: 'R&D Cost', type: 'COST_CENTER' },
      ],
      locations: [{ id: 'loc-1', name: 'Remote', city: 'Berlin', country: '' }],
      employees: [
        {
          id: 'emp-1',
          first_name: 'Ada',
          last_name: 'Lovelace',
          work_email: 'ada@rubix.net',
          groups: ['dept-1', 'team-1', 'cc-1'],
          team: { id: 'team-1', name: 'Analytics' },
          work_location: 'loc-1',
        },
      ],
      employments: [],
    });

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const emp = await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' });
    expect(emp.departmentMergeIds).toEqual(['dept-1', 'team-1', 'cc-1']);

    const cost = await MergeHrisDepartment.findOne({
      tenantId: tenant._id,
      mergeDepartmentId: 'cc-1',
    });
    expect(cost.groupType).toBe('UNKNOWN');
    expect(cost.name).toBe('R&D Cost');

    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(contact.department).toBe('Engineering');
    expect(contact.address?.country).toBe('');

    const list = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const listed = list.body.employees.find((e) => e.mergeEmployeeId === 'emp-1');
    expect(listed.departmentName).toBe('Engineering');
    expect(listed.country).toBe('');
  });

  it('uses team name when only Employee.team is present (Deel-like)', async () => {
    const conn = await seedConnection(tenant, 'deel');
    mockPages({
      groups: [],
      locations: [],
      employees: [
        {
          id: 'emp-1',
          first_name: 'John',
          last_name: 'Snow',
          work_email: 'john@deel.test',
          team: { id: 'team-deel', name: 'Night Watch' },
        },
      ],
      employments: [],
    });
    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);

    const emp = await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' });
    expect(emp.departmentMergeIds).toEqual(['team-deel']);
    const team = await MergeHrisDepartment.findOne({
      tenantId: tenant._id,
      mergeDepartmentId: 'team-deel',
    });
    expect(team.groupType).toBe('TEAM');
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'john@deel.test' });
    expect(contact.department).toBe('Night Watch');
  });

  it('keeps employees without email in the directory and does not create Contacts', async () => {
    const conn = await seedConnection();
    mockPages({
      employees: [
        {
          id: 'emp-no-email',
          first_name: 'Sam',
          last_name: 'Tarly',
          employment_status: 'ACTIVE',
        },
      ],
      employments: [],
      locations: [],
    });
    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sync.employees.created).toBe(1);
    expect(res.body.sync.contacts.created).toBe(0);
    expect(
      await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-no-email' }),
    ).toBe(1);
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('updates the same employee when optional fields appear, change, and disappear', async () => {
    const conn = await seedConnection();
    mockPages({
      employees: [
        {
          id: 'emp-1',
          first_name: 'Ada',
          last_name: 'Lovelace',
        },
      ],
      employments: [],
      locations: [],
      groups: [],
    });
    let res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.sync.employees.created).toBe(1);
    expect(res.body.sync.contacts.created).toBe(0);

    const before = await MergeHrisEmployee.findOne({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' });
    expect(before.workEmail).toBe('');
    expect(before.mobilePhoneNumber).toBe('');
    expect(before.lastName).toBe('Lovelace');

    mockPages({
      groups: [{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }],
      locations: [{ id: 'loc-1', name: 'HQ', country: 'GB' }],
      employees: [
        {
          id: 'emp-1',
          first_name: 'Ada',
          last_name: 'Lovelace',
          work_email: 'ada@rubix.net',
          mobile_phone_number: '555-0100',
          groups: ['dept-1'],
          work_location: 'loc-1',
        },
      ],
      employments: [
        {
          id: 'empl-1',
          employee: 'emp-1',
          job_title: 'Engineer',
          effective_date: '2024-01-01T00:00:00Z',
        },
      ],
    });
    res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.sync.employees.created).toBe(0);
    expect(res.body.sync.employees.updated).toBe(1);
    expect(res.body.sync.contacts.created).toBe(1);

    const mid = await MergeHrisEmployee.findOne({
      _id: before._id,
      tenantId: tenant._id,
    });
    expect(mid.workEmail).toBe('ada@rubix.net');
    expect(mid.mobilePhoneNumber).toBe('555-0100');
    expect(mid.jobTitle).toBe('Engineer');
    expect(mid.locationMergeId).toBe('loc-1');

    mockPages({
      groups: [{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }],
      locations: [{ id: 'loc-1', name: 'HQ', country: 'GB' }],
      employees: [
        {
          id: 'emp-1',
          first_name: 'Ada',
          last_name: '',
          work_email: 'ada@rubix.net',
          mobile_phone_number: '',
          groups: ['dept-1'],
        },
      ],
      employments: [
        {
          id: 'empl-1',
          employee: 'emp-1',
          job_title: '',
          effective_date: '2024-01-01T00:00:00Z',
        },
      ],
    });
    res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.sync.contacts.created).toBe(0);
    expect(res.body.sync.contacts.updated).toBe(1);

    const after = await MergeHrisEmployee.findOne({
      _id: before._id,
      tenantId: tenant._id,
    });
    expect(after.lastName).toBe('');
    expect(after.mobilePhoneNumber).toBe('');
    expect(after.locationMergeId).toBe('');
    expect(after.jobTitle).toBe('');
    expect(after.workEmail).toBe('ada@rubix.net');

    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(contact.lastName).toBe('');
    expect(contact.phone).toBe('');
    expect(contact.designation).toBe('');
    expect(String(contact.mergeEmployeeId)).toBe('emp-1');
  });
});

describe('Merge HRIS contact lifecycle, reclaim, and isolation', () => {
  async function seedConnection(forTenant = tenant, provider = 'workday') {
    return MergeConnection.create({
      tenantId: forTenant._id,
      connectedByUserId: admin._id,
      provider,
      encryptedAccountToken: encryptToken('lifecycle-account-token'),
      status: 'connected',
      connectedAt: new Date(),
      lastSyncStatus: 'idle',
    });
  }

  function employeeRow(overrides = {}) {
    return {
      id: 'emp-1',
      remote_id: 'E1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      display_full_name: 'Ada Lovelace',
      work_email: 'ada@rubix.net',
      employment_status: 'ACTIVE',
      groups: ['dept-1'],
      work_location: 'loc-1',
      ...overrides,
    };
  }

  function mockHrisSnapshot({
    employees = [employeeRow()],
    employeesPayload,
  } = {}) {
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href === MERGE_DELETE_ACCOUNT_URL) {
        return mockJson({});
      }
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) {
        return mockJson({
          next: null,
          results: [{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }],
        });
      }
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) {
        return mockJson({
          next: null,
          results: [
            {
              id: 'loc-1',
              name: 'HQ',
              street_1: '1 Main',
              city: 'Austin',
              state: 'TX',
              zip_code: '78701',
              country: 'US',
            },
          ],
        });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) {
        if (employeesPayload) return mockJson(employeesPayload);
        return mockJson({ next: null, results: employees });
      }
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) {
        return mockJson({
          next: null,
          results: employees.map((emp, i) => ({
            id: `empl-${emp.id || i + 1}`,
            employee: emp.id,
            job_title: 'Engineer',
            employment_type: 'FULL_TIME',
            effective_date: '2024-01-01T00:00:00Z',
          })),
        });
      }
      return mockJson({ next: null, results: [] });
    });
  }

  async function sync(conn, token = adminToken) {
    return request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('reclaims the same Contact when the old Merge UUID is pruned and a new UUID shares the email', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await sync(conn);

    const before = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(before.mergeEmployeeId).toBe('emp-1');
    expect(before.hrisLinkStatus).toBe('current');

    mockHrisSnapshot({
      employees: [employeeRow({ id: 'emp-new', remote_id: 'E9' })],
    });
    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.conflicts || 0).toBe(0);

    const after = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(String(after._id)).toBe(String(before._id));
    expect(after.mergeEmployeeId).toBe('emp-new');
    expect(String(after.mergeConnectionId)).toBe(String(conn._id));
    expect(after.hrisLinkStatus).toBe('current');
    expect(await Contact.countDocuments({ tenantId: tenant._id })).toBe(1);

    mockHrisSnapshot({
      employees: [employeeRow({ id: 'emp-new', remote_id: 'E9' })],
    });
    const retry = await sync(conn);
    expect(retry.status).toBe(200);
    expect(retry.body.sync.contacts.created).toBe(0);
    const again = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(String(again._id)).toBe(String(before._id));
    expect(again.mergeEmployeeId).toBe('emp-new');
    expect(again.hrisLinkStatus).toBe('current');
  });

  it('does not reclaim when two live employees share an email', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot({
      employees: [
        employeeRow({ id: 'emp-live-1', remote_id: 'A' }),
        employeeRow({
          id: 'emp-live-2',
          remote_id: 'B',
          first_name: 'Grace',
          last_name: 'Hopper',
          display_full_name: 'Grace Hopper',
        }),
      ],
    });
    const warnSpy = vi.spyOn((await import('../src/config/logger.js')).logger, 'warn');
    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(1);
    expect(res.body.sync.contacts.conflicts).toBe(1);

    const conflictLogged = warnSpy.mock.calls.some(
      ([payload, msg]) =>
        payload?.code === 'MERGE_CONTACT_IDENTITY_CONFLICT' &&
        payload?.reason === 'live_identity' &&
        String(msg).includes('identity conflict'),
    );
    expect(conflictLogged).toBe(true);
    warnSpy.mockRestore();

    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(2);
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'ada@rubix.net' })).toBe(1);
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(['emp-live-1', 'emp-live-2']).toContain(contact.mergeEmployeeId);
    expect(contact.hrisLinkStatus).toBe('current');
  });

  it('does not reclaim a Contact linked to another Merge connection', async () => {
    const connA = await seedConnection(tenant, 'workday');
    const connB = await seedConnection(tenant, 'deel');
    mockHrisSnapshot();
    await sync(connA);

    const linked = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(String(linked.mergeConnectionId)).toBe(String(connA._id));

    const warnSpy = vi.spyOn((await import('../src/config/logger.js')).logger, 'warn');
    mockHrisSnapshot({
      employees: [employeeRow({ id: 'emp-deel', remote_id: 'D1' })],
    });
    const res = await sync(connB);
    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(0);
    expect(res.body.sync.contacts.conflicts).toBe(1);

    const conflictLogged = warnSpy.mock.calls.some(
      ([payload]) =>
        payload?.code === 'MERGE_CONTACT_IDENTITY_CONFLICT' &&
        payload?.reason === 'cross_connection',
    );
    expect(conflictLogged).toBe(true);
    warnSpy.mockRestore();

    const still = await Contact.findOne({ _id: linked._id, tenantId: tenant._id });
    expect(still.mergeEmployeeId).toBe('emp-1');
    expect(String(still.mergeConnectionId)).toBe(String(connA._id));
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'ada@rubix.net' })).toBe(1);
  });

  it('does not claim another tenant Contact with the same email or Merge UUID string', async () => {
    const connA = await seedConnection(tenant, 'workday');
    const connB = await seedConnection(otherTenant, 'workday');
    mockHrisSnapshot();
    await sync(connA);
    const contactA = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });

    mockHrisSnapshot();
    await sync(connB, otherAdminToken);
    const contactB = await Contact.findOne({ tenantId: otherTenant._id, email: 'ada@rubix.net' });

    expect(contactA).toBeTruthy();
    expect(contactB).toBeTruthy();
    expect(String(contactA._id)).not.toBe(String(contactB._id));
    expect(String(contactA.tenantId)).toBe(String(tenant._id));
    expect(String(contactB.tenantId)).toBe(String(otherTenant._id));
    expect(contactA.mergeEmployeeId).toBe('emp-1');
    expect(contactB.mergeEmployeeId).toBe('emp-1');
  });

  it('reuses the same Contact when an employee disappears then returns with the same UUID', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await sync(conn);
    const before = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(before.employmentStatus).toBe('ACTIVE');
    expect(before.hrisLinkStatus).toBe('current');

    mockHrisSnapshot({ employees: [] });
    const gone = await sync(conn);
    expect(gone.status).toBe(200);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(0);

    const stale = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(stale).toBeTruthy();
    expect(stale.mergeEmployeeId).toBe('emp-1');
    expect(String(stale.mergeConnectionId)).toBe(String(conn._id));
    expect(stale.hrisLinkStatus).toBe('stale');
    expect(stale.employmentStatus).toBe('ACTIVE');

    mockHrisSnapshot();
    await sync(conn);
    const returned = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(returned.hrisLinkStatus).toBe('current');
    expect(returned.mergeEmployeeId).toBe('emp-1');
    expect(returned.employmentStatus).toBe('ACTIVE');
    expect(await Contact.countDocuments({ tenantId: tenant._id, email: 'ada@rubix.net' })).toBe(1);
  });

  it('keeps the same Contact current when employment status flips ACTIVE → INACTIVE → ACTIVE', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await sync(conn);
    const before = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });

    mockHrisSnapshot({
      employees: [employeeRow({ employment_status: 'INACTIVE' })],
    });
    await sync(conn);
    const inactive = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(inactive.employmentStatus).toBe('INACTIVE');
    expect(inactive.hrisLinkStatus).toBe('current');
    expect(inactive.mergeEmployeeId).toBe('emp-1');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).toBe(1);

    let listed = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listed.body.find((c) => c.email === 'ada@rubix.net')).toBeUndefined();

    const directoryInactive = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(
      directoryInactive.body.employees.find((e) => e.mergeEmployeeId === 'emp-1')
        ?.effectiveEmploymentStatus,
    ).toBe('INACTIVE');

    mockHrisSnapshot({
      employees: [employeeRow({ employment_status: 'ACTIVE' })],
    });
    await sync(conn);
    const rehired = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(rehired.employmentStatus).toBe('ACTIVE');
    expect(rehired.hrisLinkStatus).toBe('current');
    expect(String(rehired._id)).toBe(String(before._id));

    listed = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${adminToken}`);
    const visible = listed.body.find((c) => c.email === 'ada@rubix.net');
    expect(visible).toBeTruthy();
    expect(String(visible._id)).toBe(String(before._id));
    expect(visible.effectiveEmploymentStatus).toBe('ACTIVE');
  });

  it('marks linked Contacts stale after a complete prune without deleting them or clearing Merge IDs', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await sync(conn);
    const before = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });

    mockHrisSnapshot({ employees: [] });
    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.sync.employees.pruned).toBe(1);

    expect(await Contact.countDocuments({ _id: before._id, tenantId: tenant._id })).toBe(1);
    const stale = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(stale.hrisLinkStatus).toBe('stale');
    expect(stale.mergeEmployeeId).toBe('emp-1');
    expect(String(stale.mergeConnectionId)).toBe(String(conn._id));
    expect(stale.employmentStatus).toBe('ACTIVE');
    expect(stale.source).toBe('hris');

    const listed = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${adminToken}`);
    const visible = listed.body.find((c) => c.email === 'ada@rubix.net');
    expect(visible).toBeTruthy();
    expect(visible.hrisLinkStatus).toBe('stale');
    expect(visible.effectiveEmploymentStatus).toBe('ACTIVE');
  });

  it('does not mass-mark Contacts stale after an incomplete snapshot', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await sync(conn);
    const before = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(before.hrisLinkStatus).toBe('current');

    mockHrisSnapshot({ employeesPayload: { next: null } });
    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.sync.employees.pruneSkippedReason).toBe('incomplete');

    const still = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(still.hrisLinkStatus).toBe('current');
    expect(still.mergeEmployeeId).toBe('emp-1');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).toBe(1);
  });

  it('marks only this connection stale on a complete empty snapshot and leaves peers untouched', async () => {
    const connA = await seedConnection(tenant, 'workday');
    const connB = await seedConnection(tenant, 'deel');
    mockHrisSnapshot();
    await sync(connA);
    mockHrisSnapshot({
      employees: [employeeRow({ id: 'emp-deel', work_email: 'deel@rubix.net' })],
    });
    await sync(connB);

    mockHrisSnapshot({ employees: [] });
    const res = await sync(connA);
    expect(res.status).toBe(200);
    expect(res.body.sync.employees.pruned).toBe(1);

    const staleA = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    const currentB = await Contact.findOne({ tenantId: tenant._id, email: 'deel@rubix.net' });
    expect(staleA.hrisLinkStatus).toBe('stale');
    expect(staleA.mergeEmployeeId).toBe('emp-1');
    expect(currentB.hrisLinkStatus).toBe('current');
    expect(currentB.mergeEmployeeId).toBe('emp-deel');
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: connB._id })).toBe(1);
    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: connA._id })).toBe(0);
  });

  it('preserves HRIS employees and Contacts on disconnect and lists them as disconnected', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot();
    await sync(conn);
    const contact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(contact.hrisLinkStatus).toBe('current');

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/disconnect`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.connection.status).toBe('disconnected');

    expect(await MergeHrisEmployee.countDocuments({ tenantId: tenant._id, connectionId: conn._id })).toBe(1);
    const stillContact = await Contact.findOne({ _id: contact._id, tenantId: tenant._id });
    expect(stillContact.hrisLinkStatus).toBe('current');
    expect(stillContact.mergeEmployeeId).toBe('emp-1');

    const list = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.employees).toHaveLength(1);
    expect(list.body.employees[0].connectionStatus).toBe('disconnected');
    expect(list.body.employees[0].mergeEmployeeId).toBe('emp-1');
  });

  it('reclaims on relink with new UUIDs and same emails; leftover Contacts become stale', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot({
      employees: [
        employeeRow(),
        employeeRow({
          id: 'emp-leave',
          remote_id: 'L1',
          first_name: 'Gone',
          last_name: 'Person',
          display_full_name: 'Gone Person',
          work_email: 'gone@rubix.net',
        }),
      ],
    });
    await sync(conn);
    const kept = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    const leftover = await Contact.findOne({ tenantId: tenant._id, email: 'gone@rubix.net' });

    await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/disconnect`)
      .set('Authorization', `Bearer ${adminToken}`);

    const relinked = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    relinked.status = 'connected';
    relinked.encryptedAccountToken = encryptToken('relink-account-token');
    await relinked.save();

    mockHrisSnapshot({
      employees: [employeeRow({ id: 'emp-relink', remote_id: 'R1' })],
    });
    const res = await sync(relinked);
    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.conflicts || 0).toBe(0);

    const reclaimed = await Contact.findOne({ _id: kept._id, tenantId: tenant._id });
    expect(reclaimed.mergeEmployeeId).toBe('emp-relink');
    expect(reclaimed.hrisLinkStatus).toBe('current');
    expect(String(reclaimed.mergeConnectionId)).toBe(String(conn._id));

    const staleLeftover = await Contact.findOne({ _id: leftover._id, tenantId: tenant._id });
    expect(staleLeftover.mergeEmployeeId).toBe('emp-leave');
    expect(staleLeftover.hrisLinkStatus).toBe('stale');
    expect(staleLeftover.email).toBe('gone@rubix.net');
  });

  it('prune/sync on connection A does not delete connection B employees or mutate B Contacts', async () => {
    const connA = await seedConnection(tenant, 'workday');
    const connB = await seedConnection(tenant, 'deel');
    mockHrisSnapshot();
    await sync(connA);
    mockHrisSnapshot({
      employees: [employeeRow({ id: 'emp-b', work_email: 'b@rubix.net' })],
    });
    await sync(connB);
    const contactB = await Contact.findOne({ tenantId: tenant._id, email: 'b@rubix.net' });
    const empB = await MergeHrisEmployee.findOne({
      tenantId: tenant._id,
      connectionId: connB._id,
      mergeEmployeeId: 'emp-b',
    });

    mockHrisSnapshot({ employees: [] });
    await sync(connA);

    const empBAfter = await MergeHrisEmployee.findOne({ _id: empB._id, tenantId: tenant._id });
    const contactBAfter = await Contact.findOne({ _id: contactB._id, tenantId: tenant._id });
    expect(empBAfter).toBeTruthy();
    expect(contactBAfter.hrisLinkStatus).toBe('current');
    expect(contactBAfter.mergeEmployeeId).toBe('emp-b');
    expect(String(contactBAfter.mergeConnectionId)).toBe(String(connB._id));
  });

  it('keeps no-email employees Directory-only and leaves Zoho/manual Contacts unlinked', async () => {
    const conn = await seedConnection();
    const manual = await Contact.create({
      tenantId: tenant._id,
      name: 'Manual Person',
      email: 'manual-life@rubix.net',
      role: 'Member',
      source: 'manual',
    });
    const zohoLike = await Contact.create({
      tenantId: tenant._id,
      name: 'Zoho Person',
      email: 'zoho-life@rubix.net',
      role: 'Member',
      source: 'hris',
      zohoRecordId: 'z-1',
    });

    mockHrisSnapshot({
      employees: [
        employeeRow({ work_email: '', personal_email: '' }),
        employeeRow({
          id: 'emp-2',
          remote_id: 'E2',
          work_email: 'ada@rubix.net',
        }),
      ],
    });
    const res = await sync(conn);
    expect(res.status).toBe(200);
    expect(res.body.sync.contacts.created).toBe(1);

    const listed = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listed.body.employees.some((e) => e.mergeEmployeeId === 'emp-1')).toBe(true);
    expect(await Contact.countDocuments({ tenantId: tenant._id, mergeEmployeeId: 'emp-1' })).toBe(0);

    const stillManual = await Contact.findOne({ _id: manual._id, tenantId: tenant._id });
    const stillZoho = await Contact.findOne({ _id: zohoLike._id, tenantId: tenant._id });
    expect(stillManual.hrisLinkStatus).toBe('none');
    expect(stillManual.mergeEmployeeId || '').toBe('');
    expect(stillZoho.hrisLinkStatus).toBe('none');
    expect(stillZoho.zohoRecordId).toBe('z-1');
    expect(stillZoho.mergeEmployeeId || '').toBe('');
  });

  it('exposes derived effective status on Directory and Contacts without changing raw snapshot', async () => {
    const conn = await seedConnection();
    const past = '2020-01-15T00:00:00.000Z';
    mockHrisSnapshot({
      employees: [
        employeeRow({
          employment_status: 'ACTIVE',
          termination_date: past,
          start_date: '2020-01-01T00:00:00.000Z',
        }),
      ],
    });
    const synced = await sync(conn);
    expect(synced.status).toBe(200);

    const stored = await MergeHrisEmployee.findOne({
      tenantId: tenant._id,
      mergeEmployeeId: 'emp-1',
    });
    expect(stored.employmentStatus).toBe('ACTIVE');
    expect(stored.terminationDate?.toISOString()).toBe(past);

    const listed = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = listed.body.employees.find((e) => e.mergeEmployeeId === 'emp-1');
    expect(row.employmentStatus).toBe('ACTIVE');
    expect(row.effectiveEmploymentStatus).toBe('INACTIVE');
    expect(row.effectiveStatusSource).toBe('termination_date');
    expect(row.terminationDate).toBeTruthy();

    const storedContact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(storedContact).toBeTruthy();
    expect(storedContact.deletedAt).toBeFalsy();
    expect(storedContact.employmentStatus).toBe('ACTIVE');
    expect(storedContact.terminationDate?.toISOString()).toBe(past);
    expect(storedContact.hrisLinkStatus).toBe('current');
    expect(storedContact.mergeEmployeeId).toBe('emp-1');

    const contacts = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(contacts.status).toBe(200);
    expect(contacts.body.find((c) => c.email === 'ada@rubix.net')).toBeUndefined();
  });

  it('keeps Directory Active for a future date-only termination and for today date-only', async () => {
    const conn = await seedConnection();
    const todayUtc = new Date();
    const todayStamp = `${todayUtc.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const futureStamp = '2099-01-01T00:00:00.000Z';
    mockHrisSnapshot({
      employees: [
        employeeRow({
          id: 'emp-today',
          work_email: 'today@rubix.net',
          employment_status: 'ACTIVE',
          termination_date: todayStamp,
        }),
        employeeRow({
          id: 'emp-future',
          remote_id: 'F1',
          first_name: 'Future',
          work_email: 'future@rubix.net',
          employment_status: 'ACTIVE',
          termination_date: futureStamp,
        }),
      ],
    });
    await sync(conn);

    const listed = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    const todayRow = listed.body.employees.find((e) => e.mergeEmployeeId === 'emp-today');
    const futureRow = listed.body.employees.find((e) => e.mergeEmployeeId === 'emp-future');
    expect(todayRow.employmentStatus).toBe('ACTIVE');
    expect(todayRow.effectiveEmploymentStatus).toBe('ACTIVE');
    expect(futureRow.employmentStatus).toBe('ACTIVE');
    expect(futureRow.effectiveEmploymentStatus).toBe('ACTIVE');
  });

  it('applies explicit INACTIVE immediately even when termination_date is in the future', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot({
      employees: [
        employeeRow({
          employment_status: 'INACTIVE',
          termination_date: '2099-06-01T00:00:00.000Z',
        }),
      ],
    });
    await sync(conn);
    const listed = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = listed.body.employees.find((e) => e.mergeEmployeeId === 'emp-1');
    expect(row.employmentStatus).toBe('INACTIVE');
    expect(row.effectiveEmploymentStatus).toBe('INACTIVE');
    expect(row.effectiveStatusSource).toBe('merge_status');
  });

  it('clears Contact.terminationDate when Merge sends null and restores Active', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot({
      employees: [employeeRow({ termination_date: '2020-01-15T00:00:00.000Z' })],
    });
    await sync(conn);
    let contact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(contact.terminationDate).toBeTruthy();
    expect(contact.employmentStatus).toBe('ACTIVE');

    mockHrisSnapshot({
      employees: [employeeRow({ termination_date: null })],
    });
    await sync(conn);
    contact = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(contact.terminationDate).toBeNull();
    expect(contact.employmentStatus).toBe('ACTIVE');

    const listed = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = listed.body.employees.find((e) => e.mergeEmployeeId === 'emp-1');
    expect(row.employmentStatus).toBe('ACTIVE');
    expect(row.effectiveEmploymentStatus).toBe('ACTIVE');
    expect(row.effectiveStatusSource).toBe('merge_status');

    const contacts = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${adminToken}`);
    const listedContact = contacts.body.find((c) => c.email === 'ada@rubix.net');
    expect(listedContact).toBeTruthy();
    expect(listedContact.effectiveEmploymentStatus).toBe('ACTIVE');
  });

  it('treats a later start_date after an old termination as rehire (ACTIVE)', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot({
      employees: [
        employeeRow({
          employment_status: 'ACTIVE',
          start_date: '2026-03-01T00:00:00.000Z',
          termination_date: '2026-01-15T00:00:00.000Z',
        }),
      ],
    });
    await sync(conn);
    const listed = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = listed.body.employees.find((e) => e.mergeEmployeeId === 'emp-1');
    expect(row.employmentStatus).toBe('ACTIVE');
    expect(row.effectiveEmploymentStatus).toBe('ACTIVE');
    expect(row.effectiveStatusSource).toBe('rehire');

    const contacts = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${adminToken}`);
    const contact = contacts.body.find((c) => c.email === 'ada@rubix.net');
    expect(contact.employmentStatus).toBe('ACTIVE');
    expect(contact.effectiveEmploymentStatus).toBe('ACTIVE');
    expect(contact.effectiveStatusSource).toBe('rehire');
  });

  it('hides a stale Merge Contact that is still effectively INACTIVE', async () => {
    const conn = await seedConnection();
    mockHrisSnapshot({
      employees: [employeeRow({ employment_status: 'INACTIVE' })],
    });
    await sync(conn);
    const before = await Contact.findOne({ tenantId: tenant._id, email: 'ada@rubix.net' });
    expect(before.employmentStatus).toBe('INACTIVE');

    mockHrisSnapshot({ employees: [] });
    await sync(conn);
    const stale = await Contact.findOne({ _id: before._id, tenantId: tenant._id });
    expect(stale).toBeTruthy();
    expect(stale.deletedAt).toBeFalsy();
    expect(stale.hrisLinkStatus).toBe('stale');
    expect(stale.mergeEmployeeId).toBe('emp-1');
    expect(stale.employmentStatus).toBe('INACTIVE');

    const listed = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listed.body.find((c) => c.email === 'ada@rubix.net')).toBeUndefined();
  });
});

describe('Merge sync lock', () => {
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

  function hrisPages() {
    return {
      groups: {
        next: null,
        results: [{ id: 'dept-1', name: 'Engineering', type: 'DEPARTMENT' }],
      },
      locations: {
        next: null,
        results: [{ id: 'loc-1', name: 'HQ', city: 'Austin', country: 'US' }],
      },
      employees: {
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
            groups: ['dept-1'],
            work_location: 'loc-1',
          },
        ],
      },
      employments: {
        next: null,
        results: [{ id: 'empl-1', employee: 'emp-1', job_title: 'Engineer' }],
      },
    };
  }

  function mockHrisFetch(gate) {
    const pages = hrisPages();
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (gate && href.startsWith(MERGE_HRIS_GROUPS_URL)) await gate;
      if (href.startsWith(MERGE_HRIS_GROUPS_URL)) return mockJson(pages.groups);
      if (href.startsWith(MERGE_HRIS_LOCATIONS_URL)) return mockJson(pages.locations);
      if (href.startsWith(MERGE_HRIS_EMPLOYEES_URL)) return mockJson(pages.employees);
      if (href.startsWith(MERGE_HRIS_EMPLOYMENTS_URL)) return mockJson(pages.employments);
      return mockJson({ next: null, results: [] });
    });
  }

  async function waitForLock(conn) {
    const started = Date.now();
    while (Date.now() - started < 4000) {
      const row = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
      if (row?.syncLockToken) return row;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error('sync lock was not acquired');
  }

  it('rejects a second overlapping sync for the same connection with MERGE_SYNC_IN_PROGRESS', async () => {
    const conn = await seedConnection();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    mockHrisFetch(gate);

    const firstStarted = request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`)
      .then((res) => res);
    await waitForLock(conn);

    const second = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe('MERGE_SYNC_IN_PROGRESS');
    expect(second.body.error?.message).toMatch(/already in progress/i);

    release();
    const firstRes = await firstStarted;
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.sync.employees.created).toBe(1);

    const refreshed = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(refreshed.syncLockToken).toBe('');
    expect(refreshed.syncLockUntil).toBeNull();
    expect(refreshed.lastSyncStatus).toBe('success');
  });

  it('allows another sync after success and after failure', async () => {
    const conn = await seedConnection();
    mockHrisFetch();
    const ok = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);

    mockHrisFetch();
    const again = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(again.status).toBe(200);

    fetchMock.mockResolvedValue(mockJson({ detail: 'upstream' }, 500));
    const failed = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(failed.status).toBe(502);

    const afterFail = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(afterFail.lastSyncStatus).toBe('failed');
    expect(afterFail.syncLockToken).toBe('');

    mockHrisFetch();
    const recovered = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(recovered.status).toBe(200);
  });

  it('recovers a stale lock whose lease has expired', async () => {
    const conn = await seedConnection();
    conn.lastSyncStatus = 'syncing';
    conn.syncLockToken = 'expired-owner';
    conn.syncLockUntil = new Date(Date.now() - 1000);
    await conn.save();
    mockHrisFetch();

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.connection.lastSyncStatus).toBe('success');
  });

  it('returns 409 without calling Merge when a live lock is held', async () => {
    const conn = await seedConnection();
    conn.syncLockToken = 'live-owner';
    conn.syncLockUntil = new Date(Date.now() + 60_000);
    conn.lastSyncStatus = 'syncing';
    await conn.save();
    mockHrisFetch();

    const res = await request(app)
      .post(`/api/integrations/merge/connections/${conn._id}/sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('MERGE_SYNC_IN_PROGRESS');
    expect(fetchMock).not.toHaveBeenCalled();

    const still = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(still.syncLockToken).toBe('live-owner');
  });

  it('lets two connections on the same tenant sync concurrently', async () => {
    const workday = await seedConnection(tenant, 'workday');
    const deel = await seedConnection(tenant, 'deel');
    mockHrisFetch();

    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/integrations/merge/connections/${workday._id}/sync`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .post(`/api/integrations/merge/connections/${deel._id}/sync`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('lets two tenants sync the same provider concurrently', async () => {
    const mine = await seedConnection(tenant, 'workday');
    const theirs = await seedConnection(otherTenant, 'workday');
    mockHrisFetch();

    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/integrations/merge/connections/${mine._id}/sync`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .post(`/api/integrations/merge/connections/${theirs._id}/sync`)
        .set('Authorization', `Bearer ${otherAdminToken}`),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('renews syncLockUntil while a sync is running', async () => {
    const conn = await seedConnection();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    mockHrisFetch(gate);

    const pending = syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
      lock: { leaseMs: 80, renewEveryMs: 20 },
    });
    const held = await waitForLock(conn);
    const firstUntil = held.syncLockUntil.getTime();
    const deadline = Date.now() + 500;
    let mid = held;
    while (Date.now() < deadline) {
      mid = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
      if (mid.syncLockUntil.getTime() > firstUntil) break;
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(mid.syncLockToken).toBe(held.syncLockToken);
    expect(mid.syncLockUntil.getTime()).toBeGreaterThan(firstUntil);

    release();
    const result = await pending;
    expect(result.connection.lastSyncStatus).toBe('success');
  });

  it('does not extend another sync lock on renew', async () => {
    const conn = await seedConnection();
    const acquired = await acquireMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      leaseMs: 60_000,
    });
    expect(acquired).toBeTruthy();
    const until = acquired.connection.syncLockUntil.getTime();

    const missed = await renewMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      token: 'someone-else',
      leaseMs: 60_000,
    });
    expect(missed).toBeNull();

    const still = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(still.syncLockToken).toBe(acquired.token);
    expect(still.syncLockUntil.getTime()).toBe(until);
  });

  it('stops before prune/stale/terminal writes when ownership is lost', async () => {
    const conn = await seedConnection();
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-stale',
      displayName: 'Leftover',
      workEmail: 'leftover@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: new Date(),
      source: 'merge',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Leftover',
      email: 'leftover@rubix.net',
      source: 'hris',
      mergeEmployeeId: 'emp-stale',
      mergeConnectionId: conn._id,
      hrisLinkStatus: 'current',
      employmentStatus: 'ACTIVE',
    });

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    mockHrisFetch(gate);

    const pending = syncMergeConnection({
      tenantId: tenant._id,
      connectionId: conn._id,
    });
    await waitForLock(conn);

    await MergeConnection.updateOne(
      { _id: conn._id, tenantId: tenant._id },
      {
        $set: {
          syncLockToken: 'other-owner',
          syncLockUntil: new Date(Date.now() + 120_000),
        },
      },
    );

    release();
    await expect(pending).rejects.toMatchObject({ code: 'MERGE_SYNC_LOCK_LOST', status: 409 });

    expect(
      await MergeHrisEmployee.countDocuments({
        tenantId: tenant._id,
        connectionId: conn._id,
        mergeEmployeeId: 'emp-stale',
      }),
    ).toBe(1);
    const leftover = await Contact.findOne({ tenantId: tenant._id, email: 'leftover@rubix.net' });
    expect(leftover.hrisLinkStatus).toBe('current');

    const refreshed = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(refreshed.syncLockToken).toBe('other-owner');
    expect(refreshed.lastSyncStatus).toBe('syncing');
    expect(refreshed.lastSyncAt).toBeNull();
  });

  it('clears the heartbeat timer on success, failure, and lock loss', async () => {
    const conn = await seedConnection();
    const intervalIds = [];
    const realSetInterval = global.setInterval;
    const setSpy = vi.spyOn(global, 'setInterval').mockImplementation((fn, ms) => {
      const id = realSetInterval(fn, ms);
      intervalIds.push(id);
      return id;
    });
    const clearSpy = vi.spyOn(global, 'clearInterval');

    mockHrisFetch();
    await syncMergeConnection({ tenantId: tenant._id, connectionId: conn._id });
    expect(intervalIds.length).toBeGreaterThan(0);
    expect(clearSpy).toHaveBeenCalledWith(intervalIds[0]);

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
