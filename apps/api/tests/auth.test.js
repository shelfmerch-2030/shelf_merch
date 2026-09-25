import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader, allowlistAuthEmails, refreshTokenFromResponse } from './helpers.js';
import { RefreshToken } from '../src/modules/auth/refreshToken.model.js';
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
    expect(res.body.refreshToken).toBeUndefined();
    expect(refreshTokenFromResponse(res)).toBeTruthy();
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
  it('sets an HttpOnly refresh cookie and does not return the token to JavaScript', async () => {
    const tenant = await makeTenant({ slug: 'refresh-cookie' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@refresh-cookie.io',
      password: 'correct-horse-1',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@refresh-cookie.io', password: 'correct-horse-1' });
    expect(login.status).toBe(200);
    expect(login.body.refreshToken).toBeUndefined();
    const cookie = []
      .concat(login.headers['set-cookie'] || [])
      .find((entry) => entry.startsWith('sm_refresh='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/(?:;|$)/);
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/Max-Age=86400(?:;|$)/);
    const stored = await RefreshToken.findOne({ userId: login.body.user.id });
    expect(stored.tokenHash).toBeTruthy();
    expect(stored.tokenHash).not.toBe(refreshTokenFromResponse(login));
    const day = 24 * 60 * 60 * 1000;
    const remaining = stored.expiresAt.getTime() - Date.now();
    expect(remaining).toBeGreaterThan(day - 5000);
    expect(remaining).toBeLessThanOrEqual(day);
  });

  it('clears a legacy Path=/api/v1/auth refresh cookie when issuing a new one', async () => {
    const tenant = await makeTenant({ slug: 'refresh-legacy-path' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@refresh-legacy-path.io',
      password: 'correct-horse-1',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@refresh-legacy-path.io', password: 'correct-horse-1' });
    expect(login.status).toBe(200);

    const cookies = [].concat(login.headers['set-cookie'] || []);
    const live = cookies.filter((entry) => entry.startsWith('sm_refresh=') && !/Max-Age=0(?:;|$)/i.test(entry));
    const cleared = cookies.find((entry) => /Path=\/api\/v1\/auth/i.test(entry));

    expect(live).toHaveLength(1);
    expect(live[0]).toMatch(/Path=\/(?:;|$)/);
    expect(live[0]).not.toMatch(/Path=\/api\/v1\/auth/i);
    expect(cleared).toMatch(/^sm_refresh=;/);
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cleared).toMatch(/HttpOnly/i);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(login)}`);
    const rotatedCookies = [].concat(refreshed.headers['set-cookie'] || []);
    const rotatedLive = rotatedCookies.filter(
      (entry) => entry.startsWith('sm_refresh=') && !/Max-Age=0(?:;|$)/i.test(entry),
    );
    expect(rotatedLive).toHaveLength(1);
    expect(rotatedLive[0]).toMatch(/Path=\/(?:;|$)/);
    expect(rotatedCookies.some((entry) => /Path=\/api\/v1\/auth/i.test(entry) && /Max-Age=0/i.test(entry))).toBe(true);
  });

  it('rejects a refresh token after its 24 hour lifetime', async () => {
    const tenant = await makeTenant({ slug: 'refresh-expired' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@refresh-expired.io',
      password: 'correct-horse-1',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@refresh-expired.io', password: 'correct-horse-1' });
    await RefreshToken.updateMany(
      { userId: login.body.user.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(login)}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

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
    const firstRefresh = refreshTokenFromResponse(login);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${firstRefresh}`);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeUndefined();
    const rotated = refreshTokenFromResponse(refreshed);
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(firstRefresh);

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${firstRefresh}`);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_IN_PROGRESS');

    const current = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${rotated}`);
    expect(current.status).toBe(200);
  });

  it('replay after the grace window revokes every device session', async () => {
    const tenant = await makeTenant({ slug: 'refresh-replay' });
    const { user } = await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@refresh-replay.io',
      password: 'correct-horse-1',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@refresh-replay.io', password: 'correct-horse-1' });
    const firstRefresh = refreshTokenFromResponse(login);
    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${firstRefresh}`);
    const rotated = refreshTokenFromResponse(refreshed);

    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: { $ne: null } },
      { revokedAt: new Date(Date.now() - 60_000) },
    );

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${firstRefresh}`);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');
    expect(replay.body.error.message).toBe('Your session expired. Please sign in again.');

    const killed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${rotated}`);
    expect(killed.status).toBe(401);

    const saved = await User.findById(user._id).select('sessionVersion');
    expect(saved.sessionVersion).toBe(1);
  });

  it('keeps a second device signed in when the first device logs out', async () => {
    const tenant = await makeTenant({ slug: 'refresh-devices' });
    await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'admin@refresh-devices.io',
      password: 'correct-horse-1',
    });
    const laptop = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'Chrome-Laptop')
      .send({ email: 'admin@refresh-devices.io', password: 'correct-horse-1' });
    const phone = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'Mobile-Safari')
      .send({ email: 'admin@refresh-devices.io', password: 'correct-horse-1' });
    const laptopToken = refreshTokenFromResponse(laptop);
    const phoneToken = refreshTokenFromResponse(phone);
    expect(laptopToken).not.toBe(phoneToken);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `sm_refresh=${laptopToken}`);
    expect(logout.status).toBe(200);

    const laptopRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${laptopToken}`);
    expect(laptopRefresh.status).toBe(401);

    const phoneRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${phoneToken}`);
    expect(phoneRefresh.status).toBe(200);

    const everywhere = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${phoneRefresh.body.accessToken}`)
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(phoneRefresh)}`)
      .send({ everywhere: true });
    expect(everywhere.status).toBe(200);

    const after = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(phoneRefresh)}`);
    expect(after.status).toBe(401);
    expect(after.body.error.message).toBe('Your session expired. Please sign in again.');
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
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(login)}`);
    expect(logout.status).toBe(200);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(login)}`);
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
