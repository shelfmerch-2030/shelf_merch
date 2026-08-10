import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { PasswordResetToken } from '../src/modules/auth/passwordResetToken.model.js';
import { RefreshToken } from '../src/modules/auth/refreshToken.model.js';
import {
  hashPassword,
  issueRefreshToken,
  signAccessToken,
} from '../src/modules/auth/auth.service.js';
import { makeUser, uniqueEmail } from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function seedLoginUser({ status = 'active', tenantStatus = 'active' } = {}) {
  const tenant = await Tenant.create({
    name: 'Auth Co',
    slug: `auth-${Date.now()}`,
    status: tenantStatus,
  });
  const email = uniqueEmail('auth');
  const password = 'demo1234';
  const user = await User.create({
    tenantId: tenant._id,
    name: 'Auth User',
    email,
    passwordHash: await hashPassword(password),
    status,
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: user._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  return { tenant, user, assignment, email, password, token: signAccessToken(user, assignment) };
}

describe('authentication — account status & tokens', () => {
  it('rejects login for suspended user with ACCOUNT_SUSPENDED', async () => {
    const { email, password } = await seedLoginUser({ status: 'suspended' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rejects login for invited user with INVITE_PENDING', async () => {
    const { email } = await seedLoginUser({ status: 'invited' });
    // invited users may lack passwordHash; set one so we don't hit INVALID_CREDENTIALS first
    await User.updateOne(
      { email },
      { passwordHash: await hashPassword('demo1234'), status: 'invited' },
    );
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'demo1234' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVITE_PENDING');
  });

  it('rejects refresh when user is no longer active', async () => {
    const { user, password, email } = await seedLoginUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);

    user.status = 'suspended';
    await user.save();

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('rejects invalid refresh tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'definitely-not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('logout revokes the presented refresh token', async () => {
    const { email, password } = await seedLoginUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(200);
    expect(logout.body.success).toBe(true);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('rejects malformed JWT on protected routes', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects expired JWT on protected routes', async () => {
    const { user, assignment } = await seedLoginUser();
    const expired = signAccessToken(user, assignment, null, { expiresIn: '0s' });
    // allow clock to move past 0s
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('authentication — password reset', () => {
  it('forgot-password always returns success and creates a reset token for known users', async () => {
    const { email, user } = await seedLoginUser();
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const count = await PasswordResetToken.countDocuments({ userId: user._id });
    expect(count).toBe(1);

    // Unknown email still 200 (no enumeration)
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@test.io' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.success).toBe(true);
  });

  it('validates and consumes a reset token, then allows login with the new password', async () => {
    const { email, user } = await seedLoginUser();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const validate = await request(app)
      .get('/api/v1/auth/reset-password/validate')
      .query({ token: rawToken });
    expect(validate.status).toBe(200);
    expect(validate.body.valid).toBe(true);
    expect(validate.body.email).toBe(email);

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, newPassword: 'NewPass1!' });
    expect(reset.status).toBe(200);
    expect(reset.body.success).toBe(true);

    const loginOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'demo1234' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'NewPass1!' });
    expect(loginNew.status).toBe(200);

    const reused = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, newPassword: 'Another1!' });
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toMatch(/RESET_TOKEN/);
  });

  it('rejects invalid reset tokens on validate', async () => {
    const res = await request(app)
      .get('/api/v1/auth/reset-password/validate')
      .query({ token: 'deadbeef' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });
});

describe('authentication — RBAC middleware smoke', () => {
  it('entity manager is forbidden from users.invite (tenantArea users write)', async () => {
    const tenant = await Tenant.create({ name: 'RBAC', slug: `rbac-${Date.now()}` });
    const { token } = await makeUser(tenant, 'entity_manager', 'entity');
    const res = await request(app)
      .post('/api/v1/users/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Noop',
        email: uniqueEmail('invitee'),
        role: 'entity_manager',
        scopeType: 'entity',
      });
    expect(res.status).toBe(403);
  });

  it('issues refresh token records that logout(everywhere) can revoke', async () => {
    const { user, email, password } = await seedLoginUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    // second session
    await issueRefreshToken(user._id);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .send({ everywhere: true, refreshToken: login.body.refreshToken });
    // logout does not authenticate — everywhere without userId only revokes presented token
    expect(logout.status).toBe(200);

    // Direct service path: everywhere with userId clears DB refresh tokens
    const { logout: logoutSvc } = await import('../src/modules/auth/auth.service.js');
    await logoutSvc({ everywhere: true, userId: user._id });
    const open = await RefreshToken.countDocuments({ userId: user._id, revokedAt: null });
    expect(open).toBe(0);
  });
});
