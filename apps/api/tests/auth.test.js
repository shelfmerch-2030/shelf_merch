import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader } from './helpers.js';
import { createApp } from '../src/app.js';
import { JWT_ACCESS_AUDIENCE, JWT_ISSUER } from '../src/config/jwt.js';
import { User } from '../src/modules/users/user.model.js';
import { PasswordResetToken } from '../src/modules/auth/passwordResetToken.model.js';
import { signAccessToken, issueRefreshToken } from '../src/modules/auth/auth.service.js';
import crypto from 'node:crypto';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('authentication — JWT & session', () => {
  it('rejects missing Authorization header with 401', async () => {
    const res = await request(app).get('/api/v1/wallets');
    expect(res.status).toBe(401);
    expect(res.body.error?.code || res.body.error).toBeTruthy();
  });

  it('rejects a malformed Bearer token with 401', async () => {
    const res = await request(app)
      .get('/api/v1/wallets')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects an access token signed with the wrong secret', async () => {
    const tenant = await makeTenant({ slug: 'jwt-wrong' });
    const { user, assignment } = await makeUser(tenant, 'company_admin', 'tenant');
    const forged = jwt.sign(
      {
        sub: String(user._id),
        tenantId: String(tenant._id),
        role: assignment.role,
        scopeType: assignment.scopeType,
        assignedEntityIds: [],
      },
      'wrong-secret-value-xxxxxx',
      { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_ACCESS_AUDIENCE, expiresIn: '15m' },
    );
    const res = await request(app).get('/api/v1/wallets').set(authHeader(forged));
    expect(res.status).toBe(401);
  });

  it('rejects an expired access token with 401', async () => {
    const tenant = await makeTenant({ slug: 'jwt-exp' });
    const { user, assignment } = await makeUser(tenant, 'company_admin', 'tenant');
    const expired = signAccessToken(user, assignment, null, { expiresIn: '-10s' });
    const res = await request(app).get('/api/v1/wallets').set(authHeader(expired));
    expect(res.status).toBe(401);
  });

  it('accepts a valid access token and attaches tenant context', async () => {
    const tenant = await makeTenant({ slug: 'jwt-ok' });
    const { token } = await makeUser(tenant, 'company_admin', 'tenant');
    const res = await request(app).get('/api/v1/wallets').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('authentication — login & role assignment', () => {
  it('login returns access + refresh tokens and company_admin role', async () => {
    const tenant = await makeTenant({ slug: 'login-ok' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@login-ok.io',
      password: 'correct-horse-1',
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@login-ok.io', password: 'correct-horse-1' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.role).toBe('company_admin');
    expect(res.body.user.tenantId).toBe(String(tenant._id));
  });

  it('login rejects wrong password with INVALID_CREDENTIALS', async () => {
    const tenant = await makeTenant({ slug: 'login-bad' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@login-bad.io',
      password: 'correct-horse-1',
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@login-bad.io', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login rejects suspended (disabled) users with ACCOUNT_SUSPENDED', async () => {
    const tenant = await makeTenant({ slug: 'login-susp' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@login-susp.io',
      password: 'correct-horse-1',
      status: 'suspended',
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@login-susp.io', password: 'correct-horse-1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('login rejects invited users who have not accepted', async () => {
    const tenant = await makeTenant({ slug: 'login-inv' });
    await makeUser(tenant, 'entity_manager', 'entity', {
      email: 'mgr@login-inv.io',
      password: 'correct-horse-1',
      status: 'invited',
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'mgr@login-inv.io', password: 'correct-horse-1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVITE_PENDING');
  });

  it('validation rejects login without email/password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('authentication — refresh token', () => {
  it('refresh rotates tokens; old refresh token cannot be reused', async () => {
    const tenant = await makeTenant({ slug: 'refresh-ok' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@refresh-ok.io',
      password: 'correct-horse-1',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@refresh-ok.io', password: 'correct-horse-1' });
    expect(login.status).toBe(200);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(replay.status).toBe(401);
  });

  it('rejects an invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'deadbeef'.repeat(12) });
    expect(res.status).toBe(401);
  });

  it('rejects refresh when the user is no longer active', async () => {
    const tenant = await makeTenant({ slug: 'refresh-susp' });
    const { user } = await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@refresh-susp.io',
      password: 'correct-horse-1',
    });
    const refreshToken = await issueRefreshToken(user._id);
    await User.updateOne({ _id: user._id }, { status: 'suspended' });

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const tenant = await makeTenant({ slug: 'logout-ok' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@logout-ok.io',
      password: 'correct-horse-1',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@logout-ok.io', password: 'correct-horse-1' });

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(200);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('authentication — password reset', () => {
  it('forgot-password is idempotent for unknown emails (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.io' });
    expect(res.status).toBe(200);
  });

  it('forgot-password + reset-password round trip', async () => {
    const tenant = await makeTenant({ slug: 'reset-ok' });
    const { user } = await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@reset-ok.io',
      password: 'correct-horse-1',
    });

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'admin@reset-ok.io' });
    expect(forgot.status).toBe(200);

    // Tests stub email — pull the hashed token from DB and forge a matching raw token.
    // forgotPassword stores sha256(token); recreate by writing a known token.
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await PasswordResetToken.deleteMany({ userId: user._id });
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const bad = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-the-token', newPassword: 'NewPassw0rd!' });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: raw, newPassword: 'NewPassw0rd!' });
    expect(ok.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@reset-ok.io', password: 'correct-horse-1' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@reset-ok.io', password: 'NewPassw0rd!' });
    expect(newLogin.status).toBe(200);
  });

  it('does not issue a reset token for suspended users', async () => {
    const tenant = await makeTenant({ slug: 'reset-susp' });
    const { user } = await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@reset-susp.io',
      password: 'correct-horse-1',
      status: 'suspended',
    });
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'admin@reset-susp.io' })
      .expect(200);
    const count = await PasswordResetToken.countDocuments({ userId: user._id });
    expect(count).toBe(0);
  });
});

describe('authentication — tenant isolation via JWT', () => {
  it('token for tenant A cannot list tenant B wallets', async () => {
    const tenantA = await makeTenant({ slug: 'iso-a' });
    const tenantB = await makeTenant({ slug: 'iso-b' });
    const { token: tokenA } = await makeUser(tenantA, 'company_admin', 'tenant');
    const { token: tokenB } = await makeUser(tenantB, 'company_admin', 'tenant');

    // Seed a wallet only in B via direct model — A must not see it.
    const { Wallet } = await import('../src/modules/wallets/wallet.model.js');
    await Wallet.create({ tenantId: tenantB._id, name: 'B only' });

    const listA = await request(app).get('/api/v1/wallets').set(authHeader(tokenA));
    expect(listA.status).toBe(200);
    expect(listA.body).toHaveLength(0);

    const listB = await request(app).get('/api/v1/wallets').set(authHeader(tokenB));
    expect(listB.body).toHaveLength(1);
    expect(listB.body[0].name).toBe('B only');
  });
});
