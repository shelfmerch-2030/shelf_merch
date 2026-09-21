import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import {
  makeTenant,
  makeUser,
  makeFundedWallet,
  makeEntity,
  authHeader,
} from './helpers.js';
import { createApp } from '../src/app.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import { listContactsForUser } from '../src/modules/contacts/contacts.service.js';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import * as envModule from '../src/config/env.js';

let app;
let tenant;
let admin;
let adminToken;
let managerToken;
let managerUser;
let marketingEntity;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  envModule.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'contacts-suite' });
  ({ token: adminToken, user: admin } = await makeUser(tenant, 'company_admin', 'tenant'));

  const wallet = await makeFundedWallet(tenant, { name: 'Budget', amount: 100_000 });
  marketingEntity = await makeEntity(tenant, wallet, 'Marketing');

  ({ token: managerToken, user: managerUser } = await makeUser(tenant, 'entity_manager', 'entity', {
    assignedEntityIds: [marketingEntity._id],
    scopeId: marketingEntity._id,
  }));
  marketingEntity.managerUserId = managerUser._id;
  marketingEntity.managerEmail = managerUser.email;
  await marketingEntity.save();
  await RoleAssignment.updateOne(
    { userId: managerUser._id, tenantId: tenant._id },
    {
      assignedEntityIds: [marketingEntity._id],
      scopeId: marketingEntity._id,
      scopeType: 'entity',
      role: 'entity_manager',
    },
  );
});

describe('contacts API', () => {
  it('creates and lists contacts for the tenant', async () => {
    const created = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(adminToken))
      .send({
        name: 'Alice',
        email: 'alice@contacts-suite.io',
        phone: '9999999999',
        department: 'HR',
      });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe('manual');
    expect(created.body.hrisLinkStatus || 'none').toBe('none');
    expect(created.body.effectiveEmploymentStatus).toBe('');
    expect(created.body.effectiveStatusSource).toBe('merge_status');
    expect(String(created.body.tenantId)).toBe(String(tenant._id));

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].email).toBe('alice@contacts-suite.io');
  });

  it('validates email on create (400)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(adminToken))
      .send({ name: 'Bad', email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/contacts');
    expect(res.status).toBe(401);
  });

  it('allows entity managers to write contacts in their department (RBAC matrix)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(managerToken))
      .send({ name: 'X', email: 'x@contacts-suite.io' });
    expect(res.status).toBe(201);
    expect(res.body.department).toBe('Marketing');
  });

  it('admin lists all contacts; entity manager only sees matching department', async () => {
    await Contact.create([
      {
        tenantId: tenant._id,
        name: 'Marketer',
        email: 'mkt@contacts-suite.io',
        role: 'Member',
        department: 'Marketing',
        source: 'manual',
      },
      {
        tenantId: tenant._id,
        name: 'Seller',
        email: 'sales@contacts-suite.io',
        role: 'Member',
        department: 'Sales',
        source: 'manual',
      },
      {
        tenantId: tenant._id,
        name: 'No Dept',
        email: 'none@contacts-suite.io',
        role: 'Member',
        department: '',
        source: 'manual',
      },
    ]);

    const adminList = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(adminList.status).toBe(200);
    expect(adminList.body).toHaveLength(3);

    const managerList = await request(app).get('/api/v1/contacts').set(authHeader(managerToken));
    expect(managerList.status).toBe(200);
    expect(managerList.body).toHaveLength(1);
    expect(managerList.body[0].email).toBe('mkt@contacts-suite.io');
  });

  it('matches entity-manager department filter case-insensitively', async () => {
    await Contact.create({
      tenantId: tenant._id,
      name: 'Case',
      email: 'case@contacts-suite.io',
      role: 'Member',
      department: 'marketing',
      source: 'manual',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(managerToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].email).toBe('case@contacts-suite.io');
  });

  it('stamps entity-manager create without department to managed entity name', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(managerToken))
      .send({ name: 'Stamped', email: 'stamped@contacts-suite.io' });
    expect(res.status).toBe(201);
    expect(res.body.department).toBe('Marketing');

    const list = await request(app).get('/api/v1/contacts').set(authHeader(managerToken));
    expect(list.body.some((c) => c.email === 'stamped@contacts-suite.io')).toBe(true);
  });

  it('rejects entity-manager create for another department (403)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(managerToken))
      .send({ name: 'Sales Person', email: 'sp@contacts-suite.io', department: 'Sales' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DEPARTMENT_SCOPE');
  });

  it('blocks entity-manager patch/delete outside their department', async () => {
    const outside = await Contact.create({
      tenantId: tenant._id,
      name: 'Outside',
      email: 'outside@contacts-suite.io',
      role: 'Member',
      department: 'Sales',
      source: 'manual',
    });

    const patched = await request(app)
      .patch(`/api/v1/contacts/${outside._id}`)
      .set(authHeader(managerToken))
      .send({ name: 'Hijack' });
    expect(patched.status).toBe(403);

    const del = await request(app)
      .delete(`/api/v1/contacts/${outside._id}`)
      .set(authHeader(managerToken));
    expect(del.status).toBe(403);
  });

  it('allows entity-manager to patch contacts in their department', async () => {
    const inside = await Contact.create({
      tenantId: tenant._id,
      name: 'Inside',
      email: 'inside@contacts-suite.io',
      role: 'Member',
      department: 'Marketing',
      source: 'manual',
    });

    const patched = await request(app)
      .patch(`/api/v1/contacts/${inside._id}`)
      .set(authHeader(managerToken))
      .send({ phone: '1111111111' });
    expect(patched.status).toBe(200);
    expect(patched.body.phone).toBe('1111111111');
    expect(patched.body.department).toBe('Marketing');
  });

  it('ignores entity-manager attempts to change contact role', async () => {
    const inside = await Contact.create({
      tenantId: tenant._id,
      name: 'Role Locked',
      email: 'rolelock@contacts-suite.io',
      role: 'Member',
      department: 'Marketing',
      source: 'manual',
    });

    const patched = await request(app)
      .patch(`/api/v1/contacts/${inside._id}`)
      .set(authHeader(managerToken))
      .send({ role: 'Admin', phone: '2222222222' });
    expect(patched.status).toBe(200);
    expect(patched.body.phone).toBe('2222222222');
    expect(patched.body.role).toBe('Member');
  });

  it('forces entity-manager created contacts to Member role', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(managerToken))
      .send({ name: 'Escalator', email: 'escalate@contacts-suite.io', role: 'Admin' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('Member');
    expect(res.body.department).toBe('Marketing');
  });

  it('patches and soft-deletes a contact', async () => {
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Bob',
      email: 'bob@contacts-suite.io',
      role: 'Member',
      source: 'manual',
    });

    const patched = await request(app)
      .patch(`/api/v1/contacts/${contact._id}`)
      .set(authHeader(adminToken))
      .send({ department: 'Sales' });
    expect(patched.status).toBe(200);
    expect(patched.body.department).toBe('Sales');

    const del = await request(app)
      .delete(`/api/v1/contacts/${contact._id}`)
      .set(authHeader(adminToken));
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.body).toHaveLength(0);
  });

  it('protects Owner contact from deletion (403)', async () => {
    const owner = await Contact.create({
      tenantId: tenant._id,
      name: 'Owner',
      email: 'owner@contacts-suite.io',
      role: 'Owner',
      source: 'manual',
    });
    const res = await request(app)
      .delete(`/api/v1/contacts/${owner._id}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OWNER_PROTECTED');
  });

  it('returns 404 for unknown contact', async () => {
    const res = await request(app)
      .patch(`/api/v1/contacts/${new mongoose.Types.ObjectId()}`)
      .set(authHeader(adminToken))
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('isolates contacts across tenants', async () => {
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Secret',
      email: 'secret@contacts-suite.io',
      role: 'Member',
      source: 'manual',
    });
    const other = await makeTenant({ slug: 'contacts-other' });
    const { token } = await makeUser(other, 'company_admin', 'tenant');

    const list = await request(app).get('/api/v1/contacts').set(authHeader(token));
    expect(list.body).toHaveLength(0);

    const patch = await request(app)
      .patch(`/api/v1/contacts/${contact._id}`)
      .set(authHeader(token))
      .send({ name: 'Hijack' });
    expect(patch.status).toBe(404);
  });

  it('rejects import without a file (400)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts/import')
      .set(authHeader(adminToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('accepts a CSV import and returns job id (202)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts/import')
      .set(authHeader(adminToken))
      .attach('file', Buffer.from('name,email\nCarol,carol@contacts-suite.io\n'), {
        filename: 'contacts.csv',
        contentType: 'text/csv',
      });
    expect(res.status).toBe(202);
    expect(res.body.importJobId).toBeTruthy();
    expect(res.body.status).toBeTruthy();

    const status = await request(app)
      .get(`/api/v1/contacts/import/${res.body.importJobId}/status`)
      .set(authHeader(adminToken));
    expect(status.status).toBe(200);
    expect(status.body).toHaveProperty('status');
  });

  it('hides Merge-linked effectively INACTIVE Contacts from GET /contacts without deleting them', async () => {
    const connectionId = new mongoose.Types.ObjectId();
    const hidden = await Contact.create({
      tenantId: tenant._id,
      name: 'Ada Inactive',
      email: 'ada-inactive@contacts-suite.io',
      source: 'hris',
      mergeEmployeeId: 'emp-hidden',
      mergeConnectionId: connectionId,
      employmentStatus: 'INACTIVE',
      hrisLinkStatus: 'current',
    });
    const visible = await Contact.create({
      tenantId: tenant._id,
      name: 'Ada Active',
      email: 'ada-active@contacts-suite.io',
      source: 'hris',
      mergeEmployeeId: 'emp-visible',
      mergeConnectionId: connectionId,
      employmentStatus: 'ACTIVE',
      hrisLinkStatus: 'current',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.status).toBe(200);
    const emails = list.body.map((c) => c.email);
    expect(emails).toContain('ada-active@contacts-suite.io');
    expect(emails).not.toContain('ada-inactive@contacts-suite.io');

    const stored = await Contact.findOne({ _id: hidden._id, tenantId: tenant._id });
    expect(stored).toBeTruthy();
    expect(stored.deletedAt).toBeFalsy();
    expect(stored.mergeEmployeeId).toBe('emp-hidden');
    expect(String(stored.mergeConnectionId)).toBe(String(connectionId));
    expect(stored.employmentStatus).toBe('INACTIVE');
    expect(stored.hrisLinkStatus).toBe('current');

    const patch = await request(app)
      .patch(`/api/v1/contacts/${hidden._id}`)
      .set(authHeader(adminToken))
      .send({ name: 'Ada Inactive Updated' });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('Ada Inactive Updated');
    expect(patch.body.effectiveEmploymentStatus).toBe('INACTIVE');

    expect(await Contact.findOne({ _id: visible._id, tenantId: tenant._id })).toBeTruthy();
  });

  it('does not hide manual, CSV, or Zoho Contacts based on employment status', async () => {
    await Contact.create({
      tenantId: tenant._id,
      name: 'Manual Inactive',
      email: 'manual-inactive@contacts-suite.io',
      source: 'manual',
      employmentStatus: 'INACTIVE',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Csv Inactive',
      email: 'csv-inactive@contacts-suite.io',
      source: 'csv',
      employmentStatus: 'INACTIVE',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Zoho Inactive',
      email: 'zoho-inactive@contacts-suite.io',
      source: 'hris',
      zohoRecordId: 'z-inactive',
      employmentStatus: 'Inactive',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.status).toBe(200);
    const emails = list.body.map((c) => c.email);
    expect(emails).toEqual(
      expect.arrayContaining([
        'manual-inactive@contacts-suite.io',
        'csv-inactive@contacts-suite.io',
        'zoho-inactive@contacts-suite.io',
      ]),
    );
  });

  it('keeps stale Merge Contacts visible when they are still effectively ACTIVE', async () => {
    const connectionId = new mongoose.Types.ObjectId();
    await Contact.create({
      tenantId: tenant._id,
      name: 'Stale Active',
      email: 'stale-active@contacts-suite.io',
      source: 'hris',
      mergeEmployeeId: 'emp-stale-active',
      mergeConnectionId: connectionId,
      employmentStatus: 'ACTIVE',
      hrisLinkStatus: 'stale',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Stale Inactive',
      email: 'stale-inactive@contacts-suite.io',
      source: 'hris',
      mergeEmployeeId: 'emp-stale-inactive',
      mergeConnectionId: connectionId,
      employmentStatus: 'INACTIVE',
      hrisLinkStatus: 'stale',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.status).toBe(200);
    const emails = list.body.map((c) => c.email);
    expect(emails).toContain('stale-active@contacts-suite.io');
    expect(emails).not.toContain('stale-inactive@contacts-suite.io');

    expect(
      await Contact.countDocuments({
        tenantId: tenant._id,
        email: { $in: ['stale-active@contacts-suite.io', 'stale-inactive@contacts-suite.io'] },
      }),
    ).toBe(2);
  });
});

describe('contacts MergeHrisEmployee overlay', () => {
  async function seedConn(overrides = {}) {
    return MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'deel',
      encryptedAccountToken: encryptToken('contacts-overlay-token'),
      status: 'connected',
      connectedAt: new Date('2026-09-18T06:00:00.000Z'),
      lastSyncAt: new Date('2026-09-18T08:21:48.003Z'),
      lastSyncStatus: 'success',
      ...overrides,
    });
  }

  async function seedEmployee(conn, overrides = {}) {
    const syncedAt = overrides.lastSyncedAt ?? conn.lastSyncAt ?? new Date('2026-09-18T08:21:48.003Z');
    return MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: conn._id,
      provider: conn.provider,
      mergeEmployeeId: 'emp-sansa',
      displayName: 'Sansa Stark',
      firstName: 'Sansa',
      lastName: 'Stark',
      workEmail: 'sansa@shelfmerch.com',
      employmentStatus: 'ACTIVE',
      startDate: new Date('2026-09-18T00:00:00.000Z'),
      terminationDate: new Date('2026-09-18T00:00:00.000Z'),
      lastSyncedAt: syncedAt,
      source: 'merge',
      ...overrides,
    });
  }

  it('hides a Merge Contact from Directory INACTIVE without Contact terminationDate or Sync Now', async () => {
    const conn = await seedConn();
    await seedEmployee(conn);
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Sansa Stark',
      email: 'sansa@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-sansa',
      mergeConnectionId: conn._id,
      employmentStatus: 'ACTIVE',
      dateOfJoining: new Date('2026-09-18T00:00:00.000Z'),
      hrisLinkStatus: 'current',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.find((c) => c.email === 'sansa@shelfmerch.com')).toBeUndefined();

    const stored = await Contact.findOne({ _id: contact._id, tenantId: tenant._id });
    expect(stored).toBeTruthy();
    expect(stored.deletedAt).toBeFalsy();
    expect(stored.employmentStatus).toBe('ACTIVE');
    expect(stored.terminationDate).toBeFalsy();
    expect(stored.hrisLinkStatus).toBe('current');
    expect(stored.mergeEmployeeId).toBe('emp-sansa');
  });

  it('shows the same Contact again after employee rehire without rewriting Contact', async () => {
    const conn = await seedConn();
    const emp = await seedEmployee(conn, {
      terminationDate: new Date('2026-09-18T00:00:00.000Z'),
      startDate: new Date('2026-09-18T00:00:00.000Z'),
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Sansa Stark',
      email: 'sansa-rehire@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-sansa',
      mergeConnectionId: conn._id,
      employmentStatus: 'ACTIVE',
      dateOfJoining: new Date('2026-09-18T00:00:00.000Z'),
      hrisLinkStatus: 'current',
    });

    let list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.body.find((c) => c.email === 'sansa-rehire@shelfmerch.com')).toBeUndefined();

    emp.terminationDate = null;
    emp.startDate = new Date('2026-09-20T00:00:00.000Z');
    await emp.save();

    const before = await Contact.findOne({ _id: contact._id, tenantId: tenant._id });
    expect(before.terminationDate).toBeFalsy();
    expect(before.dateOfJoining?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(before.updatedAt?.toISOString()).toBe(contact.updatedAt?.toISOString());

    list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    const visible = list.body.find((c) => c.email === 'sansa-rehire@shelfmerch.com');
    expect(visible).toBeTruthy();
    expect(String(visible._id)).toBe(String(contact._id));
    expect(visible.effectiveEmploymentStatus).toBe('ACTIVE');
    expect(visible.hrisLinkStatus).toBe('current');

    const after = await Contact.findOne({ _id: contact._id, tenantId: tenant._id });
    expect(after.updatedAt?.toISOString()).toBe(before.updatedAt?.toISOString());
  });

  it('respects date-only termination boundary (today Active, next UTC day Inactive)', async () => {
    const conn = await seedConn();
    await seedEmployee(conn, {
      employmentStatus: 'ACTIVE',
      terminationDate: new Date('2026-09-18T00:00:00.000Z'),
      startDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Boundary',
      email: 'boundary@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-sansa',
      mergeConnectionId: conn._id,
      employmentStatus: 'ACTIVE',
      hrisLinkStatus: 'current',
    });

    const jwtUser = { userId: admin._id, role: 'company_admin', scopeType: 'tenant' };

    const onTermDay = await listContactsForUser({
      tenantId: tenant._id,
      user: jwtUser,
      now: new Date('2026-09-18T12:00:00.000Z'),
    });
    expect(onTermDay.find((c) => c.email === 'boundary@shelfmerch.com')).toBeTruthy();

    const nextDay = await listContactsForUser({
      tenantId: tenant._id,
      user: jwtUser,
      now: new Date('2026-09-19T00:00:00.000Z'),
    });
    expect(nextDay.find((c) => c.email === 'boundary@shelfmerch.com')).toBeUndefined();
  });

  it('hides immediately when Directory employee is explicitly INACTIVE', async () => {
    const conn = await seedConn();
    await seedEmployee(conn, {
      employmentStatus: 'INACTIVE',
      terminationDate: new Date('2099-06-01T00:00:00.000Z'),
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Explicit Inactive',
      email: 'explicit-inactive@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-sansa',
      mergeConnectionId: conn._id,
      employmentStatus: 'ACTIVE',
      hrisLinkStatus: 'current',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.body.find((c) => c.email === 'explicit-inactive@shelfmerch.com')).toBeUndefined();
  });

  it('does not hide using another tenant or connection employee row', async () => {
    const conn = await seedConn();
    const otherTenant = await makeTenant({ slug: 'contacts-other-overlay' });
    const otherConn = await MergeConnection.create({
      tenantId: otherTenant._id,
      connectedByUserId: (await makeUser(otherTenant, 'company_admin', 'tenant')).user._id,
      provider: 'deel',
      encryptedAccountToken: encryptToken('other-overlay-token'),
      status: 'connected',
      connectedAt: new Date(),
      lastSyncAt: new Date('2026-09-18T08:21:48.003Z'),
      lastSyncStatus: 'success',
    });
    await MergeHrisEmployee.create({
      tenantId: otherTenant._id,
      connectionId: otherConn._id,
      provider: 'deel',
      mergeEmployeeId: 'emp-sansa',
      displayName: 'Other Tenant Sansa',
      workEmail: 'other-sansa@example.com',
      employmentStatus: 'INACTIVE',
      lastSyncedAt: otherConn.lastSyncAt,
      source: 'merge',
    });

    const otherConnSameTenant = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'workday',
      encryptedAccountToken: encryptToken('workday-overlay-token'),
      status: 'connected',
      connectedAt: new Date(),
      lastSyncAt: new Date('2026-09-18T08:21:48.003Z'),
      lastSyncStatus: 'success',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: otherConnSameTenant._id,
      provider: 'workday',
      mergeEmployeeId: 'emp-sansa',
      displayName: 'Other Conn Sansa',
      workEmail: 'workday-sansa@example.com',
      employmentStatus: 'INACTIVE',
      lastSyncedAt: otherConnSameTenant.lastSyncAt,
      source: 'merge',
    });

    await Contact.create({
      tenantId: tenant._id,
      name: 'Isolated Sansa',
      email: 'isolated-sansa@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-sansa',
      mergeConnectionId: conn._id,
      employmentStatus: 'ACTIVE',
      hrisLinkStatus: 'current',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.body.find((c) => c.email === 'isolated-sansa@shelfmerch.com')).toBeTruthy();
  });

  it('falls back to Contact fields when employee is missing or Directory-stale leftover', async () => {
    const conn = await seedConn({
      lastSyncAt: new Date('2026-09-20T12:00:00.000Z'),
    });
    await seedEmployee(conn, {
      employmentStatus: 'INACTIVE',
      lastSyncedAt: new Date('2026-09-18T08:21:48.003Z'),
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Leftover Active',
      email: 'leftover-active@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-sansa',
      mergeConnectionId: conn._id,
      employmentStatus: 'ACTIVE',
      hrisLinkStatus: 'stale',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Missing Emp Inactive',
      email: 'missing-emp-inactive@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-missing',
      mergeConnectionId: conn._id,
      employmentStatus: 'INACTIVE',
      hrisLinkStatus: 'stale',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    const emails = list.body.map((c) => c.email);
    expect(emails).toContain('leftover-active@shelfmerch.com');
    expect(emails).not.toContain('missing-emp-inactive@shelfmerch.com');
  });

  it('keeps Manual/CSV/Zoho Contacts visible even when a Merge employee is INACTIVE', async () => {
    const conn = await seedConn();
    await seedEmployee(conn, { employmentStatus: 'INACTIVE', mergeEmployeeId: 'emp-other' });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Manual',
      email: 'manual-ok@shelfmerch.com',
      source: 'manual',
      employmentStatus: 'INACTIVE',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Csv',
      email: 'csv-ok@shelfmerch.com',
      source: 'csv',
      employmentStatus: 'INACTIVE',
    });
    await Contact.create({
      tenantId: tenant._id,
      name: 'Zoho',
      email: 'zoho-ok@shelfmerch.com',
      source: 'hris',
      zohoRecordId: 'z-ok',
      employmentStatus: 'Inactive',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    const emails = list.body.map((c) => c.email);
    expect(emails).toEqual(
      expect.arrayContaining([
        'manual-ok@shelfmerch.com',
        'csv-ok@shelfmerch.com',
        'zoho-ok@shelfmerch.com',
      ]),
    );
  });

  it('keeps a Directory-hidden Contact editable and addressable by ID', async () => {
    const conn = await seedConn();
    await seedEmployee(conn);
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Hidden Editable',
      email: 'hidden-editable@shelfmerch.com',
      source: 'hris',
      mergeEmployeeId: 'emp-sansa',
      mergeConnectionId: conn._id,
      employmentStatus: 'ACTIVE',
      hrisLinkStatus: 'current',
    });

    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.body.find((c) => c.email === 'hidden-editable@shelfmerch.com')).toBeUndefined();

    const patch = await request(app)
      .patch(`/api/v1/contacts/${contact._id}`)
      .set(authHeader(adminToken))
      .send({ name: 'Hidden Editable Updated', department: 'People' });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('Hidden Editable Updated');
    expect(patch.body.department).toBe('People');

    const stored = await Contact.findOne({ _id: contact._id, tenantId: tenant._id });
    expect(stored.name).toBe('Hidden Editable Updated');
    expect(stored.hrisLinkStatus).toBe('current');
    expect(stored.mergeEmployeeId).toBe('emp-sansa');
  });

  it('batches MergeHrisEmployee lookup once for many Merge-linked Contacts', async () => {
    const conn = await seedConn();
    const syncedAt = conn.lastSyncAt;
    for (let i = 0; i < 5; i += 1) {
      await MergeHrisEmployee.create({
        tenantId: tenant._id,
        connectionId: conn._id,
        provider: 'deel',
        mergeEmployeeId: `emp-batch-${i}`,
        displayName: `Batch ${i}`,
        workEmail: `batch${i}@shelfmerch.com`,
        employmentStatus: i % 2 === 0 ? 'INACTIVE' : 'ACTIVE',
        lastSyncedAt: syncedAt,
        source: 'merge',
      });
      await Contact.create({
        tenantId: tenant._id,
        name: `Batch ${i}`,
        email: `batch${i}@shelfmerch.com`,
        source: 'hris',
        mergeEmployeeId: `emp-batch-${i}`,
        mergeConnectionId: conn._id,
        employmentStatus: 'ACTIVE',
        hrisLinkStatus: 'current',
      });
    }

    const findSpy = vi.spyOn(MergeHrisEmployee, 'find');
    const list = await request(app).get('/api/v1/contacts').set(authHeader(adminToken));
    expect(list.status).toBe(200);
    expect(findSpy).toHaveBeenCalledTimes(1);
    findSpy.mockRestore();

    const emails = list.body.map((c) => c.email);
    expect(emails).toContain('batch1@shelfmerch.com');
    expect(emails).toContain('batch3@shelfmerch.com');
    expect(emails).not.toContain('batch0@shelfmerch.com');
    expect(emails).not.toContain('batch2@shelfmerch.com');
    expect(emails).not.toContain('batch4@shelfmerch.com');
  });
});
