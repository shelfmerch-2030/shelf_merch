// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { projectSwagTimeline, visibleMessage } from './swagTimeline';
import { SwagStepMessage } from './SwagStepMessage';
import { CopilotArtifacts } from './CopilotProductCards';
import { CopilotConfirmationCard } from './CopilotConfirmationCard';
import type { SwagState } from './swagApi';
import type { CopilotMessage } from './api';
import * as api from './api';
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), executeCopilotWriteApi: vi.fn(), resolveCopilotWriteApi: vi.fn(), persistCopilotWriteArtifactApi: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const product = { id: '1234567890abcdef12345678', name: 'ActiveDry Polo', primaryImageUrl: '/uploads/verified-polo.png', sellingPriceInr: 650 };
const state: SwagState = { conversationId: 'a', revision: 2, active: true, name: 'Team', step: 'products', productIds: [], products: [], stores: [], shopIds: [], artwork: null, artworkStatus: 'No artwork selected', designs: [], designReady: false, persisted: false, hasUnsavedChanges: true, automaticArtworkAvailable: true };
const step = (revision = 2, conversationId = 'a'): CopilotMessage => ({ role: 'assistant', content: 'Choose products.', uiEventId: `step:${conversationId}:${revision}`, artifacts: [{ kind: 'swag_step', swag: { revision, conversationId, step: 'products' } }] });
function controls(value = state, overrides = {}) {
  const props = { state: value, busy: false, hasCatalog: false, hasComposerLogo: false, change: vi.fn().mockResolvedValue(undefined), prepare: vi.fn().mockResolvedValue(undefined), edit: vi.fn(), browse: vi.fn(), search: vi.fn(), upload: vi.fn(), ...overrides };
  render(<SwagStepMessage {...props} />); return props;
}
it.each(['', '   ', '\n'])('hides an empty internal assistant turn (%j) without deleting its protocol record', content => {
  const message: CopilotMessage = { role: 'assistant', content };
  expect(visibleMessage(message)).toBe(false); expect(message.content).toBe(content);
});
it('keeps a working streaming placeholder visible as a loading turn', () => {
  expect(visibleMessage({ role: 'assistant', content: '', streaming: true })).toBe(true);
});
it('only the newest acknowledged revision exposes active stage controls', () => {
  const messages = [step(1), { role: 'user' as const, content: 'Add polo' }, step(2)];
  const projected = projectSwagTimeline(messages, state);
  expect(projected.map(row => row.active)).toEqual([false,false,true]);
  expect(projectSwagTimeline(messages, { ...state, revision: 3 }).some(row => row.active)).toBe(false);
});
it('does not bind delayed messages to a different conversation with the same revision', () => {
  expect(projectSwagTimeline([step(2,'a')], { ...state, conversationId: 'b' })[0].active).toBe(false);
});
it('renders the appended result once while keeping original approval history immutable', () => {
  const messages: CopilotMessage[] = [{ role: 'assistant', content: 'Please approve', artifacts: [{ kind: 'confirmation', operation: 'swag.collection', status: 'completed', confirmationId: 'receipt-123456789012345' }] },
    { role: 'assistant', content: 'Saved!', uiEventId: 'swag:receipt:receipt-123456789012345', artifacts: [{ kind: 'success', operation: 'swag.collection', message: 'Saved!', confirmationId: 'receipt-123456789012345', result: { id: product.id } }] }];
  const before = JSON.stringify(messages); const projected = projectSwagTimeline(messages, state);
  expect(projected[0].earlierReceipt).toBe(true); expect(projected[0].artifacts).toEqual([]);
  expect(projected[1].artifacts.filter(a => a.kind === 'success')).toHaveLength(1);
  expect(JSON.stringify(messages)).toBe(before);
});
it('offers explicit browsing and composer search without a duplicate form or current-design panel', () => {
  const props = controls();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue with selected products' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show products' })); expect(props.browse).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Search for something specific' })); expect(props.search).toHaveBeenCalledTimes(1);
});
it('displays a repeated pending approval once without claiming that the earlier preview completed', () => {
  const review: CopilotMessage = { role: 'assistant', content: 'Approve', artifacts: [{ kind: 'confirmation', operation: 'swag.collection', confirmationId: 'pending-123456789012345', status: 'pending' }] };
  const rows = projectSwagTimeline([review, { ...review, uiEventId: 'later' }], state);
  expect(rows[0].artifacts).toEqual([]); expect(rows[0].earlierReview).toBe(true); expect(rows[0].earlierReceipt).toBe(false);
  expect(rows[1].artifacts).toHaveLength(1);
});
it('keeps the canonical receipt visible when an older preview arrives after it', () => {
  const confirmationId = 'late-preview-123456789012345';
  const messages: CopilotMessage[] = [{ role: 'assistant', content: 'Applied', uiEventId: `swag:receipt:${confirmationId}`, artifacts: [{ kind: 'success', operation: 'swag.collection', message: 'Applied', confirmationId, result: { action: 'apply' } }] },
    { role: 'assistant', content: 'Earlier preview', artifacts: [{ kind: 'confirmation', operation: 'swag.collection', confirmationId, status: 'completed' }] }];
  const rows = projectSwagTimeline(messages, state);
  expect(rows[0].artifacts).toHaveLength(1); expect(rows[0].artifacts[0].kind).toBe('success');
  expect(rows[1].artifacts).toEqual([]); expect(rows[1].earlierReceipt).toBe(true);
});
it('cannot continue a browsing gallery without a valid backend selection', () => {
  controls(state, { hasCatalog: true });
  expect(screen.getByRole('button', { name: 'Continue with selected products' })).toBeDisabled();
});
it('selection acknowledgement and Continue use only backend-returned product identities', () => {
  const props = controls({ ...state, productIds: [product.id], products: [product] });
  expect(screen.getByText('1 product added')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue with selected products' })); expect(props.change).toHaveBeenCalledWith({ step: 'artwork' });
  fireEvent.click(screen.getByRole('button', { name: `Remove ${product.name} from selection` })); expect(props.change).toHaveBeenCalledWith({ removeProductIds: [product.id] });
});
it('logo actions reuse the existing picker and do not claim application on upload', () => {
  const props = controls({ ...state, step: 'artwork', productIds: [product.id], products: [product] });
  fireEvent.click(screen.getByRole('button', { name: 'Upload logo' })); expect(props.upload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Skip logo' })); expect(props.change).toHaveBeenCalledWith({ artwork: 'none' });
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it('Apply to all only prepares a review and never executes from stage navigation or hydration', () => {
  const props = controls({ ...state, step: 'design', artwork: 'upload' });
  expect(props.prepare).not.toHaveBeenCalled(); expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply to all' })); expect(props.prepare).toHaveBeenCalledWith('apply');
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it('subset and replacement controls update the authorized state and require a separate review click', () => {
  const second = { id: 'abcdef123456789012345678', name: 'Mug' };
  const props = controls({ ...state, step: 'design', artwork: 'upload', productIds: [product.id,second.id], products: [product,second] }, { mode: 'targets' });
  fireEvent.click(screen.getByRole('checkbox', { name: product.name })); expect(props.change).toHaveBeenCalledWith({ interaction: 'targets', artworkProductIds: [second.id] });
  fireEvent.click(screen.getByRole('checkbox', { name: /Replace existing designs/ })); expect(props.change).toHaveBeenCalledWith({ interaction: 'targets', replaceArtwork: true });
  expect(props.prepare).not.toHaveBeenCalled();
});
it('shows one fallback uploaded logo, suppressing it when the composer already shows it', () => {
  const value = { ...state, step: 'design' as const, artwork: 'upload' as const, artworkPreviewUrl: '/uploads/source.png' };
  const props = { state: value, busy: false, hasCatalog: false, hasComposerLogo: true, change: vi.fn(), prepare: vi.fn(), edit: vi.fn(), browse: vi.fn(), search: vi.fn(), upload: vi.fn() };
  const view = render(<SwagStepMessage {...props} />); expect(screen.queryByRole('img')).not.toBeInTheDocument();
  view.rerender(<SwagStepMessage {...props} hasComposerLogo={false} />); expect(screen.getAllByRole('img')).toHaveLength(1);
});
it('reviews persisted product mockups and continues without Save or Reload controls', () => {
  const props = controls({ ...state, step: 'design', artwork: 'saved', designReady: true, products: [product], productIds: [product.id], designs: [{ productId: product.id, mockupUrl: '/uploads/saved.png' }] });
  expect(screen.getByAltText(`Saved design for ${product.name}`)).toHaveAttribute('src', '/uploads/saved.png');
  fireEvent.click(screen.getByRole('button', { name: 'Looks good' })); expect(props.change).toHaveBeenCalledWith({ step: 'stores' });
  expect(screen.queryByRole('button', { name: /Reload/ })).not.toBeInTheDocument();
});
it('resumes a saved conversation through a new acknowledged metadata event', () => {
  const props = controls({ ...state, step: 'design' }, { mode: 'paused' });
  fireEvent.click(screen.getByRole('button', { name: 'Continue designing' })); expect(props.change).toHaveBeenCalledWith({ step: 'design', interaction: 'resume' });
  expect(props.prepare).not.toHaveBeenCalled(); expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it('offers the existing designer through confirmed draft preparation when automation is unavailable', () => {
  const props = controls({ ...state, step: 'design', artwork: 'upload', automaticArtworkAvailable: false });
  expect(props.prepare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open designer' })); expect(props.prepare).toHaveBeenCalledWith('save');
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue without artwork' })); expect(props.change).toHaveBeenCalledWith({ artwork: 'none' });
});
it('a failed automatic review offers manual or product-selection recovery without pretending artwork was applied', () => {
  const props = controls({ ...state, step: 'design', artwork: 'upload' }, { manualRequired: true });
  expect(screen.queryByRole('button', { name: 'Apply to all' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Choose another product' })); expect(props.edit).toHaveBeenCalledWith('products');
  expect(props.prepare).not.toHaveBeenCalled(); expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it('store review waits for successful backend progression and uses its exact revision', async () => {
  const value = { ...state, step: 'stores' as const, shopIds: ['shop'], storeOptions: [{ id: 'shop', name: 'AI Store', status: 'draft' }] };
  const props = controls(value, { change: vi.fn().mockResolvedValue({ ...value, revision: 3 }) });
  fireEvent.click(screen.getByRole('button', { name: 'Review publication' })); await waitFor(() => expect(props.prepare).toHaveBeenCalledWith('publish',3));
});
it('does not prepare publication if backend progression fails', async () => {
  const props = controls({ ...state, step: 'stores', shopIds: ['shop'] });
  fireEvent.click(screen.getByRole('button', { name: 'Review publication' })); await Promise.resolve(); expect(props.prepare).not.toHaveBeenCalled();
});
it('historical product cards retain genuine media, prices and details while exposing no mutation or pagination', () => {
  render(<MemoryRouter><CopilotArtifacts artifacts={[{ kind: 'product', product }]} swag={{ selectedIds: [], busy: false, readOnly: true, onToggle: vi.fn() }} /></MemoryRouter>);
  expect(screen.getByRole('link', { name: `View ${product.name}` })).toHaveAttribute('href', expect.stringContaining(product.id));
  expect(screen.getByRole('img')).toHaveAttribute('src', product.primaryImageUrl);
  expect(screen.getByText(/650 incl. GST/)).toBeVisible(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('an older approval has no executable controls and does not reconcile or replay on mount', () => {
  render(<CopilotConfirmationCard readOnly artifact={{ kind: 'confirmation', operation: 'swag.collection', status: 'pending', confirmationId: 'stale-123456789012345678', preview: { action: 'apply' } }} onChange={vi.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(api.executeCopilotWriteApi).not.toHaveBeenCalled(); expect(api.resolveCopilotWriteApi).not.toHaveBeenCalled();
});
