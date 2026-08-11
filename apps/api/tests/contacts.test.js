import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader } from './helpers.js';
import { createApp } from '../src/app.js';
import { Contact } from '../src/modules/contacts/contact.model.js';

let app;
let tenant;
let adminToken;
let managerToken;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'contacts-suite' });
  ({ token: adminToken } = await makeUser(tenant, 'company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser(tenant, 'entity_manager', 'entity'));
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

  it('allows entity managers to write contacts (RBAC matrix)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(managerToken))
      .send({ name: 'X', email: 'x@contacts-suite.io' });
    expect(res.status).toBe(201);
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
