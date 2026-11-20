import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./api', () => ({ apiFetch: vi.fn(), ApiError: class extends Error {} }));
import { apiFetch } from './api';
import { launchPointsCampaignApi } from './mutations-api';

const mocked = vi.mocked(apiFetch);
const hash = 'a'.repeat(64);
const payload = { entityId: 'entity', shopId: 'shop', name: 'Approved', creditsPerRecipient: 250,
  message: { from: 'Team', body: 'Approved' }, recipients: [{ name: 'Approved', email: 'approved@example.test' }] };
beforeEach(() => mocked.mockReset());

it('passes the allocation snapshot to the existing REST launch call', async () => {
  mocked.mockResolvedValueOnce({ _id: 'campaign', status: 'draft' })
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ launchReviewHash: hash })
    .mockResolvedValueOnce({ _id: 'campaign', name: 'Approved', type: 'points', status: 'redemption_open' });
  await launchPointsCampaignApi(payload);
  const call = mocked.mock.calls.find(([url]) => String(url).endsWith('/launch'));
  expect(call).toBeTruthy();
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ expectedLaunchHash: hash, paymentMode: 'wallet' });
});

it('uses the reviewed update snapshot for an existing allocated campaign', async () => {
  mocked.mockResolvedValueOnce({ _id: 'campaign', status: 'approved' })
    .mockResolvedValueOnce({ launchReviewHash: hash })
    .mockResolvedValueOnce({ _id: 'campaign', name: 'Approved', type: 'points', status: 'redemption_open' });
  await launchPointsCampaignApi({ ...payload, campaignId: 'campaign' });
  expect(mocked.mock.calls.some(([url]) => String(url).includes('allocate-credits'))).toBe(false);
  expect(JSON.parse(String(mocked.mock.calls.at(-1)?.[1]?.body)).expectedLaunchHash).toBe(hash);
});

it('does not launch when the server provides no review evidence', async () => {
  mocked.mockResolvedValueOnce({ _id: 'campaign', status: 'draft' })
    .mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ status: 'approved' });
  await expect(launchPointsCampaignApi(payload)).rejects.toThrow('Review the campaign again');
  expect(mocked.mock.calls.some(([url]) => String(url).endsWith('/launch'))).toBe(false);
});

it('propagates a rejected stale launch without automatically retrying it', async () => {
  mocked.mockResolvedValueOnce({ _id: 'campaign', status: 'approved' })
    .mockResolvedValueOnce({ launchReviewHash: hash }).mockRejectedValueOnce(new Error('Launch details changed'));
  await expect(launchPointsCampaignApi({ ...payload, campaignId: 'campaign' })).rejects.toThrow('Launch details changed');
  expect(mocked.mock.calls.filter(([url]) => String(url).endsWith('/launch'))).toHaveLength(1);
});
