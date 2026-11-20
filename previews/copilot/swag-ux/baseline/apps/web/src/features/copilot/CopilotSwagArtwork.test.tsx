// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SwagWorkflowPanel } from './SwagWorkflowPanel';
import { CopilotConfirmationCard, CopilotWriteSuccess } from './CopilotConfirmationCard';
import type { SwagState } from './swagApi';
import type { CopilotConfirmationArtifact } from './api';
import * as api from './api';
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), executeCopilotWriteApi: vi.fn(),
  resolveCopilotWriteApi: vi.fn(), cancelCopilotWriteApi: vi.fn(), persistCopilotWriteArtifactApi: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: 'pending', confirmationId: 'artwork-confirmation-1234567890' });
  vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({} as never);
  vi.mocked(api.executeCopilotWriteApi).mockResolvedValue({ action: 'apply', published: false, name: 'Welcome Kit', status: 'ready',
    application: { targets: [{ productId: 'p1', name: 'Polo', areaLabel: 'Left chest' }] } });
});
const state: SwagState = { conversationId: 'conversation', revision: 3, name: 'Welcome Kit', active: true, step: 'design',
  products: [{ id: 'p1', name: 'Polo' }, { id: 'p2', name: 'Mug' }], productIds: ['p1','p2'], stores: [], shopIds: [],
  artwork: 'upload', artworkStatus: 'Logo uploaded', artworkName: 'company-logo.png', artworkAttachmentId: 'logo',
  designs: [], designReady: false, persisted: false, hasUnsavedChanges: true, automaticArtworkAvailable: true };
function panel(value = state, pending = false) {
  const props = { state: value, busy: pending, pending, error: null, hasCatalog: true, change: vi.fn(), prepare: vi.fn().mockResolvedValue(undefined), edit: vi.fn().mockResolvedValue(undefined), upload: vi.fn() };
  render(<SwagWorkflowPanel {...props} />); return props;
}
const artifact: CopilotConfirmationArtifact = { kind: 'confirmation', operation: 'swag.collection', status: 'pending', confirmationId: 'artwork-confirmation-1234567890',
  request: { conversationId: 'conversation', revision: 3, action: 'apply' }, preview: { action: 'apply', name: 'Welcome Kit',
    products: state.products, artworkStatus: 'Uploaded, not applied', application: { requestedAll: true, targets: [
      { productId: 'p1', name: 'Polo', areaLabel: 'Left chest' }, { productId: 'p2', name: 'Mug', areaLabel: 'Front' }], manual: [], preserved: [] } } };
it('automatically prepares a bound review after upload but never executes without an Apply click', async () => {
  const props = panel(); await waitFor(() => expect(props.prepare).toHaveBeenCalledWith('apply'));
  expect(props.prepare).toHaveBeenCalledTimes(1); expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Edit Placement' })).not.toBeInTheDocument();
});
it('Apply to All is the single explicit execution approval and is separate from Publish', async () => {
  render(<CopilotConfirmationCard artifact={artifact} onChange={vi.fn()} />);
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply to All' }));
  await waitFor(() => expect(api.executeCopilotWriteApi).toHaveBeenCalledWith('swag.collection', expect.objectContaining({ action: 'apply', revision: 3 })));
  expect(screen.queryByRole('button', { name: 'Confirm & Publish' })).not.toBeInTheDocument();
});
it('partial application identifies unchanged products and requires an explicit supported-products click', () => {
  render(<CopilotConfirmationCard artifact={{ ...artifact, preview: { ...artifact.preview, application: {
    requestedAll: true, targets: [{ productId: 'p1', name: 'Polo', areaLabel: 'Left chest' }], manual: [{ productId: 'p2', name: 'Engraved mug' }] } } }} onChange={vi.fn()} />);
  expect(screen.getByText('Engraved mug')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply to 1 supported product only' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apply to All' })).not.toBeInTheDocument();
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it('Choose Products cancels the old review and updates the same backend state', async () => {
  const props = panel(state, true); fireEvent.click(screen.getByRole('button', { name: 'Choose Products' }));
  expect(props.edit).toHaveBeenCalledWith('design');
});
it('subset controls change authoritative product identities and expose deliberate replacement approval', async () => {
  const props = panel(); fireEvent.click(screen.getByRole('button', { name: 'Choose Products' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Polo' }));
  expect(props.change).toHaveBeenCalledWith({ artworkProductIds: ['p2'] });
  fireEvent.click(screen.getByRole('checkbox', { name: /Replace existing designs/ }));
  expect(props.change).toHaveBeenCalledWith({ replaceArtwork: true });
});
it('saved previews lead directly to stores without requiring Save or Reload', () => {
  const props = panel({ ...state, artwork: 'saved', designReady: true, persisted: true, hasUnsavedChanges: false,
    collectionId: 'saved', editorPath: '/swag/new?edit=saved', designs: [{ productId: 'p1', mockupUrl: '/uploads/actual-saved.png' }] });
  expect(screen.getByAltText('Saved design for Polo')).toHaveAttribute('src', '/uploads/actual-saved.png');
  fireEvent.click(screen.getByRole('button', { name: 'Looks Good / Continue' })); expect(props.change).toHaveBeenCalledWith({ step: 'stores' });
  expect(screen.queryByRole('button', { name: 'Reload saved design' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Edit Placement' })).toHaveAttribute('href', expect.stringContaining('/swag/new?edit=saved'));
});
it('offers resuming a saved, unapplied upload without claiming saved mockups already exist', () => {
  const props = panel({ ...state, artwork: 'saved', designReady: false, persisted: true, hasUnsavedChanges: false });
  fireEvent.click(screen.getByRole('button', { name: 'Apply uploaded logo' }));
  expect(props.change).toHaveBeenCalledWith({ artwork: 'upload' });
  expect(screen.queryByText(/Here are your saved product mockups/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Looks Good / Continue' })).toBeDisabled();
});
it('saved outcome text uses committed application targets and marks older previews as snapshots', () => {
  render(<CopilotWriteSuccess artifact={{ kind: 'success', operation: 'swag.collection', message: 'Ignored stale text',
    result: { action: 'apply', name: 'Welcome Kit', published: false, application: { targets: [{ productId: 'p1' }] },
      products: [{ id: 'p1', name: 'Polo' }], designs: [{ productId: 'p1', mockupUrl: '/uploads/committed.png' }] } }} />);
  expect(screen.getByText(/I've applied your logo to 1 product/)).toBeInTheDocument();
  expect(screen.getByText(/Saved at completion/)).toBeInTheDocument();
  expect(screen.getByAltText('Saved design for Polo')).toHaveAttribute('src', '/uploads/committed.png');
});
it('does not automatically recreate a dismissed Apply review after reload', async () => {
  const prepare = vi.fn();
  render(<SwagWorkflowPanel state={state} busy={false} pending={false} error={null} hasCatalog artworkReviewState="dismissed"
    change={vi.fn()} prepare={prepare} edit={vi.fn()} upload={vi.fn()} />);
  expect(prepare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review artwork application' })); expect(prepare).toHaveBeenCalledWith('apply');
});
it('keeps an uncertain Apply unresolved and never prepares or executes another application', () => {
  const prepare = vi.fn();
  render(<SwagWorkflowPanel state={state} busy={false} pending={false} error={null} hasCatalog artworkReviewState="unverified"
    change={vi.fn()} prepare={prepare} edit={vi.fn()} upload={vi.fn()} />);
  expect(prepare).not.toHaveBeenCalled(); expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Review artwork application' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Choose Products' })).toBeDisabled();
});
it('status checks can resolve a known failed Apply without executing it again', async () => {
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: 'failed', confirmationId: artifact.confirmationId });
  const change = vi.fn();
  render(<CopilotConfirmationCard artifact={{ ...artifact, status: 'consumed' }} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check artwork status' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' })));
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
