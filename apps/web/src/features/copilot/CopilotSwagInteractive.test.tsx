// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { CopilotArtifacts } from './CopilotProductCards';
import { SwagWorkflowPanel } from './SwagWorkflowPanel';
import { SwagStepMessage } from './SwagStepMessage';
import { useSwagConversation } from './useSwagConversation';
import * as api from './swagApi';
import type { SwagState } from './swagApi';
vi.mock('./swagApi', async original => ({ ...await original<typeof import('./swagApi')>(), getSwagState: vi.fn(), configureSwagState: vi.fn(), browseSwagCatalog: vi.fn(), prepareSwagReview: vi.fn() }));
const id = '1234567890abcdef12345678';
const product = { id, name: 'Sustainable Classic Hoodie', sellingPriceInr: 840, primaryImageUrl: '/hoodie.png' };
const base: SwagState = { conversationId: 'conversation-a', revision: 2, active: true, name: 'Swag for winter', step: 'products',
  productIds: [], products: [], shopIds: [], stores: [], artwork: null, artworkStatus: 'No artwork selected', designs: [], designReady: false, persisted: false, hasUnsavedChanges: true };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getSwagState).mockResolvedValue({ state: base });
  vi.mocked(api.browseSwagCatalog).mockResolvedValue({ items: [product], pagination: { page: 1, totalPages: 1, limit: 6, total: 1 } });
});
afterEach(cleanup);
function cards(selectedIds: string[] = [], toggle = vi.fn()) {
  return <MemoryRouter><CopilotArtifacts conversationId="conversation-a" artifacts={[{ kind: 'product', product }]}
    swag={{ selectedIds, busy: false, onToggle: toggle }} /></MemoryRouter>;
}
function panel(state: SwagState = base, changes: Record<string, unknown> = {}) {
  const props = { state, busy: false, error: null, hasCatalog: true, pending: false,
    change: vi.fn().mockResolvedValue(state), prepare: vi.fn().mockResolvedValue(undefined), edit: vi.fn(), upload: vi.fn(), ...changes };
  return { ...render(<MemoryRouter><SwagWorkflowPanel {...props} /></MemoryRouter>), props };
}
it('selects the exact rendered product id and waits for authoritative state before showing Selected', () => {
  const toggle = vi.fn(); const view = render(cards([], toggle));
  fireEvent.click(screen.getByRole('button', { name: `Add ${product.name}` }));
  expect(toggle).toHaveBeenCalledWith(id);
  expect(screen.getByRole('button', { name: `Add ${product.name}` })).toHaveAttribute('aria-pressed', 'false');
  view.rerender(cards([id], toggle));
  expect(screen.getByRole('button', { name: `Remove ${product.name}` })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: `Remove ${product.name}` })); expect(toggle).toHaveBeenCalledTimes(2);
});
it('leaves generic catalog cards unchanged outside Swag Design', () => {
  render(<MemoryRouter><CopilotArtifacts artifacts={[{ kind: 'product', product }]} /></MemoryRouter>);
  expect(screen.getByRole('link', { name: `View ${product.name}` })).toHaveAttribute('href', expect.stringContaining(`/catalog/${id}`));
  expect(screen.queryByRole('button', { name: /Select/ })).not.toBeInTheDocument();
});
it('disables Continue without products and keeps rename functional', () => {
  const { props } = panel(); expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Rename collection' })); expect(props.edit).toHaveBeenCalledWith('name');
});
it('Next transitions via backend mutation with the selected count preserved', () => {
  const { props } = panel({ ...base, productIds: [id], products: [product] });
  expect(screen.getByText('1 product selected. Add more, or continue to your logo.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); expect(props.change).toHaveBeenCalledWith({ step: 'artwork' });
});
it('shows a manageable initial grid, then exposes all remaining cards', () => {
  const products = Array.from({ length: 13 }, (_, i) => ({ kind: 'product' as const, product: { ...product, id: `${id}-${i}`, name: `Hoodie ${i}` } }));
  render(<MemoryRouter><CopilotArtifacts conversationId="conversation-a" artifacts={products} swag={{ selectedIds: [], busy: false, onToggle: vi.fn() }} /></MemoryRouter>);
  expect(screen.getAllByRole('button', { name: /^Add Hoodie/ })).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: 'Explore more' })); expect(screen.getAllByRole('button', { name: /^Add Hoodie/ })).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'Explore more' })); expect(screen.getAllByRole('button', { name: /^Add Hoodie/ })).toHaveLength(12);
  fireEvent.click(screen.getByRole('button', { name: 'Explore more' })); expect(screen.getAllByRole('button', { name: /^Add Hoodie/ })).toHaveLength(13);
  expect(screen.queryByRole('button', { name: 'Explore more' })).not.toBeInTheDocument();
});
it('groups browsing and Continue in one footer and retains the acknowledged selection during pagination', async () => {
  vi.mocked(api.browseSwagCatalog).mockResolvedValue({ items: [product, { ...product, id: 'second', name: 'Second hoodie' }], pagination: { page: 2, totalPages: 2, total: 2, limit: 6 } });
  const change = vi.fn();
  const gallery = (state: SwagState) => <MemoryRouter><CopilotArtifacts conversationId="conversation-a" artifacts={[{ kind: 'product', product },
    { kind: 'catalog_page', catalog: { query: { query: 'hoodie', category: 'Apparel', limit: 6 }, pagination: { page: 1, limit: 6, total: 2, totalPages: 2 } } }]}
    swag={{ selectedIds: state.productIds, busy: false, onToggle: vi.fn() }}
    renderSwagFooter={exploreMore => <SwagStepMessage state={state} busy={false} hasCatalog hasComposerLogo={false}
      change={change} edit={vi.fn()} prepare={vi.fn()} upload={vi.fn()} exploreMore={exploreMore} />} /></MemoryRouter>;
  const view = render(gallery(base));
  const footer = within(view.container.querySelector<HTMLElement>('.sm-swag-catalog-footer')!);
  const explore = footer.getByRole('button', { name: 'Explore more' });
  const next = footer.getByRole('button', { name: 'Continue' });
  expect(explore.parentElement).toBe(next.parentElement);
  expect(footer.getByText('0 products selected')).toBeVisible();
  expect(next).toBeDisabled();
  view.rerender(gallery({ ...base, productIds: [id], products: [product] }));
  expect(footer.getAllByText('1 product selected')).toHaveLength(1);
  expect(next).toBeEnabled();
  fireEvent.click(explore);
  const loading = footer.getByRole('button', { name: 'Loading products…' });
  expect(loading).toBeDisabled();
  expect(loading).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(loading);
  await waitFor(() => expect(api.browseSwagCatalog).toHaveBeenCalledWith('conversation-a', { query: 'hoodie', category: 'Apparel', limit: 6, page: 2 }));
  expect(await screen.findByRole('button', { name: 'Add Second hoodie' })).toBeInTheDocument();
  expect(api.browseSwagCatalog).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: `Remove ${product.name}` })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByRole('link', { name: `View ${product.name}` })).toHaveLength(1);
  expect(footer.getAllByText('1 product selected')).toHaveLength(1);
  expect(footer.queryByRole('button', { name: 'Explore more' })).not.toBeInTheDocument();
  fireEvent.click(next);
  expect(change).toHaveBeenCalledExactlyOnceWith({ step: 'artwork' });
});
it('reuses the existing artwork picker and supports skip without claiming artwork application', () => {
  const { props } = panel({ ...base, step: 'artwork', products: [product], productIds: [id] });
  fireEvent.click(screen.getByRole('button', { name: 'Upload logo' })); expect(props.upload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Skip logo' })); expect(props.change).toHaveBeenCalledWith({ artwork: 'none' });
});
it('requires saving and a verified designer reload for uploaded artwork', () => {
  const { props } = panel({ ...base, step: 'design', products: [product], productIds: [id], artwork: 'upload', artworkStatus: 'Uploaded; placement required' });
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.queryByRole('link', { name: /Open Designer/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save Design' })); expect(props.prepare).toHaveBeenCalledWith('save');
});
it('opens the existing saved designer and reloads its exact collection reference', () => {
  const { props } = panel({ ...base, step: 'design', products: [product], productIds: [id], artwork: 'saved', collectionId: id,
    persisted: true, hasUnsavedChanges: false, editorPath: `/swag/new?edit=${id}` });
  expect(screen.getByRole('link', { name: 'Open Designer / Apply Artwork' })).toHaveAttribute('href', expect.stringContaining(`/swag/new?edit=${id}`));
  fireEvent.click(screen.getByText('Artwork options'));
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved design' })); expect(props.change).toHaveBeenCalledWith({ collectionId: id });
});
it('selects multiple actual stores and prepares a final card only after backend progression succeeds', async () => {
  const state = { ...base, step: 'stores' as const, artwork: 'none' as const, productIds: [id], products: [product], designReady: true,
    shopIds: ['store-a'], stores: [{ id: 'store-a', name: 'AI Store', status: 'draft' }], storeOptions: [{ id: 'store-a', name: 'AI Store', status: 'draft' }, { id: 'store-b', name: 'Other store', status: 'live' }] };
  const { props } = panel(state, { change: vi.fn().mockResolvedValue({ ...state, revision: state.revision + 1 }) });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Other store' })); expect(props.change).toHaveBeenCalledWith({ shopIds: ['store-a', 'store-b'] });
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); await waitFor(() => expect(props.prepare).toHaveBeenCalledWith('publish', state.revision + 1));
});
it('does not progress to confirmation when the state mutation fails', async () => {
  const { props } = panel({ ...base, step: 'stores', shopIds: ['store-a'] }, { change: vi.fn().mockResolvedValue(undefined) });
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); await act(async () => {}); expect(props.prepare).not.toHaveBeenCalled();
});
it('round-trips backend state, blocks rapid duplicate actions and never auto retries mutation', async () => {
  let resolve!: (result: { state: SwagState }) => void;
  vi.mocked(api.configureSwagState).mockImplementation(() => new Promise(r => { resolve = r; }));
  const hook = renderHook(() => useSwagConversation('conversation-a', true));
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  let first!: Promise<unknown>;
  act(() => { first = hook.result.current.change({ addProductIds: [id] }); void hook.result.current.change({ addProductIds: [id] }); });
  expect(api.configureSwagState).toHaveBeenCalledTimes(1); expect(hook.result.current.state?.productIds).toEqual([]);
  await act(async () => { resolve({ state: { ...base, revision: 3, productIds: [id], products: [product] } }); await first; });
  expect(hook.result.current.state?.productIds).toEqual([id]);
  expect(api.configureSwagState).toHaveBeenCalledWith('conversation-a', 2, { addProductIds: [id] });
});
it('discards delayed mutations when switching conversations', async () => {
  let resolve!: (result: { state: SwagState }) => void;
  vi.mocked(api.configureSwagState).mockImplementation(() => new Promise(r => { resolve = r; }));
  vi.mocked(api.getSwagState).mockImplementation(async id => ({ state: { ...base, conversationId: id } }));
  const hook = renderHook(({ id }) => useSwagConversation(id, true), { initialProps: { id: 'conversation-a' } });
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  const oldChange = hook.result.current.change;
  let first!: Promise<unknown>; act(() => { first = hook.result.current.change({ addProductIds: [id] }); });
  hook.rerender({ id: 'conversation-b' }); await waitFor(() => expect(hook.result.current.state?.conversationId).toBe('conversation-b'));
  await act(async () => { resolve({ state: { ...base, revision: 3, productIds: [id], products: [product] } }); await first; });
  expect(hook.result.current.state?.conversationId).toBe('conversation-b'); expect(hook.result.current.state?.productIds).toEqual([]);
  await act(async () => { await oldChange({ addProductIds: [id] }); });
  expect(api.configureSwagState).toHaveBeenCalledTimes(1);
});
it('recovers stale-click state read-only and shows an actionable error', async () => {
  vi.mocked(api.configureSwagState).mockRejectedValue(new Error('The selection changed. Review it again.'));
  const hook = renderHook(() => useSwagConversation('conversation-a', true)); await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  await act(async () => { await hook.result.current.change({ addProductIds: [id] }); });
  expect(api.configureSwagState).toHaveBeenCalledTimes(1); expect(api.getSwagState).toHaveBeenCalledTimes(2);
  expect(hook.result.current.error).toMatch(/selection changed/);
});

it('uses the composer for names and discovery without a duplicate form or title-based auto search', () => {
  const view = panel({ ...base, step: 'name' });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Type its name below');
  view.rerender(<SwagWorkflowPanel {...view.props} state={base} hasCatalog={false} />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(api.browseSwagCatalog).not.toHaveBeenCalled();
});
it('removes selected chips through the same backend mutation, with no optimistic local selection', () => {
  const { props } = panel({ ...base, products: [product], productIds: [id] });
  fireEvent.click(screen.getByRole('button', { name: `Remove ${product.name} from selection` }));
  expect(props.change).toHaveBeenCalledWith({ removeProductIds: [id] });
  expect(screen.getByRole('status')).toHaveTextContent('1 product selected');
});
