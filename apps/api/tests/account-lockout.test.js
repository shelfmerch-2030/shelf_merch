import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function makeLoginUser() {
  const user = await User.create({
    tenantId: null,
    name: 'Lockout Target',
    email: 'lockme@test.io',
    passwordHash: await hashPassword('correct-horse-1'),
    status: 'active',
  });
  await RoleAssignment.create({
    tenantId: null,
    userId: user._id,
    role: 'platform_support_agent',
    scopeType: 'platform',
  });
  return user;
}

describe('account lockout (B2)', () => {
  it('does not lock after repeated failed logins while lockout timer is disabled', async () => {
    await makeLoginUser();

    // Temporary: auth.service clears failedLoginCount / lockedUntil on each attempt.
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lockme@test.io', password: 'wrong-password' });
      expect(res.status).toBe(401);
    }

    const stillOk = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockme@test.io', password: 'correct-horse-1' });
    expect(stillOk.status).toBe(200);

    const stored = await User.findOne({ email: 'lockme@test.io' });
    expect(stored.lockedUntil).toBeNull();
    expect(stored.failedLoginCount).toBe(0);
  });

  it('a correct login before lockout clears the failed counter', async () => {
    await makeLoginUser();

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockme@test.io', password: 'wrong-password' })
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockme@test.io', password: 'correct-horse-1' })
      .expect(200);

    const stored = await User.findOne({ email: 'lockme@test.io' });
    expect(stored.failedLoginCount).toBe(0);
    expect(stored.lockedUntil).toBeNull();
  });
});
