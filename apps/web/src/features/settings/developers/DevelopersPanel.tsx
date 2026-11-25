import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createApiKey,
  deleteTenantSkuMapping,
  getDevelopersOverview,
  getTenantCatalogProduct,
  listApiKeys,
  listTenantSkuMappings,
  revokeApiKey,
  saveTenantSkuMapping,
  searchTenantCatalog,
  type ApiKeyMode,
  type ApiKeyRow,
  type ApiKeyScope,
  type DevelopersOverview,
  type TenantCatalogProduct,
  type TenantSkuMapping,
} from "@/services/developers-api";
import { CatalogMatchPanel } from "@/features/catalog-match/CatalogMatchPanel";
import { tenantCatalogMatch } from "@/services/catalog-match-api";
import { WebhooksSection } from "./WebhooksSection";

const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  "orders:write": "Create & cancel orders",
  "orders:read": "Read orders",
  "products:read": "Read products",
  "sku_mappings:read": "Read SKU mappings",
  "sku_mappings:write": "Manage SKU mappings",
};

const ALL_SCOPES = Object.keys(SCOPE_LABEL) as ApiKeyScope[];

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Request failed";
}

function when(v: string | null) {
  return v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed — select and copy manually"),
  );
}

/** Settings → Developers: API keys, webhooks and SKU mappings for the public Orders API. */
export function DevelopersPanel({ canWrite }: { canWrite: boolean }) {
  const [overview, setOverview] = useState<DevelopersOverview | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [mappings, setMappings] = useState<TenantSkuMapping[] | null>(null);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; key: ApiKeyRow } | null>(null);
  const [mappingDraft, setMappingDraft] = useState<Partial<TenantSkuMapping> | null>(null);
  const matchClient = useMemo(() => tenantCatalogMatch(), []);
  const reloadMappings = useCallback(() => {
    listTenantSkuMappings().then(setMappings).catch(() => {});
  }, []);

  const reload = useCallback(() => {
    setError("");
    Promise.all([getDevelopersOverview(), listApiKeys(), listTenantSkuMappings()])
      .then(([o, k, m]) => {
        setOverview(o);
        setKeys(k);
        setMappings(m);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    if (canWrite) reload();
  }, [canWrite, reload]);

  async function revoke(k: ApiKeyRow) {
    if (!window.confirm(`Revoke "${k.name}"? Requests using this key fail immediately. This cannot be undone.`)) return;
    try {
      await revokeApiKey(k.id);
      toast.success("Key revoked");
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  async function removeMapping(m: TenantSkuMapping) {
    if (!window.confirm(`Remove the mapping for ${m.externalSku}?`)) return;
    try {
      await deleteTenantSkuMapping(m._id);
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  if (!canWrite) {
    return (
      <div className="settings-panel">
        <div className="settings-panel__head">
          <h2 className="settings-panel__title">Developers</h2>
          <p className="settings-panel__sub">Only company admins can manage API access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <div className="settings-panel__head">
        <h2 className="settings-panel__title">Developers</h2>
        <p className="settings-panel__sub">
          Send orders to ShelfMerch from your own store or system with the Orders API. We print, pack and ship them,
          and report status back.
        </p>
      </div>

      {error && (
        <section className="settings-section">
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
        </section>
      )}

      {overview && (
        <section className="settings-section">
          <span className="settings-section__label">API base URL</span>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ wordBreak: "break-all" }}>{overview.apiBaseUrl}</code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(overview.apiBaseUrl)}>Copy</button>
            <a className="btn btn-ghost btn-sm" href={overview.docsUrl} target="_blank" rel="noreferrer">API docs</a>
          </div>
        </section>
      )}

      <section className="settings-section">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <span className="settings-section__label">API keys</span>
            <p className="settings-section__hint" style={{ margin: 0 }}>
              Test keys (<code>smk_test_…</code>) create sandbox orders that are never produced. Use live keys
              (<code>smk_live_…</code>) in production. Keep keys on your server — never in a browser or app.
            </p>
          </div>
          <button type="button" className="btn btn-brand btn-sm" onClick={() => setCreateOpen(true)}>Create key</button>
        </div>
        {!keys ? (
          <p className="muted">Loading…</p>
        ) : !keys.length ? (
          <p className="muted">No API keys yet.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Key</th><th>Access</th><th>Last used</th><th /></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>
                    {k.name}{" "}
                    <span className={`tag ${k.mode === "live" ? "tag-live" : "tag-draft"}`}>{k.mode === "live" ? "Live" : "Test"}</span>
                  </td>
                  <td><code>{k.prefix}</code></td>
                  <td style={{ fontSize: 12.5 }}>{k.scopes.map((s) => SCOPE_LABEL[s]).join(", ")}</td>
                  <td>{when(k.lastUsedAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => revoke(k)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <WebhooksSection />

      <section className="settings-section">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <span className="settings-section__label">Your SKUs</span>
            <p className="settings-section__hint" style={{ margin: 0 }}>
              Map the SKUs your system already uses to ShelfMerch products, then send them as <code>items[].sku</code>.
              You can also send your branded listing IDs or ShelfMerch SKUs directly.
            </p>
          </div>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setMappingDraft({})}>Add SKU</button>
        </div>
        {!mappings ? (
          <p className="muted">Loading…</p>
        ) : !mappings.length ? (
          <p className="muted">No SKU mappings yet.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Your SKU</th><th>ShelfMerch product</th><th>Variant</th><th /></tr></thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m._id}>
                  <td><code>{m.externalSku}</code></td>
                  <td>{m.product ? `${m.product.name} · ${m.product.sku}` : <span style={{ color: "var(--danger)" }}>Product removed</span>}</td>
                  <td>{[m.variant?.size, m.variant?.color].filter(Boolean).join(" / ") || <span className="muted">From each order</span>}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMappingDraft(m)}>Edit</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeMapping(m)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="settings-section">
        <span className="settings-section__label">Match your catalog automatically</span>
        <p className="settings-section__hint" style={{ marginTop: 0 }}>
          Upload your product list and we map each SKU to the closest ShelfMerch product using SKU and barcode, name,
          brand and model, product type, material and size/colour. Confident matches are mapped straight away; the rest
          wait here for you to accept, change or reject.
        </p>
        <CatalogMatchPanel client={matchClient} searchProducts={searchTenantCatalog} onMappingsChanged={reloadMappings} />
      </section>

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(token, key) => {
          setCreateOpen(false);
          setNewToken({ token, key });
          reload();
        }}
      />
      <NewTokenDialog value={newToken} onClose={() => setNewToken(null)} />
      {mappingDraft && (
        <SkuMappingDialog
          draft={mappingDraft}
          onClose={() => setMappingDraft(null)}
          onSaved={() => {
            setMappingDraft(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (token: string, key: ApiKeyRow) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ApiKeyMode>("test");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(ALL_SCOPES);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setMode("test");
      setScopes(ALL_SCOPES);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      const res = await createApiKey({ name: name.trim(), mode, scopes });
      onCreated(res.token, res.apiKey);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>Name it after the system that will use it, e.g. "Website checkout".</DialogDescription>
        </DialogHeader>
        <div className="field">
          <label className="lbl" htmlFor="key-name">Name</label>
          <input id="key-name" className="inp" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Mode</span>
          <div className="row" style={{ gap: 16 }}>
            {(["test", "live"] as const).map((m) => (
              <label key={m} className="row" style={{ gap: 6, alignItems: "center" }}>
                <input type="radio" name="key-mode" checked={mode === m} onChange={() => setMode(m)} />
                {m === "test" ? "Test — sandbox orders, never produced" : "Live — real orders, printed and shipped"}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Access</span>
          {ALL_SCOPES.map((s) => (
            <label key={s} className="row" style={{ gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))}
              />
              {SCOPE_LABEL[s]} <code style={{ fontSize: 12 }}>{s}</code>
            </label>
          ))}
        </div>
        <DialogFooter>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className="btn btn-brand btn-sm" disabled={busy || !name.trim() || !scopes.length} onClick={submit}>
            {busy ? "Creating…" : "Create key"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The only time the full key is ever shown. */
function NewTokenDialog({ value, onClose }: { value: { token: string; key: ApiKeyRow } | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy your API key now</DialogTitle>
          <DialogDescription>
            For security we only show it once. Store it in your server's secrets. If you lose it, revoke it and create a new one.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <code style={{ wordBreak: "break-all", flex: 1, padding: 10, background: "var(--bg-2, #f5f5f5)", borderRadius: 8 }}>{value.token}</code>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => copy(value.token)}>Copy</button>
          </div>
        )}
        <DialogFooter>
          <button type="button" className="btn btn-brand btn-sm" onClick={onClose}>I've saved it</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FOLLOW_ORDER = "__follow__";

function SkuMappingDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: Partial<TenantSkuMapping>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(draft._id);
  const [externalSku, setExternalSku] = useState(draft.externalSku ?? "");
  const [search, setSearch] = useState(draft.product?.name ?? "");
  const [results, setResults] = useState<TenantCatalogProduct[]>([]);
  const [product, setProduct] = useState<TenantCatalogProduct | null>(
    draft.catalogProductId ? { _id: draft.catalogProductId, name: draft.product?.name ?? "", sku: draft.product?.sku ?? "" } : null,
  );
  const [variantKey, setVariantKey] = useState(
    draft.variant?.size || draft.variant?.color ? `${draft.variant.size}|${draft.variant.color}` : FOLLOW_ORDER,
  );
  const [artworkUrl, setArtworkUrl] = useState(draft.artworkUrl ?? "");
  const [busy, setBusy] = useState(false);

  // Editing: the saved row has no variant list — load it so the picker shows.
  useEffect(() => {
    if (product && !product.variants) {
      getTenantCatalogProduct(product._id)
        .then((p) => setProduct((cur) => (cur && cur._id === p._id ? { ...cur, variants: p.variants ?? [] } : cur)))
        .catch(() => {});
    }
  }, [product]);

  useEffect(() => {
    if (product || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchTenantCatalog(search.trim()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [search, product]);

  async function save() {
    if (!product) return;
    setBusy(true);
    try {
      const [size, color] = variantKey === FOLLOW_ORDER ? ["", ""] : variantKey.split("|");
      await saveTenantSkuMapping({ externalSku: externalSku.trim(), catalogProductId: product._id, variant: { size, color }, artworkUrl: artworkUrl.trim() });
      toast.success("SKU mapping saved");
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
      setBusy(false);
    }
  }

  const variants = (product?.variants ?? []).filter((v) => v.size || v.color);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit SKU" : "Add SKU"}</DialogTitle>
          <DialogDescription>Orders sent with this SKU are made as the ShelfMerch product you pick.</DialogDescription>
        </DialogHeader>
        <div className="field">
          <label className="lbl" htmlFor="ext-sku">Your SKU</label>
          <input id="ext-sku" className="inp" value={externalSku} disabled={editing || busy} onChange={(e) => setExternalSku(e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">ShelfMerch product</span>
          {product ? (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <b style={{ flex: 1 }}>{product.name} <span className="muted">· {product.sku}</span></b>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setProduct(null); setVariantKey(FOLLOW_ORDER); }}>Change</button>
            </div>
          ) : (
            <>
              <input className="inp" placeholder="Search the catalog…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {results.length > 0 && (
                <div className="card" style={{ marginTop: 6, maxHeight: 200, overflow: "auto" }}>
                  {results.map((p) => (
                    <button key={p._id} type="button" className="btn btn-ghost btn-sm" style={{ display: "block", width: "100%", textAlign: "left" }} onClick={() => setProduct(p)}>
                      {p.name} <span className="muted">· {p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {product && variants.length > 0 && (
          <div className="field">
            <label className="lbl" htmlFor="variant">Variant</label>
            <select id="variant" className="inp" value={variantKey} disabled={busy} onChange={(e) => setVariantKey(e.target.value)}>
              <option value={FOLLOW_ORDER}>Use the size / colour sent with each order</option>
              {variants.map((v) => (
                <option key={`${v.size}|${v.color}`} value={`${v.size ?? ""}|${v.color ?? ""}`}>
                  Always {[v.size, v.color].filter(Boolean).join(" / ")}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label className="lbl" htmlFor="artwork">Artwork URL (optional)</label>
          <input id="artwork" className="inp" placeholder="https://… your logo to print" value={artworkUrl} disabled={busy} onChange={(e) => setArtworkUrl(e.target.value)} />
        </div>
        <DialogFooter>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-brand btn-sm" disabled={busy || !externalSku.trim() || !product} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
