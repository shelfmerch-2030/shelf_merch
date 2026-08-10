import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { makeUser, seedTenantWorkspace, uniqueEmail } from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('contacts API', () => {
  it('CRUD happy path for company admin', async () => {
    const { token, tenant } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const email = uniqueEmail('contact');

    const created = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ada Lovelace', email, role: 'Member', department: 'Eng' });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe(email);
    expect(String(created.body.tenantId)).toBe(String(tenant._id));

    const list = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/v1/contacts/${created.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ department: 'Research' });
    expect(patched.status).toBe(200);
    expect(patched.body.department).toBe('Research');

    const removed = await request(app)
      .delete(`/api/v1/contacts/${created.body._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    const after = await Contact.find({ tenantId: tenant._id });
    expect(after).toHaveLength(0);
  });

  it('protects Owner contact from delete and validates create body', async () => {
    const { token, tenant } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const owner = await Contact.create({
      tenantId: tenant._id,
      name: 'Owner',
      email: uniqueEmail('owner'),
      role: 'Owner',
      source: 'manual',
    });

    const del = await request(app)
      .delete(`/api/v1/contacts/${owner._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe('OWNER_PROTECTED');

    const bad = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'not-an-email' });
    expect(bad.status).toBe(400);
  });

  it('allows entity manager write and enforces tenant isolation', async () => {
    const a = await seedTenantWorkspace({
      name: 'A',
      slug: `c-a-${Date.now()}`,
      fundAmount: 0,
      withEntity: false,
    });
    const b = await seedTenantWorkspace({
      name: 'B',
      slug: `c-b-${Date.now()}`,
      fundAmount: 0,
      withEntity: false,
    });
    const contact = await Contact.create({
      tenantId: a.tenant._id,
      name: 'Secret',
      email: uniqueEmail('secret'),
      role: 'Member',
    });

    const { token: mgr } = await makeUser(a.tenant, 'entity_manager', 'entity');
    const created = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${mgr}`)
      .send({ name: 'Mgr Contact', email: uniqueEmail('mgrc') });
    expect(created.status).toBe(201);
    expect(String(created.body.tenantId)).toBe(String(a.tenant._id));

    const crossPatch = await request(app)
      .patch(`/api/v1/contacts/${contact._id}`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ name: 'Hacked' });
    expect(crossPatch.status).toBe(404);

    const listB = await request(app)
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${b.token}`);
    expect(listB.body).toHaveLength(0);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/contacts');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown contact', async () => {
    const { token } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const res = await request(app)
      .patch('/api/v1/contacts/aaaaaaaaaaaaaaaaaaaaaaaa')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});
