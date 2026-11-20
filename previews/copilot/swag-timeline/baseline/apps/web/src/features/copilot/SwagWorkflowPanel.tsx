import { useEffect, useRef, useState } from "react";
import { tenantPath } from "@/lib/workspaceSlug";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { SwagSavedPreviews } from "./SwagSavedPreviews";
import { swagRows } from "./swagPresentation";
import { type SwagPatch, type SwagState, type SwagStep } from "./swagApi";

export function SwagWorkflowPanel({ state, busy, error, pending, change, prepare, edit, upload, uploadedArtwork, artworkReviewState }: {
  state: SwagState; busy: boolean; error: string | null; hasCatalog: boolean; pending: boolean;
  change: (patch: SwagPatch) => Promise<SwagState | undefined>;
  prepare: (action: "save" | "publish" | "apply", expectedRevision?: number) => Promise<void>; edit: (step: SwagStep) => Promise<void>;
  upload: () => void; uploadedArtwork?: { id: string; name: string };
  artworkReviewState?: 'dismissed' | 'unverified';
}) {
  const [choosingArtworkProducts, setChoosingArtworkProducts] = useState(false);
  const preparedArtwork = useRef<number | null>(null);
  useEffect(() => {
    // A review restored from history was already prepared. Keep its revision
    // observed while the committed receipt refreshes the current design.
    if (pending && state.step === 'design' && state.artwork === 'upload') {
      preparedArtwork.current = state.revision;
      return;
    }
    if (state.automaticArtworkAvailable && state.step === 'design' && state.artwork === 'upload' && !busy && !pending
      && !choosingArtworkProducts && !artworkReviewState && preparedArtwork.current !== state.revision) {
      preparedArtwork.current = state.revision;
      // PREPARE creates only a review. The sole Apply button is the existing
      // confirmation card's user-click-only EXECUTE action.
      void prepare('apply');
    }
  }, [state.automaticArtworkAvailable, state.step, state.artwork, state.revision, busy, pending, choosingArtworkProducts, artworkReviewState]);
  const go = (step: SwagStep) => void change({ step });
  const button = (text: string, click: () => void, disabled = false) => <button type="button" className="sm-copilot-confirm__cancel" disabled={busy || disabled || artworkReviewState === 'unverified'} onClick={click}>{text}</button>;
  async function review() {
    const next = await change({ step: 'review' });
    if (next) await prepare('publish', next.revision);
  }
  if (!state.active) return null;
  return <section className="sm-swag-flow" aria-label="Current Swag Design" aria-busy={busy}>
    <header><strong>{state.name || 'Design your swag'}</strong><span>Current design · {({ name: 'Name', products: 'Products', artwork: 'Logo', design: 'Review', stores: 'Publish', review: 'Publish' }[state.step])}</span></header>
    {error ? <p role="alert" className="sm-copilot-attach-error">{error}</p> : null}
    {state.invalidProductIds?.length ? <p role="alert">A selected product is no longer eligible. Remove the unavailable selection before continuing.</p> : null}
    {state.step === 'name' ? <p role="status">What would you like to call your collection? Type its name below.</p> : null}
    {state.step === 'products' ? <>
      <p role="status">{state.products.length ? `${state.products.length} product${state.products.length === 1 ? '' : 's'} selected. Add more, or continue to your logo.` : 'Choose a product above, or tell me what you’re looking for below.'}</p>
      <div className="sm-swag-selection" aria-label="Selected products">
        {state.products.map(p => <button type="button" className="sm-swag-chip" key={p.id} disabled={busy || artworkReviewState === 'unverified'}
          aria-label={`Remove ${p.name} from selection`} onClick={() => void change({ removeProductIds: [p.id] })}>{p.name}<span aria-hidden="true"> ×</span></button>)}
      </div>
      <div className="sm-copilot-confirm__actions">{button('Rename collection', () => void edit('name'))}{button('Continue', () => go(state.automaticArtworkAvailable && state.artwork ? 'design' : 'artwork'), !state.products.length || Boolean(state.invalidProductIds?.length))}</div>
    </> : null}
    {state.step === 'artwork' ? <>
      <p role="status">Would you like to add your logo? Upload it using the + button below, or skip for now.</p>
      {state.artworkName ? <p>{state.artworkName} · {state.artworkStatus}</p> : null}
      <div className="sm-copilot-confirm__actions">{button('Upload logo', upload)}{button('Skip logo', () => void change({ artwork: 'none' }))}{button('Back', () => void edit('products'))}
        {state.artwork ? button('Next', () => go('design')) : null}</div>
    </> : null}
    {uploadedArtwork && uploadedArtwork.id !== state.artworkAttachmentId ? button(`Use uploaded artwork: ${uploadedArtwork.name}`, () => void change({ artworkAttachmentId: uploadedArtwork.id })) : null}
    {state.step === 'design' ? <>
      {state.savedDesignChanged ? <p role="status">{state.automaticArtworkAvailable ? 'Your saved design changed. Review the updated design before continuing.' : 'The saved design changed in the editor. Choose Reload saved design to review its current name, products and artwork before continuing.'}</p> : null}
      <p role="status">{state.automaticArtworkAvailable ? state.artwork === 'upload' ? 'Review the Apply card to choose where your logo will go.' : state.artwork === 'saved' ? state.designReady ? 'How do these look? Continue to choose a store, or edit the placement.' : 'Review your saved design before continuing.' : 'No logo selected. Ready to choose a store?' : `${state.artworkStatus}. ${state.hasUnsavedChanges ? 'Save your selections to continue in the designer.' : 'Review your saved design.'}`}</p>
      {state.artwork === 'upload' && state.artworkPreviewUrl && uploadedArtwork?.id !== state.artworkAttachmentId ? <figure className="sm-swag-logo">
        <img src={resolveMediaUrl(state.artworkPreviewUrl)} alt="Uploaded logo, not yet applied" width={56} height={56} />
        <figcaption>{state.artworkName || 'Uploaded logo'}</figcaption>
      </figure> : null}
      {state.automaticArtworkAvailable && state.artwork === 'upload' && state.persisted ? <p>Existing saved designs are shown for comparison. The uploaded logo is not applied yet.</p> : null}
      <SwagSavedPreviews source={state} inline={state.automaticArtworkAvailable} />
      {state.automaticArtworkAvailable ? <>
        {state.artwork === 'upload' ? <>
          <button type="button" className="sm-copilot-confirm__cancel" disabled={busy && !pending || artworkReviewState === 'unverified'}
            onClick={() => { setChoosingArtworkProducts(true); void edit('design'); }}>Choose Products</button>
          {choosingArtworkProducts && !pending ? <>
            <fieldset disabled={busy}><legend>Products to customize</legend>{state.products.map(product => {
              const ids = state.artworkProductIds || state.productIds;
              return <label key={product.id}><input type="checkbox" checked={ids.includes(product.id)}
                disabled={busy || ids.length === 1 && ids.includes(product.id)}
                onChange={() => void change({ artworkProductIds: ids.includes(product.id) ? ids.filter(id => id !== product.id) : [...ids, product.id] })} />{product.name}</label>;
            })}</fieldset>
            <label><input type="checkbox" disabled={busy} checked={state.replaceArtwork === true}
              onChange={event => void change({ replaceArtwork: event.target.checked })} />Replace existing designs on these products, including all print areas (requires approval)</label>
            {button('Review artwork application', () => { preparedArtwork.current = null; setChoosingArtworkProducts(false); })}
          </> : null}
          {artworkReviewState === 'unverified' ? <p role="status">The previous artwork application is not verified. Check its status before making another change.</p> : null}
          {!pending && !choosingArtworkProducts ? button('Review artwork application', () => void prepare('apply'), artworkReviewState === 'unverified') : null}
        </> : null}
        <div className="sm-copilot-confirm__actions">
          {state.artwork === 'saved' && !state.designReady && !state.savedDesignChanged && state.artworkAttachmentId ? button('Apply uploaded logo', () => void change({ artwork: 'upload' })) : null}
          {state.editorPath && !state.hasUnsavedChanges ? <a className="sm-copilot-confirm__cancel" href={tenantPath(state.editorPath)} target="_blank" rel="noreferrer">Edit Placement</a> : null}
          {state.artwork !== 'none' ? button('Change logo', upload) : button('Upload logo', upload)}
          {state.artwork === 'upload' ? button('Skip logo', () => void change({ artwork: 'none' }), pending) : null}
          {button('Back', () => void edit('products'))}{state.artwork !== 'upload' ? button(state.artwork === 'saved' ? 'Looks good' : 'Continue', () => go('stores'), !state.designReady) : null}
        </div>
        {state.savedDesignChanged ? button('Review updated design', () => void change({ collectionId: state.collectionId })) : null}
        <details><summary>Save for later</summary>{button('Save Design', () => void prepare('save'), pending)}</details>
      </> : <>
      {!state.designReady ? <p>Save the design, open the existing designer to place your artwork, then reload the saved design here.</p> : null}
      <div className="sm-copilot-confirm__actions">
        {!state.persisted || state.hasUnsavedChanges ? button('Save Design', () => void prepare('save'), pending) : null}
        {state.editorPath && !state.hasUnsavedChanges ? <a className="sm-copilot-confirm__ok" href={tenantPath(state.editorPath)} target="_blank" rel="noreferrer">Open Designer / Apply Artwork</a> : null}
        {button('Back', () => void edit('artwork'))}{button('Next', () => go('stores'), !state.designReady)}
      </div>
      <details><summary>Artwork options</summary><div className="sm-copilot-confirm__actions">
        {state.collectionId ? button('Reload saved design', () => void change({ collectionId: state.collectionId })) : null}
        {button('Replace Artwork', upload)}{button('Remove Artwork', () => void change({ artwork: 'none' }), !state.artwork || state.artwork === 'none')}
      </div></details>
      </>}
    </> : null}
    {state.step === 'stores' ? <>
      <p>Which store would you like to publish your collection to?</p>
      <fieldset className="sm-swag-stores" disabled={busy}><legend className="sm-swag-visually-hidden">Select stores</legend>{state.storeOptions?.map(store => <label key={store.id}>
        <input type="checkbox" checked={state.shopIds.includes(store.id)} onChange={() => void change({ shopIds: state.shopIds.includes(store.id) ? state.shopIds.filter(id => id !== store.id) : [...state.shopIds, store.id] })} />
        {store.name}{store.status === 'draft' ? ' (draft store stays draft)' : ''}
      </label>)}</fieldset>
      {!state.storeOptions?.length ? <p>No eligible stores are available.</p> : null}
      <div className="sm-copilot-confirm__actions">{button('Back', () => void edit('design'))}{button('Next', () => void review(), !state.shopIds.length || pending || Boolean(state.invalidStoreIds?.length))}</div>
    </> : null}
    {state.step === 'review' ? pending ? <p>Review the confirmation card above. Publishing requires Confirm &amp; Publish.</p> : <>
      <p>Ready to review {state.name} with {state.products.length} products?</p>
      <details><summary>Design details</summary><dl className="sm-copilot-confirm__preview">{swagRows(state).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></details>
      <div className="sm-copilot-confirm__actions">{button('Back / Edit', () => void edit('stores'))}{button('Review for confirmation', () => void prepare('publish'))}</div>
    </> : null}
  </section>;
}
