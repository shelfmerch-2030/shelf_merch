import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import {
  makeUser,
  seedTenantWorkspace,
  uniqueEmail,
} from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('users API — invite, list, changeRole', () => {
  it('company admin can invite, list, and change role', async () => {
    const { tenant, token, entity } = await seedTenantWorkspace({ fundAmount: 0 });
    const email = uniqueEmail('invitee');

    const invite = await request(app)
      .post('/api/v1/users/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Manager',
        email,
        role: 'entity_manager',
        scopeType: 'entity',
        scopeId: String(entity._id),
        assignedEntityIds: [String(entity._id)],
      });
    expect(invite.status).toBe(201);
    expect(invite.body.email || invite.body.user?.email || email).toBeTruthy();

    const invited = await User.findOne({ email });
    expect(invited.status).toBe('invited');

    const list = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((u) => u.email === email)).toBe(true);

    const role = await request(app)
      .patch(`/api/v1/users/${invited._id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'company_admin',
        scopeType: 'tenant',
        assignedEntityIds: [],
      });
    expect(role.status).toBe(200);
    expect(role.body.role).toBe('company_admin');

    const assignment = await RoleAssignment.findOne({
      tenantId: tenant._id,
      userId: invited._id,
    });
    expect(assignment.role).toBe('company_admin');
  });

  it('rejects invalid invite payloads', async () => {
    const { token } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const res = await request(app)
      .post('/api/v1/users/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'bad', role: 'entity_manager' });
    expect(res.status).toBe(400);
  });

  it('entity manager cannot invite users (RBAC)', async () => {
    const { tenant, entity } = await seedTenantWorkspace({ fundAmount: 0 });
    const { token } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
    });
    const res = await request(app)
      .post('/api/v1/users/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Nope',
        email: uniqueEmail('nope'),
        role: 'entity_manager',
        scopeType: 'entity',
        scopeId: String(entity._id),
        assignedEntityIds: [String(entity._id)],
      });
    expect(res.status).toBe(403);
  });

  it('blocks role change during impersonation', async () => {
    const { tenant, entity } = await seedTenantWorkspace({ fundAmount: 0 });
    const target = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
    });
    const platform = await makeUser(null, 'platform_super_admin', 'platform');
    const impersonationToken = signAccessToken(
      platform.user,
      {
        tenantId: tenant._id,
        role: 'platform_super_admin',
        scopeType: 'platform',
        scopeId: null,
        assignedEntityIds: [],
      },
      { isImpersonating: true, originalUserId: String(platform.user._id) },
    );

    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}/role`)
      .set('Authorization', `Bearer ${impersonationToken}`)
      .send({
        role: 'company_admin',
        scopeType: 'tenant',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/impersonation/i);
  });

  it('tenant isolation on user list', async () => {
    const a = await seedTenantWorkspace({
      name: 'A',
      slug: `u-a-${Date.now()}`,
      fundAmount: 0,
      withEntity: false,
    });
    const b = await seedTenantWorkspace({
      name: 'B',
      slug: `u-b-${Date.now()}`,
      fundAmount: 0,
      withEntity: false,
    });

    const list = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${b.token}`);
    expect(list.status).toBe(200);
    expect(list.body.every((u) => u.email !== a.user.email)).toBe(true);
  });

  it('returns 404 when changing role of unknown user', async () => {
    const { token } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const res = await request(app)
      .patch('/api/v1/users/aaaaaaaaaaaaaaaaaaaaaaaa/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'company_admin', scopeType: 'tenant' });
    expect(res.status).toBe(404);
  });
});
