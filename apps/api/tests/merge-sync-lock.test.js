import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import {
  acquireMergeSyncLock,
  assertMergeSyncLockOwned,
  completeMergeSyncLock,
  mergeSyncLockLostError,
  renewMergeSyncLock,
} from '../src/modules/integrations/merge/mergeSyncLock.js';

let tenant;
let user;

beforeAll(async () => {
  await connectTestDb();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'LockCo', slug: 'lock-co' });
  user = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: `lock-${Date.now()}@test.io`,
    status: 'active',
  });
});

async function seedConnection() {
  return MergeConnection.create({
    tenantId: tenant._id,
    connectedByUserId: user._id,
    provider: 'workday',
    status: 'connected',
    connectedAt: new Date(),
    lastSyncStatus: 'idle',
  });
}

describe('mergeSyncLock helpers', () => {
  it('allows only one of two simultaneous acquires to win', async () => {
    const conn = await seedConnection();
    const [a, b] = await Promise.all([
      acquireMergeSyncLock({ tenantId: tenant._id, connectionId: conn._id, leaseMs: 5000 }),
      acquireMergeSyncLock({ tenantId: tenant._id, connectionId: conn._id, leaseMs: 5000 }),
    ]);
    const won = [a, b].filter(Boolean);
    expect(won).toHaveLength(1);
    expect(won[0].token).toBeTruthy();

    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.syncLockToken).toBe(won[0].token);
    expect(stored.lastSyncStatus).toBe('syncing');
  });

  it('lets a later acquire succeed after the lease expires', async () => {
    const conn = await seedConnection();
    const first = await acquireMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      leaseMs: 1,
      now: new Date(Date.now() - 50),
    });
    expect(first).toBeTruthy();

    const second = await acquireMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      leaseMs: 5000,
    });
    expect(second).toBeTruthy();
    expect(second.token).not.toBe(first.token);
  });

  it('renews only for the owning token', async () => {
    const conn = await seedConnection();
    const acquired = await acquireMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      leaseMs: 5000,
    });
    const ok = await renewMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      token: acquired.token,
      leaseMs: 8000,
    });
    expect(ok).toBeTruthy();
    expect(ok.syncLockToken).toBe(acquired.token);

    const missed = await renewMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      token: 'other',
      leaseMs: 8000,
    });
    expect(missed).toBeNull();
  });

  it('assertMergeSyncLockOwned throws MERGE_SYNC_LOCK_LOST when the token does not match', async () => {
    const conn = await seedConnection();
    await acquireMergeSyncLock({ tenantId: tenant._id, connectionId: conn._id, leaseMs: 5000 });
    await expect(
      assertMergeSyncLockOwned({
        tenantId: tenant._id,
        connectionId: conn._id,
        token: 'nope',
      }),
    ).rejects.toMatchObject({ code: 'MERGE_SYNC_LOCK_LOST', status: 409 });
    expect(mergeSyncLockLostError().code).toBe('MERGE_SYNC_LOCK_LOST');
  });

  it('completeMergeSyncLock does not overwrite a different owner', async () => {
    const conn = await seedConnection();
    const acquired = await acquireMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      leaseMs: 5000,
    });
    await MergeConnection.updateOne(
      { _id: conn._id, tenantId: tenant._id },
      { $set: { syncLockToken: 'b-owner', lastSyncStatus: 'syncing' } },
    );

    const missed = await completeMergeSyncLock({
      tenantId: tenant._id,
      connectionId: conn._id,
      token: acquired.token,
      fields: { lastSyncStatus: 'failed', lastError: 'SYNC_FAILED' },
    });
    expect(missed).toBeNull();

    const stored = await MergeConnection.findOne({ _id: conn._id, tenantId: tenant._id });
    expect(stored.syncLockToken).toBe('b-owner');
    expect(stored.lastSyncStatus).toBe('syncing');
    expect(stored.lastError).toBe('');
  });
});
