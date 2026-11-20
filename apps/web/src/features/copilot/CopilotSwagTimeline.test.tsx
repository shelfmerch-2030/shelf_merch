// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { projectSwagTimeline, visibleMessage } from './swagTimeline';
import { SwagArtworkAcknowledgement, SwagStepMessage } from './SwagStepMessage';
import { CopilotArtifacts } from './CopilotProductCards';
import { CopilotConfirmationCard, CopilotWriteSuccess } from './CopilotConfirmationCard';
import { swagArtworkCompletion, swagArtworkCompletionWarnings } from './swagPresentation';
import type { SwagState } from './swagApi';
import type { CopilotConfirmationArtifact, CopilotMessage } from './api';
import * as api from './api';
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), cancelCopilotWriteApi: vi.fn(), executeCopilotWriteApi: vi.fn(), resolveCopilotWriteApi: vi.fn(), persistCopilotWriteArtifactApi: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const product = { id: '1234567890abcdef12345678', name: 'ActiveDry Polo', primaryImageUrl: '/uploads/verified-polo.png', sellingPriceInr: 650 };
const state: SwagState = { conversationId: 'a', revision: 2, active: true, name: 'Team', step: 'products', productIds: [], products: [], stores: [], shopIds: [], artwork: null, artworkStatus: 'No artwork selected', designs: [], designReady: false, persisted: false, hasUnsavedChanges: true, automaticArtworkAvailable: true };
const step = (revision = 2, conversationId = 'a'): CopilotMessage => ({ role: 'assistant', content: 'Choose products.', uiEventId: `step:${conversationId}:${revision}`, artifacts: [{ kind: 'swag_step', swag: { revision, conversationId, step: 'products' } }] });
const publishConfirmationId = 'publish-review-123456789012345';
const publishStoreId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const backpack = { id: 'b', name: 'Anti-Theft Laptop Backpack With Organizer', variants: [{ stock: 0 }], primaryImageUrl: '/uploads/catalog-backpack.png' };
function publishApproval(status: 'live' | 'draft' = 'live'): CopilotConfirmationArtifact {
  return { kind: 'confirmation', operation: 'swag.collection', status: 'pending', confirmationId: publishConfirmationId,
    request: { action: 'publish', revision: 2, conversationId: 'a' }, preview: { action: 'publish', name: 'SWAGGG DESIGN',
      stores: [{ id: publishStoreId, name: 'AI Store', status }], products: [product, backpack],
      designs: [{ productId: product.id, mockupUrl: '/uploads/saved-branded-polo.png' }, { productId: 'other', mockupUrl: '/uploads/unrelated.png' }],
      variantPolicy: 'All enabled catalog variants; subset selection is not supported' } };
}
function publicationResult(status: 'live' | 'draft' = 'live') {
  return { ...publishApproval(status).preview, action: 'publish', name: 'SWAGGG DESIGN', stores: [{ id: publishStoreId, name: 'AI Store', status }],
    collectionPath: '/swag', published: true, status: 'ready', productCount: 2 };
}

it.each(['live', 'draft'] as const)('renders the bound %s publication review with saved images, warnings and safe Edit/Cancel', async status => {
  vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: 'pending', confirmationId: publishConfirmationId });
  vi.mocked(api.cancelCopilotWriteApi).mockResolvedValue({ status: 'cancelled', confirmationId: publishConfirmationId });
  const onChange = vi.fn();
  const edit = vi.fn();
  render(<CopilotConfirmationCard artifact={publishApproval(status)} conversationId="a" onChange={onChange} onEditSwag={edit} />);
  const card = screen.getByRole('group', { name: 'Publish SWAGGG DESIGN?' });
  expect(within(card).getByText('2 products · AI Store')).toBeVisible();
  expect(within(card).getAllByRole('img')).toHaveLength(1);
  const mockup = within(card).getByRole('img', { name: 'Saved design for ActiveDry Polo' });
  expect(mockup).toHaveAttribute('src', '/uploads/saved-branded-polo.png');
  expect(within(card).getByText(backpack.name)).toBeVisible();
  expect(within(card).getByText('No saved customized preview')).toBeVisible();
  expect(within(card).getByText(`${backpack.name} is currently out of stock and may not be orderable.`)).toBeVisible();
  expect(within(card).getByText(status === 'live' ? /existing visibility rules/ : /won’t be publicly available/)).toBeVisible();
  fireEvent.error(mockup);
  expect(within(card).getByText('Saved preview unavailable')).toBeVisible();
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  expect(edit).toHaveBeenCalledOnce();
  fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' })));
  expect(api.cancelCopilotWriteApi).toHaveBeenCalledWith('swag.collection', publishConfirmationId);
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});

it('shows a pending state, reconciles a lost publication acknowledgement and executes only once', async () => {
  vi.mocked(api.resolveCopilotWriteApi)
    .mockResolvedValueOnce({ status: 'pending', confirmationId: publishConfirmationId })
    .mockResolvedValueOnce({ status: 'completed', confirmationId: publishConfirmationId, result: publicationResult() });
  let loseAcknowledgement: () => void = () => {};
  vi.mocked(api.executeCopilotWriteApi).mockImplementationOnce(() => new Promise((_resolve, reject) => { loseAcknowledgement = () => reject(Error('connection closed')); }));
  const onChange = vi.fn();
  render(<CopilotConfirmationCard artifact={publishApproval()} onChange={onChange} />);
  const confirm = screen.getByRole('button', { name: 'Confirm & Publish' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(screen.getByRole('group', { name: 'Publish SWAGGG DESIGN?' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', { name: 'Processing…' })).toBeDisabled();
  await act(async () => loseAcknowledgement());
  expect(api.executeCopilotWriteApi).toHaveBeenCalledExactlyOnceWith('swag.collection', { ...publishApproval().request,
    confirmationId: publishConfirmationId, idempotencyKey: `swag:${publishConfirmationId}` });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'success', result: publicationResult() }));
});

function reviewMessage(approval = publishApproval()): CopilotMessage {
  return { role: 'assistant', content: 'Click Confirm & Publish to make the collection available.', artifacts: [approval] };
}
function publicationReceipt(id = publishConfirmationId, result = publicationResult(), uiEventId = `swag:receipt:${id}`): CopilotMessage {
  return { role: 'assistant', content: 'Recorded publication', uiEventId,
    artifacts: [{ kind: 'success', operation: 'swag.collection', status: 'completed', confirmationId: id, message: 'Recorded', result }] };
}

it('shows only the verified receipt across repeated approval rows and preserves the original transcript', () => {
  const review = reviewMessage();
  const receipt = publicationReceipt();
  const messages = [review, { ...review, uiEventId: 'repeat-review', artifacts: [...review.artifacts!, step().artifacts![0]] }, receipt];
  const original = structuredClone(messages);
  const timeline = projectSwagTimeline(messages, null);
  expect(timeline.filter(row => row.visible).map(row => row.message)).toEqual([receipt]);
  expect(messages).toEqual(original);
});

it.each(['pending', 'cancelled', 'failed', 'consumed', 'completed'] as const)('keeps a %s review without a matching verified receipt', status => {
  const approval = { ...publishApproval(), status };
  const review = reviewMessage(approval);
  for (const other of [publicationReceipt('different-operation'), publicationReceipt(publishConfirmationId, { ...publicationResult(), published: false }),
    publicationReceipt(publishConfirmationId, { ...publicationResult(), stores: [] }), publicationReceipt(publishConfirmationId, publicationResult(), 'swag:receipt:wrong-event')]) {
    const [row] = projectSwagTimeline([review, other], null);
    expect(row.visible).toBe(true);
    expect(row.artifacts).toEqual([approval]);
  }
});

it('keeps distinct publication receipts in order and retains non-publish approvals', () => {
  const first = publicationReceipt();
  const secondId = 'another-publication-123456789';
  const second = publicationReceipt(secondId);
  const apply = reviewMessage({ ...publishApproval(), confirmationId: 'artwork-approval', preview: { action: 'apply' } });
  const sendPoints = reviewMessage({ ...publishApproval(), operation: 'campaigns.send_points', confirmationId: 'points-approval' });
  const rows = projectSwagTimeline([reviewMessage(), first, apply, sendPoints, reviewMessage({ ...publishApproval(), confirmationId: secondId }), second], null);
  expect(rows.filter(row => row.visible).map(row => row.message)).toEqual([first, apply, sendPoints, second]);
});

it.each([['apply', 'Artwork application completed'], ['save', 'Design saved for later'], ['publish', 'Collection publication completed']])('shows one plain %s status when no verified receipt is visible', (action, label) => {
  const approval = { ...publishApproval(), status: 'completed' as const, preview: { ...publishApproval().preview, action } };
  const review = reviewMessage(approval);
  expect(projectSwagTimeline([review], null)[0].completedApproval).toBe(approval);
  const { container } = render(<CopilotConfirmationCard artifact={approval} onChange={vi.fn()} />);
  expect(screen.getByText(label)).toBeVisible();
  expect(screen.queryByText(/AI Store|2 products/)).not.toBeInTheDocument();
  expect(container.querySelector('details, button, dl')).toBeNull();
});

it('counts distinct products actually customized and states partial application explicitly', () => {
  const application = { targets: [{ productId: 'a' }, { productId: 'b' }, { productId: 'b' }] };
  expect(swagArtworkCompletion({ productCount: 2, application })).toBe('Your logo has been applied to 2 products.');
  expect(swagArtworkCompletion({ productCount: 3, application })).toBe('Your logo has been applied to 2 of 3 products. Other products are unchanged.');
  expect(swagArtworkCompletion({ productCount: 3 })).toBe('Artwork application completed.');
  expect(swagArtworkCompletionWarnings({ application: { manual: [{ name: 'Backpack', reason: 'The front print area does not support automatic placement.' }] } }))
    .toEqual(['Backpack needs manual placement. The front print area does not support automatic placement.']);
});

it.each(['live', 'draft'] as const)('shows one verified %s result and links to the appropriate store view', status => {
  render(<CopilotWriteSuccess artifact={{ kind: 'success', operation: 'swag.collection', message: 'Recorded', result: publicationResult(status) }} />);
  const expected = status === 'live' ? 'Your SWAGGG DESIGN collection has been published to AI Store successfully.' : 'Your SWAGGG DESIGN collection has been added to AI Store.';
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent(expected);
  expect(screen.getByText('2 products')).toBeVisible();
  expect(screen.getByRole('link', { name: 'View collection' })).toHaveAttribute('href', expect.stringMatching(/\/swag$/));
  expect(screen.getByRole('link', { name: 'View store' })).toHaveAttribute('href', expect.stringContaining(`/${status === 'live' ? 'shop' : 'shops'}/${publishStoreId}`));
  if (status === 'draft') expect(screen.getByText(/isn’t publicly available yet/)).toBeVisible();
});
function controls(value = state, overrides = {}) {
  const props = { state: value, busy: false, hasCatalog: false, hasComposerLogo: false, change: vi.fn().mockResolvedValue(undefined), prepare: vi.fn().mockResolvedValue(undefined), edit: vi.fn(), upload: vi.fn(), ...overrides };
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
    { role: 'assistant', content: 'Saved!', uiEventId: 'swag:receipt:receipt-123456789012345', artifacts: [{ kind: 'success', operation: 'swag.collection', status: 'completed', message: 'Saved!', confirmationId: 'receipt-123456789012345', result: { id: product.id, action: 'save' } }] }];
  const before = JSON.stringify(messages); const projected = projectSwagTimeline(messages, state);
  expect(projected[0].visible).toBe(false); expect(projected[0].artifacts).toEqual([]);
  expect(projected[1].artifacts.filter(a => a.kind === 'success')).toHaveLength(1);
  expect(JSON.stringify(messages)).toBe(before);
});
it('shows no controls after naming and leaves browsing to the conversation', () => {
  controls();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('displays a repeated pending approval once without claiming that the earlier preview completed', () => {
  const review: CopilotMessage = { role: 'assistant', content: 'Approve', artifacts: [{ kind: 'confirmation', operation: 'swag.collection', confirmationId: 'pending-123456789012345', status: 'pending' }] };
  const rows = projectSwagTimeline([review, { ...review, uiEventId: 'later' }], state);
  expect(rows[0].artifacts).toEqual([]); expect(rows[0].earlierReview).toBe(true); expect(rows[0].suppressCompletedReview).toBe(false);
  expect(rows[1].artifacts).toHaveLength(1);
});
it('keeps the canonical receipt visible when an older preview arrives after it', () => {
  const confirmationId = 'late-preview-123456789012345';
  const messages: CopilotMessage[] = [{ role: 'assistant', content: 'Applied', uiEventId: `swag:receipt:${confirmationId}`, artifacts: [{ kind: 'success', operation: 'swag.collection', status: 'completed', message: 'Applied', confirmationId, result: { id: product.id, action: 'apply' } }] },
    { role: 'assistant', content: 'Earlier preview', artifacts: [{ kind: 'confirmation', operation: 'swag.collection', confirmationId, status: 'completed' }] }];
  const rows = projectSwagTimeline(messages, state);
  expect(rows[0].artifacts).toHaveLength(1); expect(rows[0].artifacts[0].kind).toBe('success');
  expect(rows[1].artifacts).toEqual([]); expect(rows[1].visible).toBe(false);
});
it('cannot continue a browsing gallery without a valid backend selection', () => {
  controls(state, { hasCatalog: true });
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
});
it('selection acknowledgement and Continue use only backend-returned product identities', () => {
  const props = controls({ ...state, productIds: [product.id], products: [product] });
  expect(screen.getByText('1 product selected')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'View selection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); expect(props.change).toHaveBeenCalledWith({ step: 'artwork' });
  fireEvent.click(screen.getByRole('button', { name: `Remove ${product.name} from selection` })); expect(props.change).toHaveBeenCalledWith({ removeProductIds: [product.id] });
});
it('the logo prompt leaves uploading and skipping to the composer', () => {
  const props = controls({ ...state, step: 'artwork', productIds: [product.id], products: [product] });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(props.upload).not.toHaveBeenCalled(); expect(props.change).not.toHaveBeenCalled();
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it('renders a singular acknowledgement using the confirmed image', () => {
  render(<MemoryRouter><SwagArtworkAcknowledgement products={[{ id: product.id, name: product.name, imageUrl: product.primaryImageUrl }]} /></MemoryRouter>);
  expect(screen.getByText('1 product')).toBeVisible();
  expect(screen.getByRole('img', { name: product.name })).toHaveAttribute('src', product.primaryImageUrl);
});
it('keeps full product names and the missing-image fallback on read-only cards', () => {
  const name = '2-in-1 Stick & Handy Vacuum Cleaner with Hepa Filter';
  render(<MemoryRouter><SwagArtworkAcknowledgement products={[{ id: product.id, name: product.name, imageUrl: product.primaryImageUrl }, { id: 'other', name, imageUrl: '' }]} /></MemoryRouter>);
  expect(screen.getByText('2 products')).toBeVisible();
  expect(screen.getByText(name)).toBeVisible();
  expect(screen.getByLabelText('No product image available')).toBeVisible();
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('shows every selected product, including selections beyond the first catalog page', () => {
  const products = Array.from({ length: 5 }, (_, index) => ({ id: `item-${index}`, name: `Product ${index + 1}`, imageUrl: '' }));
  render(<MemoryRouter><SwagArtworkAcknowledgement products={products} /></MemoryRouter>);
  expect(screen.getAllByRole('link')).toHaveLength(5);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('the single artwork action only prepares a review and never executes from stage navigation or hydration', () => {
  const props = controls({ ...state, step: 'design', artwork: 'upload' });
  expect(props.prepare).not.toHaveBeenCalled(); expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Review artwork application' })).not.toBeInTheDocument();
  expect(props.prepare).not.toHaveBeenCalled();
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
  const props = { state: value, busy: false, hasCatalog: false, hasComposerLogo: true, change: vi.fn(), prepare: vi.fn(), edit: vi.fn(), upload: vi.fn() };
  const view = render(<SwagStepMessage {...props} />); expect(screen.queryByRole('img')).not.toBeInTheDocument();
  view.rerender(<SwagStepMessage {...props} hasComposerLogo={false} />); expect(screen.getAllByRole('img')).toHaveLength(1);
});
it('reviews persisted product mockups with the composer as the primary interaction', () => {
  const props = controls({ ...state, step: 'design', artwork: 'saved', designReady: true, products: [product], productIds: [product.id], designs: [{ productId: product.id, mockupUrl: '/uploads/saved.png' }] });
  expect(screen.getByAltText(`Saved design for ${product.name}`)).toHaveAttribute('src', '/uploads/saved.png');
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(props.change).not.toHaveBeenCalled();
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
    expect(screen.getAllByRole('button')).toHaveLength(1); expect(props.change).not.toHaveBeenCalled();
});
it('a failed eligibility review offers one genuine designer fallback without claiming application', () => {
  const props = controls({ ...state, step: 'design', artwork: 'upload' }, { manualRequired: true });
  expect(screen.queryByRole('button', { name: 'Apply to all' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Open designer' })); expect(props.prepare).toHaveBeenCalledWith('save');
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
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
