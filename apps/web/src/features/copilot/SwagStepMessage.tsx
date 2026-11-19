import { tenantPath } from '@/lib/workspaceSlug';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { SwagSavedPreviews } from './SwagSavedPreviews';
import { swagWarnings } from './swagPresentation';
import { ArrowRight, Check, ChevronDown, ChevronUp, LoaderCircle, X } from 'lucide-react';
import { CardImage, CopilotArtifacts, productImageSrc, type SwagProductControls } from './CopilotProductCards';
import { CopilotMarkdown } from './CopilotMarkdown';
import type { SwagState, SwagPatch, SwagStep } from './swagApi';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type Props = {
  state: SwagState; mode?: string; busy: boolean; hasCatalog: boolean; hasComposerLogo: boolean;
  manualRequired?: boolean;
  exploreMore?: ReactNode;
  pendingRemovalId?: string;
  selectionError?: string | null;
  onSelectionDisclosure?: () => void;
  change: (patch: SwagPatch) => Promise<SwagState | undefined>;
  edit: (step: SwagStep) => Promise<void>; prepare: (action: 'apply' | 'save' | 'publish', revision?: number) => Promise<void>;
  upload: () => void;
};
function Action({ children, onClick, disabled = false, primary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return <button type="button" className={primary ? 'sm-copilot-confirm__ok' : 'sm-copilot-confirm__cancel'} disabled={disabled} onClick={onClick}>{children}</button>;
}
const readOnlyProductCards: SwagProductControls = { selectedIds: [], busy: false, readOnly: true, onToggle: () => {} };

export function SwagArtworkAcknowledgement({ products, catalogProducts = [] }: {
  products: Array<{ id: string; name: string; imageUrl: string }>;
  catalogProducts?: Record<string, unknown>[];
}) {
  const details = new Map(catalogProducts.map(product => [String(product.id), product]));
  const cards = products.map(product => {
    const { sellingPriceInr, variants, inStock, available } = details.get(product.id) ?? {};
    return { kind: 'product' as const, product: { ...product, sellingPriceInr, variants, inStock, available } };
  });
  return <>
    <CopilotMarkdown content={`Great! You've selected **${products.length} ${products.length === 1 ? 'product' : 'products'}** for your collection.`} />
    <div className="sm-swag-artwork-selection" role="group" aria-label="Products selected for the collection">
      <CopilotArtifacts artifacts={cards} swag={readOnlyProductCards} showAllProducts />
    </div>
  </>;
}
export function SwagLogoPreview({ state, hasComposerLogo }: { state: SwagState; hasComposerLogo: boolean }) {
  return state.artwork === 'upload' && !hasComposerLogo && state.artworkPreviewUrl ? <figure className="sm-swag-logo"><img src={resolveMediaUrl(state.artworkPreviewUrl)} alt="Uploaded logo, not yet applied" width={56} height={56} /><figcaption>{state.artworkName}</figcaption></figure> : null;
}
/** Display the current wording for the exact legacy artwork prompt in saved chats. */
export function swagPromptForDisplay(content: string, step?: SwagStep) {
  return step === 'artwork' && content === 'Would you like to add your company logo? You can upload it using + below, or skip for now.'
    ? 'Would you like to add your company logo? You can upload it using the + button below, or continue without one.'
    : content;
}
function Products({ state, busy, change, hasCatalog, exploreMore, pendingRemovalId, selectionError, onSelectionDisclosure }: Props) {
  const [expanded, setExpanded] = useState(false);
  const galleryId = useId();
  const summary = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const selected = state.products.length;
  const showGallery = expanded && selected > 0;
  useEffect(() => { if (!selected) setExpanded(false); }, [selected]);

  async function removeProduct(id: string, button: HTMLButtonElement) {
    const hadFocus = document.activeElement === button;
    const result = await change({ removeProductIds: [id] });
    if (hadFocus && result) requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === button) {
        (toggle.current ?? summary.current)?.focus({ preventScroll: true });
      }
    });
  }

  if (!hasCatalog && !selected) return null;
  return <div className="sm-swag-products-step">
    <div className="sm-swag-selected" aria-label="Selected products" ref={summary} tabIndex={-1}>
      <div className="sm-swag-selected__heading">
        <strong>{selected > 0 && <Check size={15} aria-hidden="true" />}{selected} product{selected === 1 ? '' : 's'} selected</strong>
        {selected > 0 && <button type="button" ref={toggle} className="sm-swag-selected__toggle" aria-expanded={showGallery} aria-controls={galleryId}
          onClick={() => { onSelectionDisclosure?.(); setExpanded(!showGallery); }}>
          {showGallery ? 'Hide selection' : 'View selection'}
          {showGallery ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>}
      </div>
      {selected > 0 && <ul id={galleryId} className="sm-swag-selected__items" aria-label="Selected catalog products" hidden={!showGallery}>
        {showGallery && state.products.map(product => {
          const src = productImageSrc({ ...product, imageUrls: product.images ?? product.imageUrls });
          const pending = pendingRemovalId === product.id;
          return <li className="sm-swag-selected__item" key={product.id}>
            <span className="sm-swag-selected__thumbnail">
              <CardImage key={src} src={src} alt={product.name} emptyLabel="No product image available" />
              <span className="sm-swag-selected__mark"><Check size={10} aria-label="Selected" /></span>
            </span>
            <span>{product.name}</span>
            <button type="button" className="sm-swag-selected__remove" disabled={busy} aria-label={`Remove ${product.name} from selection`}
              aria-busy={pending || undefined} onClick={event => void removeProduct(product.id, event.currentTarget)}>
              {pending ? <LoaderCircle size={14} className="sm-copilot-spin" aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
            </button>
          </li>;
        })}
      </ul>}
      {selectionError && <p role="alert" className="sm-copilot-attach-error">{selectionError}</p>}
    </div>
    <div className="sm-swag-products-actions">
      {exploreMore}
      <button type="button" className="sm-copilot-confirm__ok sm-swag-footer-action sm-swag-footer-continue"
        onClick={() => void change({ step: 'artwork' })} disabled={busy || !selected || Boolean(state.invalidProductIds?.length)}>
        Continue <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  </div>;
}
function Design(props: Props) {
  const { state, busy, prepare, change, hasComposerLogo, mode } = props;
  const selected = state.artworkProductIds || state.productIds;
  const manual = state.artwork === 'upload' && (!state.automaticArtworkAvailable || props.manualRequired || mode === 'manual');
  return <>
    <SwagLogoPreview state={state} hasComposerLogo={hasComposerLogo} />
    {state.artwork === 'saved' && mode !== 'applied' ? <><SwagSavedPreviews source={state} inline />
      {state.designs.some(design => !design.mockupUrl) ? <p>Without a saved customized preview: {state.products.filter(product => !state.designs.some(design => design.productId === product.id && design.mockupUrl)).map(product => product.name).join(', ')}. These products are not shown as branded.</p> : null}</> : null}
    {swagWarnings(state).map(warning => <p className="sm-swag-warning" key={warning}>{warning}</p>)}
    {state.savedDesignChanged ? <p role="status">The saved design changed. Review it again before continuing. {state.canRefreshSavedDesign ? <Action onClick={() => void change({ refreshSavedDesign: true })} disabled={busy}>Review saved changes</Action> : null}</p> : null}
    {mode === 'targets' ? <fieldset disabled={busy}><legend>Products to customize</legend>{state.products.map(product => <label key={product.id}>
      <input type="checkbox" checked={selected.includes(product.id)} disabled={busy || selected.length === 1 && selected.includes(product.id)} onChange={() => void change({ interaction: 'targets', artworkProductIds: selected.includes(product.id) ? selected.filter(id => id !== product.id) : [...selected, product.id] })} />{product.name}
    </label>)}<label><input type="checkbox" checked={Boolean(state.replaceArtwork)} onChange={e => void change({ interaction: 'targets', replaceArtwork: e.target.checked })} />Replace existing designs on these products, including all print areas (requires approval)</label></fieldset> : null}
    <div className="sm-copilot-confirm__actions">
      {manual ? <>
        <Action primary onClick={() => void prepare('save')} disabled={busy}>Open designer</Action>
      </> : state.artwork === 'upload' ? null : state.artwork === 'none' ? <>
        <Action primary onClick={() => void change({ step: 'stores' })} disabled={busy || !state.designReady}>Looks good</Action>
      </> : !state.designReady && state.editorPath ? <a className="sm-copilot-confirm__cancel" href={tenantPath(state.editorPath)} target="_blank" rel="noreferrer">Open designer</a> : null}
    </div>
    {mode === 'applied' && state.artwork === 'saved' && state.designReady ? <p>Do these designs look good? Would you like to publish them or make changes?</p> : null}
  </>;
}
function Stores({ state, busy, change, prepare, edit }: Props) {
  async function review() { const next = await change({ step: 'review' }); if (next) await prepare('publish', next.revision); }
  return <><fieldset className="sm-swag-stores" disabled={busy}><legend>Select stores</legend>{state.storeOptions?.map(store => <label key={store.id}><input type="checkbox" checked={state.shopIds.includes(store.id)} onChange={() => void change({ shopIds: state.shopIds.includes(store.id) ? state.shopIds.filter(id => id !== store.id) : [...state.shopIds, store.id] })} />{store.name}{store.status === 'draft' ? ' (draft store stays draft)' : ''}</label>)}</fieldset>
    {!state.storeOptions?.length ? <p>No eligible stores are available.</p> : null}
    <div className="sm-copilot-confirm__actions"><Action primary onClick={() => void review()} disabled={busy || !state.shopIds.length || Boolean(state.invalidStoreIds?.length)}>Review publication</Action><Action onClick={() => void edit('design')} disabled={busy}>Change design</Action></div></>;
}
/** Context-specific controls attached to a persisted assistant event, never a
 * separate wizard or an independent copy of the backend selection. */
export function SwagStepMessage(props: Props) {
  if (props.mode === 'designer' && props.state.editorPath && !props.state.hasUnsavedChanges) return <a className="sm-copilot-confirm__cancel" href={tenantPath(props.state.editorPath)} target="_blank" rel="noreferrer">Open designer</a>;
  if (props.mode === 'paused') return <div className="sm-copilot-confirm__actions"><Action onClick={() => void props.change({ step: 'design', interaction: 'resume' })} disabled={props.busy}>Continue designing</Action></div>;
  return <div className="sm-swag-interaction" data-swag-step={props.state.step} aria-label={`Swag ${props.state.step}`} aria-busy={props.busy}>
    {props.state.invalidProductIds?.length ? <p role="alert">A selected product is no longer available. Remove it before continuing.</p> : null}
    {props.state.invalidStoreIds?.length ? <p role="alert">A selected store is no longer available. Choose another store before publishing.</p> : null}
    {props.state.step === 'products' ? <Products {...props} /> : props.state.step === 'design' ? <Design {...props} /> : props.state.step === 'stores' ? <Stores {...props} /> : null}
    {props.state.step === 'review' ? <Action onClick={() => void props.prepare('publish')} disabled={props.busy}>Review publication</Action> : null}
  </div>;
}
