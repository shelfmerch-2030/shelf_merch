import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { makeUser, seedTenantWorkspace, uniqueEmail } from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('notifications API', () => {
  it('lists only the current user notifications and supports unread filter', async () => {
    const a = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const b = await makeUser(a.tenant, 'company_admin', 'tenant', {
      email: uniqueEmail('admin2'),
    });

    await Notification.create([
      {
        tenantId: a.tenant._id,
        userId: a.user._id,
        type: 'campaign_launched',
        title: 'Mine unread',
        read: false,
      },
      {
        tenantId: a.tenant._id,
        userId: a.user._id,
        type: 'order_status_changed',
        title: 'Mine read',
        read: true,
      },
      {
        tenantId: a.tenant._id,
        userId: b.user._id,
        type: 'campaign_launched',
        title: 'Other user',
        read: false,
      },
    ]);

    const all = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${a.token}`);
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.items.every((n) => String(n.userId) === String(a.user._id))).toBe(true);

    const unread = await request(app)
      .get('/api/v1/notifications')
      .query({ unread: true })
      .set('Authorization', `Bearer ${a.token}`);
    expect(unread.body.items).toHaveLength(1);
    expect(unread.body.items[0].title).toBe('Mine unread');
  });

  it('marks one notification read and mark-all-read', async () => {
    const { tenant, user, token } = await seedTenantWorkspace({
      fundAmount: 0,
      withEntity: false,
    });
    const [n1, n2] = await Notification.create([
      {
        tenantId: tenant._id,
        userId: user._id,
        type: 'campaign_launched',
        title: 'One',
        read: false,
      },
      {
        tenantId: tenant._id,
        userId: user._id,
        type: 'campaign_launched',
        title: 'Two',
        read: false,
      },
    ]);

    const one = await request(app)
      .patch(`/api/v1/notifications/${n1._id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(one.status).toBe(200);
    expect(one.body.read).toBe(true);

    const all = await request(app)
      .patch('/api/v1/notifications/mark-all-read')
      .set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.success).toBe(true);

    const fresh = await Notification.findById(n2._id);
    expect(fresh.read).toBe(true);
  });

  it('returns 404 when marking another user notification', async () => {
    const a = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const b = await makeUser(a.tenant, 'company_admin', 'tenant');
    const n = await Notification.create({
      tenantId: a.tenant._id,
      userId: a.user._id,
      type: 'campaign_launched',
      title: 'Private',
      read: false,
    });

    const res = await request(app)
      .patch(`/api/v1/notifications/${n._id}/read`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});
