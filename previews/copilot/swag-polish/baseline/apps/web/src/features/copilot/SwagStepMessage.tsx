import { tenantPath } from '@/lib/workspaceSlug';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { SwagSavedPreviews } from './SwagSavedPreviews';
import { swagWarnings } from './swagPresentation';
import type { SwagState, SwagPatch, SwagStep } from './swagApi';
import type { ReactNode } from 'react';

type Props = {
  state: SwagState; mode?: string; busy: boolean; hasCatalog: boolean; hasComposerLogo: boolean;
  manualRequired?: boolean;
  change: (patch: SwagPatch) => Promise<SwagState | undefined>;
  edit: (step: SwagStep) => Promise<void>; prepare: (action: 'apply' | 'save' | 'publish', revision?: number) => Promise<void>;
  browse: () => void; search: () => void; upload: () => void;
};
function Action({ children, onClick, disabled = false, primary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return <button type="button" className={primary ? 'sm-copilot-confirm__ok' : 'sm-copilot-confirm__cancel'} disabled={disabled} onClick={onClick}>{children}</button>;
}
export function SwagHistoryBlock({ historical, children }: { historical: boolean; children: ReactNode }) {
  return historical ? <details className="sm-swag-history-content"><summary>Products shown earlier</summary>{children}</details> : <>{children}</>;
}
export function SwagLogoPreview({ state, hasComposerLogo }: { state: SwagState; hasComposerLogo: boolean }) {
  return state.artwork === 'upload' && !hasComposerLogo && state.artworkPreviewUrl ? <figure className="sm-swag-logo"><img src={resolveMediaUrl(state.artworkPreviewUrl)} alt="Uploaded logo, not yet applied" width={56} height={56} /><figcaption>{state.artworkName}</figcaption></figure> : null;
}
function Products({ state, busy, change, browse, search, hasCatalog }: Props) {
  return <>
    {state.products.length ? <div className="sm-swag-selection" aria-label="Products added"><strong>{state.products.length} product{state.products.length === 1 ? '' : 's'} added</strong>
      {state.products.map(p => <button className="sm-swag-chip" type="button" key={p.id} disabled={busy} aria-label={`Remove ${p.name} from selection`} onClick={() => void change({ removeProductIds: [p.id] })}>{p.name} <span aria-hidden="true">×</span></button>)}
    </div> : null}
    <div className="sm-copilot-confirm__actions">
      {!hasCatalog ? <><Action onClick={browse} disabled={busy}>Show products</Action><Action onClick={search} disabled={busy}>Search for something specific</Action></> : null}
      {hasCatalog || state.products.length ? <Action primary onClick={() => void change({ step: 'artwork' })} disabled={busy || !state.products.length || Boolean(state.invalidProductIds?.length)}>Continue with selected products</Action> : null}
    </div>
  </>;
}
function Logo({ busy, upload, change, edit }: Props) {
  return <div className="sm-copilot-confirm__actions"><Action onClick={upload} disabled={busy}>Upload logo</Action><Action onClick={() => void change({ artwork: 'none' })} disabled={busy}>Skip logo</Action><Action onClick={() => void edit('products')} disabled={busy}>Change products</Action></div>;
}
function Design(props: Props) {
  const { state, busy, prepare, change, upload, hasComposerLogo, mode } = props;
  const selected = state.artworkProductIds || state.productIds;
  const manual = state.artwork === 'upload' && (!state.automaticArtworkAvailable || props.manualRequired);
  return <>
    <SwagLogoPreview state={state} hasComposerLogo={hasComposerLogo} />
    {state.artwork === 'saved' ? <SwagSavedPreviews source={state} inline /> : null}
    {swagWarnings(state).map(warning => <p className="sm-swag-warning" key={warning}>{warning}</p>)}
    {state.savedDesignChanged ? <p role="status">The saved design changed. Review it again before continuing.</p> : null}
    {mode === 'targets' ? <fieldset disabled={busy}><legend>Products to customize</legend>{state.products.map(product => <label key={product.id}>
      <input type="checkbox" checked={selected.includes(product.id)} disabled={busy || selected.length === 1 && selected.includes(product.id)} onChange={() => void change({ interaction: 'targets', artworkProductIds: selected.includes(product.id) ? selected.filter(id => id !== product.id) : [...selected, product.id] })} />{product.name}
    </label>)}<label><input type="checkbox" checked={Boolean(state.replaceArtwork)} onChange={e => void change({ interaction: 'targets', replaceArtwork: e.target.checked })} />Replace existing designs on these products, including all print areas (requires approval)</label></fieldset> : null}
    <div className="sm-copilot-confirm__actions">
      {manual ? <>
        <Action primary onClick={() => void prepare('save')} disabled={busy}>Open designer</Action>
        <Action onClick={() => void props.edit('products')} disabled={busy}>Choose another product</Action>
        <Action onClick={() => void change({ artwork: 'none' })} disabled={busy}>Continue without artwork</Action>
      </> : state.artwork === 'upload' && state.automaticArtworkAvailable ? <>
        <Action primary onClick={() => void prepare('apply')} disabled={busy}>{mode === 'targets' ? 'Review selected products' : 'Apply to all'}</Action>
        {mode !== 'targets' ? <Action onClick={() => void change({ step: 'design', interaction: 'targets' })} disabled={busy}>Choose products</Action> : null}
        <Action onClick={() => void change({ artwork: 'none' })} disabled={busy}>Skip logo</Action>
      </> : <>
        <Action primary onClick={() => void change({ step: 'stores' })} disabled={busy || !state.designReady}>Looks good</Action>
        {state.editorPath && !state.hasUnsavedChanges ? <a className="sm-copilot-confirm__cancel" href={tenantPath(state.editorPath)} target="_blank" rel="noreferrer">Edit placement</a> : null}
        {!state.automaticArtworkAvailable && (!state.persisted || state.hasUnsavedChanges) ? <Action onClick={() => void prepare('save')} disabled={busy}>Save Design</Action> : null}
      </>}
      <Action onClick={upload} disabled={busy}>Change logo</Action>
    </div>
    <details><summary>More design options</summary><div className="sm-copilot-confirm__actions">
      <Action onClick={() => void prepare('save')} disabled={busy}>Save for later</Action>
      <Action onClick={() => void props.edit('products')} disabled={busy}>Change products</Action>
      {state.collectionId ? <Action onClick={() => void change({ collectionId: state.collectionId })} disabled={busy}>Review saved design</Action> : null}
    </div></details>
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
  if (props.mode === 'paused') return <div className="sm-copilot-confirm__actions"><Action onClick={() => void props.change({ step: 'design', interaction: 'resume' })} disabled={props.busy}>Continue designing</Action></div>;
  return <div className="sm-swag-interaction" data-swag-step={props.state.step} aria-label={`Swag ${props.state.step}`} aria-busy={props.busy}>
    {props.state.invalidProductIds?.length ? <p role="alert">A selected product is no longer available. Remove it before continuing.</p> : null}
    {props.state.invalidStoreIds?.length ? <p role="alert">A selected store is no longer available. Choose another store before publishing.</p> : null}
    {props.state.step === 'products' ? <Products {...props} /> : props.state.step === 'artwork' ? <Logo {...props} /> : props.state.step === 'design' ? <Design {...props} /> : props.state.step === 'stores' ? <Stores {...props} /> : null}
    {props.state.step === 'review' ? <Action onClick={() => void props.prepare('publish')} disabled={props.busy}>Review publication</Action> : null}
  </div>;
}
