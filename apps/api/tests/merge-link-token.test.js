import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as envModule from '../src/config/env.js';
import { MERGE_CREATE_LINK_TOKEN_URL } from '../src/modules/integrations/merge/merge.constants.js';

let app;
let tenant;
let admin;
let adminToken;
let managerToken;
let fetchMock;

async function makeUser(role, scopeType) {
  const user = await User.create({
    tenantId: tenant._id,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: user._id,
    role,
    scopeType,
  });
  return { user, token: signAccessToken(user, assignment) };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'mergeConfigured').mockReturnValue(true);
  envModule.env.MERGE_API_KEY = 'test-merge-api-key';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix-merge' });
  ({ user: admin, token: adminToken } = await makeUser('company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser('entity_manager', 'entity'));
  fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ link_token: 'link-token-test-abc' }),
  });
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('POST /api/integrations/merge/link-token', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/integrations/merge/link-token').send({});
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects entity managers (admin-only write)', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported integration identifiers', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'not-a-real-hris' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a link token for the authenticated tenant without integration', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      linkToken: 'link-token-test-abc',
    });
    expect(JSON.stringify(res.body)).not.toContain('test-merge-api-key');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(MERGE_CREATE_LINK_TOKEN_URL);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-merge-api-key');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.end_user_organization_name).toBe('Rubix');
    expect(body.end_user_email_address).toBe(admin.email);
    expect(body.categories).toEqual(['hris']);
    expect(body).not.toHaveProperty('integration');
    // Catalog sessions use a unique origin id so they never collide with an existing HRIS link.
    expect(body.end_user_origin_id).toMatch(new RegExp(`^${tenant._id}:hris:`));
  });

  it('forwards a verified integration slug with a provider-scoped origin id', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'bamboohr' });

    expect(res.status).toBe(200);
    expect(res.body.linkToken).toBe('link-token-test-abc');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.integration).toBe('bamboohr');
    expect(body.end_user_origin_id).toBe(`${tenant._id}:hris:bamboohr`);
  });

  it('scopes Gusto origin id as tenantId:hris:gusto', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'gusto' });

    expect(res.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.integration).toBe('gusto');
    expect(body.end_user_origin_id).toBe(`${tenant._id}:hris:gusto`);
  });

  it('scopes Google Workspace origin id as tenantId:directory:google-workspace', async () => {
    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'google-workspace' });

    expect(res.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.integration).toBe('google-workspace');
    expect(body.categories).toEqual(['hris']);
    expect(body.end_user_origin_id).toBe(`${tenant._id}:directory:google-workspace`);
  });

  it('reuses stored Google Workspace directory origin id on reconnect', async () => {
    const { MergeConnection } = await import(
      '../src/modules/integrations/merge/mergeConnection.model.js'
    );
    const originId = `${tenant._id}:directory:google-workspace`;
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'google-workspace',
      category: 'directory',
      status: 'disconnected',
      endUserOriginId: originId,
    });

    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'google-workspace' });

    expect(res.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.end_user_origin_id).toBe(originId);
  });


  it('reuses stored endUserOriginId on reconnect for the same provider', async () => {
    const { MergeConnection } = await import(
      '../src/modules/integrations/merge/mergeConnection.model.js'
    );
    const originId = `${tenant._id}:hris:workday`;
    await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: admin._id,
      provider: 'workday',
      encryptedAccountToken: '',
      endUserOriginId: originId,
      status: 'needs_attention',
      connectedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'workday' });

    expect(res.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.end_user_origin_id).toBe(originId);
  });

  it('uses distinct origin ids so Deel and Workday can coexist', async () => {
    const deel = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'deel' });
    const workday = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'workday' });

    expect(deel.status).toBe(200);
    expect(workday.status).toBe(200);
    const deelOrigin = JSON.parse(fetchMock.mock.calls[0][1].body).end_user_origin_id;
    const workdayOrigin = JSON.parse(fetchMock.mock.calls[1][1].body).end_user_origin_id;
    expect(deelOrigin).toBe(`${tenant._id}:hris:deel`);
    expect(workdayOrigin).toBe(`${tenant._id}:hris:workday`);
    expect(deelOrigin).not.toBe(workdayOrigin);
  });

  it('uses distinct origin ids so Gusto and Deel can coexist', async () => {
    const gusto = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'gusto' });
    const deel = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ integration: 'deel' });

    expect(gusto.status).toBe(200);
    expect(deel.status).toBe(200);
    const gustoOrigin = JSON.parse(fetchMock.mock.calls[0][1].body).end_user_origin_id;
    const deelOrigin = JSON.parse(fetchMock.mock.calls[1][1].body).end_user_origin_id;
    expect(gustoOrigin).toBe(`${tenant._id}:hris:gusto`);
    expect(deelOrigin).toBe(`${tenant._id}:hris:deel`);
    expect(gustoOrigin).not.toBe(deelOrigin);
  });

  it('maps Merge 4xx to a safe 502 without leaking secrets', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid API key secret-value' }),
    });

    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('MERGE_AUTH_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('secret-value');
    expect(JSON.stringify(res.body)).not.toContain('test-merge-api-key');
  });

  it('returns 503 when Merge is not configured', async () => {
    envModule.mergeConfigured.mockReturnValueOnce(false);

    const res = await request(app)
      .post('/api/integrations/merge/link-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('MERGE_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
