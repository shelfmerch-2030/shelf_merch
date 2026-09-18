import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

let app;
let tenant;
let adminToken;
let managerToken;
let managerUser;
let marketingEntity;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'contacts-suite' });
  ({ token: adminToken } = await makeUser(tenant, 'company_admin', 'tenant'));

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
});
