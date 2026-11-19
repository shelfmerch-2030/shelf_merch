import { useEffect, useRef, useState } from "react";
import { tenantPath } from "@/lib/workspaceSlug";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { CopilotArtifacts, type SwagProductControls } from "./CopilotProductCards";
import { SwagSavedPreviews } from "./SwagSavedPreviews";
import { swagRows } from "./swagPresentation";
import { browseSwagCatalog, type SwagCatalogPage, type SwagPatch, type SwagState, type SwagStep } from "./swagApi";

export function SwagWorkflowPanel({ state, busy, error, hasCatalog, pending, change, prepare, edit, upload, uploadedArtwork }: {
  state: SwagState; busy: boolean; error: string | null; hasCatalog: boolean; pending: boolean;
  change: (patch: SwagPatch) => Promise<SwagState | undefined>;
  prepare: (action: "save" | "publish", expectedRevision?: number) => Promise<void>; edit: (step: SwagStep) => Promise<void>;
  upload: () => void; uploadedArtwork?: { id: string; name: string };
}) {
  const [name, setName] = useState(state.name);
  const [query, setQuery] = useState(/winter/i.test(state.name) ? "hoodie" : "");
  const [category, setCategory] = useState("");
  const [catalog, setCatalog] = useState<SwagCatalogPage | null>(null);
  const [appliedQuery, setAppliedQuery] = useState({ query, category });
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const search = useRef(0);
  useEffect(() => { setName(state.name); }, [state.name]);
  useEffect(() => () => { search.current++; }, []);
  async function browse(filters = { query, category }) {
    const request = ++search.current;
    setCatalogBusy(true); setCatalogError(null);
    try {
      const result = await browseSwagCatalog(state.conversationId, { ...filters, page: 1, limit: 6 });
      if (request === search.current) { setCatalog(result); setAppliedQuery(filters); }
    } catch (err) { if (request === search.current) setCatalogError(err instanceof Error ? err.message : "Could not browse products"); }
    finally { if (request === search.current) setCatalogBusy(false); }
  }
  useEffect(() => {
    if (state.step === 'products' && !hasCatalog && !catalog) {
      const initialQuery = /winter/i.test(state.name) ? 'hoodie' : query;
      setQuery(initialQuery); void browse({ query: initialQuery, category });
    }
  }, [state.step]); // Initial browse only; filters change on explicit Search.
  const controls: SwagProductControls = { selectedIds: state.productIds, busy, onToggle: id => void change(state.productIds.includes(id) ? { removeProductIds: [id] } : { addProductIds: [id] }) };
  const go = (step: SwagStep) => void change({ step });
  const button = (text: string, click: () => void, disabled = false) => <button type="button" className="sm-copilot-confirm__cancel" disabled={busy || disabled} onClick={click}>{text}</button>;
  async function review() {
    const next = await change({ step: 'review' });
    if (next) await prepare('publish', next.revision);
  }
  if (!state.active) return null;
  return <section className="sm-swag-flow" aria-label="Swag Design workflow" aria-busy={busy}>
    <header><strong>{state.name || 'Design your swag'}</strong><span>{state.products.length} selected · {state.step}</span></header>
    {error ? <p role="alert" className="sm-copilot-attach-error">{error}</p> : null}
    {state.invalidProductIds?.length ? <p role="alert">A selected product is no longer eligible. Remove the unavailable selection before continuing.</p> : null}
    {state.step === 'name' ? <form onSubmit={event => { event.preventDefault(); void change({ name }); }}>
      <label>Collection name<input value={name} onChange={e => setName(e.target.value)} maxLength={160} /></label>
      <button className="sm-copilot-confirm__ok" disabled={busy || !name.trim()}>Continue</button>
    </form> : null}
    {state.step === 'products' ? <>
      <p>Select products below or tell me which ones to add. You can browse another category at any time.</p>
      <form className="sm-swag-search" onSubmit={event => { event.preventDefault(); void browse(); }}>
        <label>Search products<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Product name" maxLength={80} /></label>
        <label>Category<input value={category} onChange={e => setCategory(e.target.value)} placeholder="All categories" maxLength={80} /></label>
        <button className="sm-copilot-confirm__cancel" disabled={busy || catalogBusy}>Search catalog</button>
      </form>
      {catalogError ? <p role="alert">{catalogError}</p> : null}
      {catalogBusy ? <p role="status">Loading catalog…</p> : null}
      {catalog ? <CopilotArtifacts key={`${appliedQuery.query}:${appliedQuery.category}:${catalog.items.map(p => p.id).join(',')}`} conversationId={state.conversationId} swag={controls}
        artifacts={[...catalog.items.map(product => ({ kind: 'product' as const, product })), { kind: 'catalog_page', catalog: { query: { ...appliedQuery, limit: 6 }, pagination: catalog.pagination } }]} /> : null}
      {catalog && !catalog.items.length ? <p>No matching products. Try another search or clear the category.</p> : null}
      <div className="sm-swag-selection" aria-label="Selected products"><strong>{state.products.length} selected products</strong>
        <ul>{state.products.map(p => <li key={p.id}>{p.name} {button(`Remove ${p.name}`, () => void change({ removeProductIds: [p.id] }))}</li>)}</ul>
      </div>
      <div className="sm-copilot-confirm__actions">{button('Back', () => void edit('name'))}{button('Next', () => go('artwork'), !state.products.length || Boolean(state.invalidProductIds?.length))}</div>
    </> : null}
    {state.step === 'artwork' ? <>
      <p>Would you like to upload a logo or continue without artwork?</p>
      {state.artworkName ? <p>{state.artworkName} · {state.artworkStatus}</p> : null}
      <div className="sm-copilot-confirm__actions">{button('Upload Artwork', upload)}{button('Skip Artwork', () => void change({ artwork: 'none' }))}{button('Back', () => void edit('products'))}
        {state.artwork ? button('Next', () => go('design')) : null}</div>
    </> : null}
    {uploadedArtwork && uploadedArtwork.id !== state.artworkAttachmentId ? button(`Use uploaded artwork: ${uploadedArtwork.name}`, () => void change({ artworkAttachmentId: uploadedArtwork.id })) : null}
    {state.step === 'design' ? <>
      {state.savedDesignChanged ? <p role="status">The saved design changed in the editor. Choose Reload saved design to review its current name, products and artwork before continuing.</p> : null}
      <p>{state.artworkStatus}. {state.hasUnsavedChanges ? 'Selections have unsaved changes.' : 'Showing the recorded saved design.'}</p>
      {state.artworkName ? <p>{state.artworkName}</p> : null}
      {state.artworkPreviewUrl ? <img className="sm-swag-artwork-preview" src={resolveMediaUrl(state.artworkPreviewUrl)} alt="Uploaded or saved artwork, not a product mockup" width={100} height={100} /> : null}
      <SwagSavedPreviews source={state} />
      {!state.designReady ? <p>Save the design, open the existing designer to place your artwork, then reload the saved design here.</p> : null}
      <div className="sm-copilot-confirm__actions">
        {button('Save Design', () => void prepare('save'), pending)}
        {state.editorPath && !state.hasUnsavedChanges ? <a className="sm-copilot-confirm__ok" href={tenantPath(state.editorPath)} target="_blank" rel="noreferrer">Open Designer / Apply Artwork</a> : null}
        {state.collectionId ? button('Reload saved design', () => void change({ collectionId: state.collectionId })) : null}
        {button('Replace Artwork', upload)}{button('Remove Artwork', () => void change({ artwork: 'none' }), !state.artwork || state.artwork === 'none')}
        {button('Back', () => void edit('artwork'))}{button('Next', () => go('stores'), !state.designReady)}
      </div>
    </> : null}
    {state.step === 'stores' ? <>
      <p>Which store would you like to publish your collection to?</p>
      <fieldset disabled={busy}><legend>Select stores</legend>{state.storeOptions?.map(store => <label key={store.id}>
        <input type="checkbox" checked={state.shopIds.includes(store.id)} onChange={() => void change({ shopIds: state.shopIds.includes(store.id) ? state.shopIds.filter(id => id !== store.id) : [...state.shopIds, store.id] })} />
        {store.name}{store.status === 'draft' ? ' (draft store stays draft)' : ''}
      </label>)}</fieldset>
      {!state.storeOptions?.length ? <p>No eligible stores are available.</p> : null}
      <div className="sm-copilot-confirm__actions">{button('Back', () => void edit('design'))}{button('Next', () => void review(), !state.shopIds.length || pending || Boolean(state.invalidStoreIds?.length))}</div>
    </> : null}
    {state.step === 'review' ? pending ? <p>Review the confirmation card above. Publishing requires Confirm &amp; Publish.</p> : <>
      <strong>Review Swag Collection</strong>
      <dl className="sm-copilot-confirm__preview">{swagRows(state).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      <div className="sm-copilot-confirm__actions">{button('Back / Edit', () => void edit('stores'))}{button('Review for confirmation', () => void prepare('publish'))}</div>
    </> : null}
  </section>;
}
