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
it('does not prepare the old revision again while a restored review completes and current state refreshes', () => {
  const prepare = vi.fn();
  const props = { state, busy: false, pending: true, error: null, hasCatalog: true, change: vi.fn(), prepare, edit: vi.fn(), upload: vi.fn() };
  const view = render(<SwagWorkflowPanel {...props} />);
  view.rerender(<SwagWorkflowPanel {...props} pending={false} />);
  expect(prepare).not.toHaveBeenCalled();
  view.rerender(<SwagWorkflowPanel {...props} pending={false} state={{ ...state, revision: state.revision + 1, artwork: 'saved', designReady: true }} />);
  expect(prepare).not.toHaveBeenCalled();
});
it('Confirm Apply is the single explicit artwork execution approval', async () => {
  render(<CopilotConfirmationCard artifact={artifact} onChange={vi.fn()} />);
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }));
  await waitFor(() => expect(api.executeCopilotWriteApi).toHaveBeenCalledWith('swag.collection', expect.objectContaining({ action: 'apply', revision: 3 })));
  expect(screen.queryByRole('button', { name: 'Confirm & Publish' })).not.toBeInTheDocument();
});
it('partial application identifies unchanged products and requires an explicit supported-products click', () => {
  render(<CopilotConfirmationCard artifact={{ ...artifact, preview: { ...artifact.preview, application: {
    requestedAll: true, targets: [{ productId: 'p1', name: 'Polo', areaLabel: 'Left chest' }], manual: [{ productId: 'p2', name: 'Engraved mug' }] } } }} onChange={vi.fn()} />);
  expect(screen.getByText(/Manual design required: Engraved mug/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Apply to 1 supported product only' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm Apply' })).not.toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'Looks good' })); expect(props.change).toHaveBeenCalledWith({ step: 'stores' });
  expect(screen.queryByRole('button', { name: 'Reload saved design' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Edit Placement' })).toHaveAttribute('href', expect.stringContaining('/swag/new?edit=saved'));
});
it('offers resuming a saved, unapplied upload without claiming saved mockups already exist', () => {
  const props = panel({ ...state, artwork: 'saved', designReady: false, persisted: true, hasUnsavedChanges: false });
  fireEvent.click(screen.getByRole('button', { name: 'Apply uploaded logo' }));
  expect(props.change).toHaveBeenCalledWith({ artwork: 'upload' });
  expect(screen.queryByText(/Here are your saved product mockups/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Looks good' })).toBeDisabled();
});
it('shows committed application targets inline', () => {
  render(<CopilotWriteSuccess artifact={{ kind: 'success', operation: 'swag.collection', message: 'Ignored stale text',
    result: { action: 'apply', name: 'Welcome Kit', published: false, application: { targets: [{ productId: 'p1' }] },
      products: [{ id: 'p1', name: 'Polo' }], designs: [{ productId: 'p1', mockupUrl: '/uploads/committed.png' }] } }} />);
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

it('avoids duplicating the composer logo and restores one verified source preview after reload', () => {
  const props = { state: { ...state, artworkPreviewUrl: '/uploads/source-logo.png' }, busy: false, pending: false, error: null, hasCatalog: true,
    change: vi.fn(), prepare: vi.fn(), edit: vi.fn(), upload: vi.fn() };
  const view = render(<SwagWorkflowPanel {...props} uploadedArtwork={{ id: 'logo', name: 'company-logo.png' }} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  view.rerender(<SwagWorkflowPanel {...props} />);
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByAltText('Uploaded logo, not yet applied')).toHaveAttribute('src', '/uploads/source-logo.png');
});
it('keeps save receipt details collapsed and offers current draft continuation and unapplied-logo action', () => {
  const resume = vi.fn(), apply = vi.fn();
  render(<CopilotWriteSuccess artifact={{ kind: 'success', operation: 'swag.collection', message: 'Recorded', result: {
    action: 'save', name: 'Welcome Kit', productCount: 2, published: false, artworkStatus: 'Uploaded, not applied',
  } }} onContinueSwag={resume} onApplyLogo={apply} />);
  expect(screen.getByText('Design saved')).toBeVisible();
  expect(screen.getByText(/2 products . Draft/)).toBeVisible();
  expect(screen.getByText(/Your logo is uploaded but/)).toBeVisible();
  expect(screen.getByText('Saved operation details').closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Continue designing' })); expect(resume).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Apply logo' })); expect(apply).toHaveBeenCalledTimes(1);
});
it('does not infer an uploaded logo from an unbranded saved draft', () => {
  render(<CopilotWriteSuccess artifact={{ kind: 'success', operation: 'swag.collection', message: 'Recorded',
    result: { action: 'save', name: 'Team', published: false, artworkStatus: 'Not applied', productCount: 1 } }} onApplyLogo={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Apply logo' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Your logo is uploaded/)).not.toBeInTheDocument();
  expect(screen.getByText(/1 product · Draft/)).toBeVisible();
});
