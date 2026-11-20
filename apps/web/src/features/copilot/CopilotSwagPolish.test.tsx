// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { SwagStepMessage, swagPromptForDisplay } from './SwagStepMessage';
import { CopilotArtifacts } from './CopilotProductCards';
import type { SwagState } from './swagApi';
afterEach(cleanup);
const products = ['Ceramic Mug','Classic Crew Neck','Classic Profile Mug','Corporate Polo'].map((name, i) => ({ id: String(i + 1).padStart(24,'0'), name,
  ...(i === 0 ? { primaryImageUrl: '/uploads/verified-mug.png' } : i === 3 ? { images: ['/uploads/verified-polo.png'] } : {}) }));
const state: SwagState = { conversationId: 'owned-conversation', revision: 8, active: true, name: 'Team', step: 'products',
  productIds: products.map(p => p.id), products, stores: [], shopIds: [], artwork: null, artworkStatus: 'No artwork selected', designs: [],
  designReady: false, persisted: false, hasUnsavedChanges: true, automaticArtworkAvailable: true };
function props() { return { state, busy: false, hasCatalog: true, hasComposerLogo: false, change: vi.fn().mockResolvedValue(undefined), prepare: vi.fn(), edit: vi.fn(), browse: vi.fn(), search: vi.fn(), upload: vi.fn() }; }
it('discloses verified selected products on demand with individually labelled removals', () => {
  const actions = props(); render(<SwagStepMessage {...actions} />);
  expect(screen.getByText('4 products selected')).toBeVisible();
  expect(screen.queryByText(products[0].name)).not.toBeInTheDocument();
  const disclosure = screen.getByRole('button', { name: 'View selection' });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(disclosure);
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByAltText('Ceramic Mug')).toHaveAttribute('src', '/uploads/verified-mug.png');
  const polo = screen.getByAltText('Corporate Polo');
  expect(polo).toHaveAttribute('src', '/uploads/verified-polo.png');
  fireEvent.error(polo);
  expect(screen.getAllByLabelText('No product image available')).toHaveLength(3);
  for (const p of products) {
    expect(screen.getByText(p.name)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: `Remove ${p.name} from selection` }));
    expect(actions.change).toHaveBeenLastCalledWith({ removeProductIds: [p.id] });
  }
  expect(screen.getByText('4 products selected')).toBeVisible(); // No optimistic selection mutation.
  expect(actions.change).toHaveBeenCalledTimes(4);
  fireEvent.click(screen.getByRole('button', { name: 'Hide selection' }));
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(products[3].name)).not.toBeInTheDocument();
  expect(actions.change).toHaveBeenCalledTimes(4);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(actions.change).toHaveBeenLastCalledWith({ step: 'artwork' });
  expect(actions.prepare).not.toHaveBeenCalled();
});
it('retains the acknowledged selection while pending and disables invalid or empty progression', () => {
  const actions = props(); const view = render(<SwagStepMessage {...actions} busy />);
  fireEvent.click(screen.getByRole('button', { name: 'View selection' }));
  expect(screen.getByText('4 products selected')).toBeVisible();
  for (const p of products) expect(screen.getByRole('button', { name: `Remove ${p.name} from selection` })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  view.rerender(<SwagStepMessage {...actions} state={{ ...state, invalidProductIds: [products[0].id] }} />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  view.rerender(<SwagStepMessage {...actions} state={{ ...state, products: [], productIds: [] }} />);
  expect(screen.getByText('0 products selected')).toBeVisible();
  expect(screen.queryByRole('list', { name: 'Selected catalog products' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'View selection' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(actions.change).not.toHaveBeenCalled();
});
it('keeps the gallery open through confirmed removal or a localized failure and resets after the final removal', () => {
  const actions = props();
  const view = render(<SwagStepMessage {...actions} />);
  fireEvent.click(screen.getByRole('button', { name: 'View selection' }));
  view.rerender(<SwagStepMessage {...actions} busy pendingRemovalId={products[0].id} />);
  expect(screen.getByRole('button', { name: 'Remove Ceramic Mug from selection' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', { name: 'Remove Corporate Polo from selection' })).not.toHaveAttribute('aria-busy');
  view.rerender(<SwagStepMessage {...actions} selectionError="Review the current selection and try again." />);
  expect(screen.getByRole('alert')).toHaveTextContent('Review the current selection and try again.');
  expect(screen.getByRole('button', { name: 'Remove Ceramic Mug from selection' })).toBeEnabled();
  expect(screen.getByText('4 products selected')).toBeVisible();
  const remaining = { ...state, products: [products[3]], productIds: [products[3].id] };
  view.rerender(<SwagStepMessage {...actions} state={remaining} />);
  expect(screen.getByText('1 product selected')).toBeVisible();
  expect(screen.getByAltText('Corporate Polo')).toBeVisible();
  expect(screen.queryByText('Ceramic Mug')).not.toBeInTheDocument();
  view.rerender(<SwagStepMessage {...actions} state={{ ...state, products: [], productIds: [] }} />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  view.rerender(<SwagStepMessage {...actions} state={remaining} />);
  expect(screen.getByRole('button', { name: 'View selection' })).toHaveAttribute('aria-expanded', 'false');
});
it('maps only the exact legacy artwork prompt and displays new and custom messages verbatim', () => {
  const stored = 'Would you like to add your company logo? You can upload it using + below, or skip for now.';
  const canonical = 'Would you like to add your company logo? You can upload it using the + button below, or continue without one.';
  expect(swagPromptForDisplay(canonical, 'artwork')).toBe(canonical);
  expect(swagPromptForDisplay(stored, 'artwork')).toBe(canonical);
  expect(swagPromptForDisplay(stored, 'products')).toBe(stored);
  expect(swagPromptForDisplay(stored)).toBe(stored);
  expect(swagPromptForDisplay(`One more thing. ${stored}`, 'artwork')).toBe(`One more thing. ${stored}`);
  expect(swagPromptForDisplay('Please upload the alternate logo we discussed.', 'artwork')).toBe('Please upload the alternate logo we discussed.');
});
it('keeps genuine Details navigation and media while Add/Added reflects acknowledged state only', () => {
  const product = { ...products[3], primaryImageUrl: '/uploads/verified-polo.png', sellingPriceInr: 500 };
  const toggle = vi.fn();
  const cards = (selectedIds: string[], busy = false) => <MemoryRouter><CopilotArtifacts artifacts={[{ kind: 'product', product }]} swag={{ selectedIds, busy, onToggle: toggle }} /></MemoryRouter>;
  const view = render(cards([]));
  expect(screen.getByRole('link', { name: 'View Corporate Polo' })).toHaveTextContent(/^Details$/);
  expect(screen.getByRole('link', { name: 'View Corporate Polo' })).toHaveAttribute('href', expect.stringContaining(`/catalog/${product.id}`));
  expect(screen.getByRole('img')).toHaveAttribute('src', product.primaryImageUrl);
  expect(screen.getByText(/500 incl. GST/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Add Corporate Polo' })); expect(toggle).toHaveBeenCalledWith(product.id);
  expect(screen.getByRole('button', { name: 'Add Corporate Polo' })).toHaveAttribute('aria-pressed', 'false');
  view.rerender(cards([product.id], true));
  expect(screen.getByRole('button', { name: 'Remove Corporate Polo' })).toHaveTextContent('✓ Added');
  expect(screen.getByRole('button', { name: 'Remove Corporate Polo' })).toBeDisabled();
});
