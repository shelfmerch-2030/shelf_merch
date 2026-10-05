import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { MergeConnection } from '../src/modules/integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../src/modules/integrations/merge/models/mergeHrisEmployee.model.js';
import { deriveHrisDirectoryStatus } from '../src/modules/integrations/merge/hrisDirectoryStatus.js';

const TODAY = '2026-10-05T08:38:00.000Z';
const STALE = '2026-09-30T10:29:00.000Z';

describe('deriveHrisDirectoryStatus', () => {
  it('uses the active connection latest successful sync', () => {
    expect(
      deriveHrisDirectoryStatus([
        { status: 'connected', lastSyncStatus: 'success', lastSyncAt: TODAY },
      ]),
    ).toEqual({
      state: 'connected',
      lastSuccessfulSyncAt: TODAY,
      retainSnapshot: false,
    });
  });

  it('keeps the same timestamp for webhook, scheduled, and manual success', () => {
    for (const lastSyncAt of [TODAY, '2026-10-05T09:00:00.000Z', '2026-10-05T10:15:00.000Z']) {
      expect(
        deriveHrisDirectoryStatus([
          { status: 'connected', lastSyncStatus: 'success', lastSyncAt },
        ]).lastSuccessfulSyncAt,
      ).toBe(lastSyncAt);
    }
  });

  it('shows a disconnected snapshot only when every current connection is disconnected', () => {
    expect(
      deriveHrisDirectoryStatus([
        { status: 'disconnected', lastSyncStatus: 'idle', lastSyncAt: STALE },
      ]),
    ).toEqual({
      state: 'disconnected',
      lastSuccessfulSyncAt: STALE,
      retainSnapshot: true,
    });
  });

  it('ignores a historical disconnected row when a provider is connected', () => {
    expect(
      deriveHrisDirectoryStatus([
        { status: 'disconnected', lastSyncStatus: 'idle', lastSyncAt: STALE },
        { status: 'connected', lastSyncStatus: 'success', lastSyncAt: TODAY },
      ]),
    ).toEqual({
      state: 'connected',
      lastSuccessfulSyncAt: TODAY,
      retainSnapshot: false,
    });
  });

  it('shows syncing with the previous successful timestamp', () => {
    expect(
      deriveHrisDirectoryStatus([
        { status: 'connected', lastSyncStatus: 'syncing', lastSyncAt: TODAY },
      ]),
    ).toEqual({
      state: 'syncing',
      lastSuccessfulSyncAt: TODAY,
      retainSnapshot: false,
    });
  });

  it('shows an initial sync as pending or in progress when none has succeeded', () => {
    expect(
      deriveHrisDirectoryStatus([
        { status: 'connected', lastSyncStatus: 'idle', lastSyncAt: null },
      ]),
    ).toMatchObject({ state: 'connected', lastSuccessfulSyncAt: null, retainSnapshot: false });
    expect(
      deriveHrisDirectoryStatus([
        { status: 'connected', lastSyncStatus: 'queued', lastSyncAt: null },
      ]),
    ).toMatchObject({ state: 'syncing', lastSuccessfulSyncAt: null });
  });

  it('does not let a disconnected timestamp fill in for a connection that has never synced', () => {
    expect(
      deriveHrisDirectoryStatus([
        { status: 'disconnected', lastSyncStatus: 'idle', lastSyncAt: STALE },
        { status: 'connected', lastSyncStatus: 'idle', lastSyncAt: null },
      ]),
    ).toEqual({
      state: 'connected',
      lastSuccessfulSyncAt: null,
      retainSnapshot: false,
    });
  });

  it('reports error when the only current connection needs attention', () => {
    expect(
      deriveHrisDirectoryStatus([
        { status: 'needs_attention', lastSyncStatus: 'failed', lastSyncAt: STALE },
      ]).state,
    ).toBe('error');
  });
});

describe('GET /api/integrations/merge/employees directory status', () => {
  let app;
  let tenant;
  let adminToken;

  beforeAll(async () => {
    await connectTestDb();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    tenant = await Tenant.create({ name: 'Rubix', slug: `rubix-dir-${Date.now()}` });
    const admin = await User.create({
      tenantId: tenant._id,
      name: 'Admin',
      email: `admin-${Date.now()}@test.io`,
      status: 'active',
    });
    const assignment = await RoleAssignment.create({
      tenantId: tenant._id,
      userId: admin._id,
      role: 'company_admin',
      scopeType: 'tenant',
    });
    adminToken = signAccessToken(admin, assignment);
  });

  it('uses the connected provider sync time when an older disconnected provider remains', async () => {
    const adminId = (await User.findOne({ tenantId: tenant._id }))._id;
    const gusto = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: adminId,
      provider: 'gusto',
      status: 'connected',
      lastSyncStatus: 'success',
      lastSyncAt: new Date(TODAY),
    });
    const workday = await MergeConnection.create({
      tenantId: tenant._id,
      connectedByUserId: adminId,
      provider: 'workday',
      status: 'disconnected',
      lastSyncStatus: 'idle',
      lastSyncAt: new Date(STALE),
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: gusto._id,
      provider: 'gusto',
      mergeEmployeeId: 'gusto-1',
      displayName: 'Gusto Person',
      workEmail: 'gusto@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: new Date(TODAY),
      source: 'merge',
    });
    await MergeHrisEmployee.create({
      tenantId: tenant._id,
      connectionId: workday._id,
      provider: 'workday',
      mergeEmployeeId: 'workday-1',
      displayName: 'Workday Person',
      workEmail: 'workday@rubix.net',
      employmentStatus: 'ACTIVE',
      lastSyncedAt: new Date(STALE),
      source: 'merge',
    });

    const res = await request(app)
      .get('/api/integrations/merge/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.employees).toHaveLength(2);
    expect(res.body.directory).toEqual({
      state: 'connected',
      lastSuccessfulSyncAt: TODAY,
      retainSnapshot: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('account_token');
  });
});
