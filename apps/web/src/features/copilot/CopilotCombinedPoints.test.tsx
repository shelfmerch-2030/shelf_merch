// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CopilotConfirmationCard, CopilotWriteSuccess } from './CopilotConfirmationCard';
import type { CopilotConfirmationArtifact } from './api';
import * as api from './api';
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(),
  resolveCopilotWriteApi: vi.fn(), executeCopilotWriteApi: vi.fn(), cancelCopilotWriteApi: vi.fn(), persistCopilotWriteArtifactApi: vi.fn() }));
const preview = { combined: true, currency: 'INR', currencyMode: 'points', campaignName: 'Approved celebration',
  shopName: 'AI Store', recipientCount: 2, creditsPerRecipient: 250, totalBudget: 500,
  recipientIdentities: [{ name: 'Ada', email: 'ada@example.test' }, { name: 'Lin', email: 'lin@example.test' }],
  fundingSource: 'organization_unallocated', fundingName: 'Operating wallet', pointsScope: 'shop', deliveryMode: 'now',
  walletImpact: { unallocatedBefore: 8000, unallocatedAfter: 7500 } };
const artifact: CopilotConfirmationArtifact = { kind: 'confirmation', operation: 'campaigns.send_points',
  confirmationId: 'combined-confirmation-1234567890', status: 'pending', preview, request: { name: 'Approved celebration' } };
const result = { ...preview, recipientIdentities: undefined, walletImpact: undefined, id: 'campaign', status: 'redemption_open',
  outcome: 'completed', walletDebited: true, debitedAmountInr: 500, unallocatedAmount: 7500,
  invitationStatus: 'acknowledged', invitationsAcknowledged: 2 };
beforeEach(() => {
  vi.mocked(api.resolveCopilotWriteApi).mockReset().mockResolvedValue({ status: 'pending', confirmationId: artifact.confirmationId });
  vi.mocked(api.executeCopilotWriteApi).mockReset().mockResolvedValue(result);
  vi.mocked(api.cancelCopilotWriteApi).mockReset().mockResolvedValue({ status: 'cancelled', confirmationId: artifact.confirmationId });
  vi.mocked(api.persistCopilotWriteArtifactApi).mockReset().mockResolvedValue({} as never);
});
afterEach(cleanup);

it('shows one compact final preview and verified identities with one send button', () => {
  render(<CopilotConfirmationCard artifact={artifact} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Confirm & Send Points' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  expect(screen.getByText('500 Points · ₹250')).toBeInTheDocument();
  expect(screen.getByText('Ada · ada@example.test')).toBeInTheDocument();
  expect(screen.getByText('Lin · lin@example.test')).toBeInTheDocument();
  expect(screen.getByText('Operating wallet')).toBeInTheDocument();
  expect(screen.queryByText(/Draft|Allocation|Required at launch/)).not.toBeInTheDocument();
});

it('simultaneous clicks call one execute using the confirmation-stable key', async () => {
  const onChange = vi.fn();
  render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  await waitFor(() => expect(api.resolveCopilotWriteApi).toHaveBeenCalledTimes(1));
  const button = screen.getByRole('button', { name: 'Confirm & Send Points' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success', result })));
  expect(api.executeCopilotWriteApi).toHaveBeenCalledTimes(1);
  expect(api.executeCopilotWriteApi).toHaveBeenCalledWith('campaigns.send_points', expect.objectContaining({ idempotencyKey: `send:${artifact.confirmationId}` }));
});

it('Cancel never executes the operation', async () => {
  const onChange = vi.fn(); render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' })));
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});

it('a lost HTTP response resolves authoritative completion without a second execute', async () => {
  vi.mocked(api.executeCopilotWriteApi).mockRejectedValueOnce(new Error('Network interrupted'));
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValueOnce({ status: 'pending', confirmationId: artifact.confirmationId })
    .mockResolvedValue({ status: 'completed', confirmationId: artifact.confirmationId, result });
  const onChange = vi.fn(); render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  await waitFor(() => expect(api.resolveCopilotWriteApi).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send Points' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success', result })));
  expect(api.executeCopilotWriteApi).toHaveBeenCalledTimes(1);
});

it('reload recovers completion read-only and does not request confirmation again', async () => {
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: 'completed', confirmationId: artifact.confirmationId, result });
  const onChange = vi.fn(); render(<CopilotConfirmationCard artifact={artifact} onChange={onChange} />);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success', result })));
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});

it('only explicit resume of a server-proven partial send uses the original key', async () => {
  const progress = { ...result, status: 'approved', walletDebited: false, outcome: 'recovery_required', invitationStatus: 'requires_review' };
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: 'failed', confirmationId: artifact.confirmationId, progress, canResume: true });
  const onChange = vi.fn(); render(<CopilotConfirmationCard artifact={{ ...artifact, status: 'failed', canResume: true, progress }} onChange={onChange} />);
  await waitFor(() => expect(api.resolveCopilotWriteApi).toHaveBeenCalledTimes(1));
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Recorded send progress')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Resume confirmed send' }));
  await waitFor(() => expect(api.executeCopilotWriteApi).toHaveBeenCalledWith('campaigns.send_points', expect.objectContaining({ idempotencyKey: `send:${artifact.confirmationId}` })));
});

it.each(['acknowledged', 'scheduled', 'unresolved', 'pending', 'self_share'])('shows actual %s status without claiming email delivery', status => {
  render(<CopilotWriteSuccess artifact={{ kind: 'success', operation: 'campaigns.send_points', message: 'Recorded', result: { ...result, invitationStatus: status } }} />);
  expect(screen.queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument();
  expect(screen.getByText('Invitation submissions acknowledged')).toBeInTheDocument();
  expect(screen.queryByText(/emails delivered|points delivered/i)).not.toBeInTheDocument();
});

it('an in-progress response cannot ask for another confirmation and status checks remain read-only', async () => {
  const progress = { ...result, status: 'approved', outcome: 'in_progress', walletDebited: false };
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValueOnce({ status: 'consumed', confirmationId: artifact.confirmationId, progress, canResume: false })
    .mockResolvedValue({ status: 'completed', confirmationId: artifact.confirmationId, result });
  const onChange = vi.fn();
  render(<CopilotConfirmationCard artifact={{ ...artifact, status: 'consumed', progress }} onChange={onChange} />);
  expect(screen.queryByRole('button', { name: 'Confirm & Send Points' })).not.toBeInTheDocument();
  await waitFor(() => expect(api.resolveCopilotWriteApi).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Check send status' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success', result })));
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
