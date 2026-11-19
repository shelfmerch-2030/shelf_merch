import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { notify } from '../src/modules/notifications/notifications.service.js';
import { sendRedemptionInviteEmail } from '../src/services/email.service.js';
import { ensureRedisReady } from '../src/config/redis.js';
import { getNotificationQueue } from '../src/jobs/queues.js';
import { env } from '../src/config/env.js';

vi.mock('../src/services/email.service.js', async original => ({
  ...await original(), sendRedemptionInviteEmail: vi.fn(async () => ({ success: true, provider: 'test' })),
}));
vi.mock('../src/config/redis.js', async original => ({ ...await original(), ensureRedisReady: vi.fn() }));
vi.mock('../src/jobs/queues.js', async original => ({ ...await original(), getNotificationQueue: vi.fn() }));
const previous = env.NODE_ENV;
const payload = { type: 'redemption_invite', email: 'approved@example.test', title: 'Approved',
  link: '/redeem/isolated-token', meta: { recipientName: 'Approved' } };
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { env.NODE_ENV = previous; vi.mocked(sendRedemptionInviteEmail).mockResolvedValue({ success: true, provider: 'test' }); });

it('durable invitations call direct email delivery without Redis enqueue or fallback', async () => {
  await notify(payload, { durableInvitation: true });
  expect(sendRedemptionInviteEmail).toHaveBeenCalledTimes(1);
  expect(ensureRedisReady).not.toHaveBeenCalled();
  expect(getNotificationQueue).not.toHaveBeenCalled();
});

it('uncertain direct submission propagates its error without another attempt', async () => {
  vi.mocked(sendRedemptionInviteEmail).mockRejectedValueOnce(new Error('Synthetic lost acknowledgement'));
  await expect(notify(payload, { durableInvitation: true })).rejects.toThrow('Synthetic lost acknowledgement');
  expect(sendRedemptionInviteEmail).toHaveBeenCalledTimes(1);
  expect(ensureRedisReady).not.toHaveBeenCalled();
  expect(getNotificationQueue).not.toHaveBeenCalled();
});

it('missing local/production SMTP configuration cannot report a stub as a sent invitation', async () => {
  env.NODE_ENV = 'development';
  await expect(notify(payload, { durableInvitation: true })).rejects.toMatchObject({ code: 'INVITATION_DELIVERY_UNAVAILABLE' });
  expect(sendRedemptionInviteEmail).not.toHaveBeenCalled();
});

it('the direct invitation option cannot be used for other notification channels', async () => {
  await expect(notify({ ...payload, phone: 'synthetic' }, { durableInvitation: true })).rejects.toMatchObject({ code: 'INVITATION_PAYLOAD_INVALID' });
  expect(sendRedemptionInviteEmail).not.toHaveBeenCalled();
});

it('the email helper failure result is not mistaken for provider acknowledgement', async () => {
  vi.mocked(sendRedemptionInviteEmail).mockResolvedValueOnce({ success: false, provider: 'smtp' });
  await expect(notify(payload, { durableInvitation: true })).rejects.toMatchObject({ code: 'INVITATION_ACK_UNCERTAIN' });
  expect(sendRedemptionInviteEmail).toHaveBeenCalledTimes(1);
  expect(ensureRedisReady).not.toHaveBeenCalled();
});
