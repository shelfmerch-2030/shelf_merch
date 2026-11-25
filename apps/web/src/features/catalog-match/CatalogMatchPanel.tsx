import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogConnection,
  CatalogMatchClient,
  MatchCandidate,
  MatchItem,
  MatchRun,
  MatchStatus,
} from "@/services/catalog-match-api";
import "./catalog-match.css";

export type ProductHit = { _id: string; name: string; sku: string };

const PAGE_SIZE = 50;

/** Tiles double as filters. `statuses` is what the items endpoint is asked for. */
const TILES: { key: string; label: string; count: (r: MatchRun) => number; statuses: MatchStatus[]; tone: string }[] = [
  { key: "all", label: "Scanned", count: (r) => r.counts.scanned, statuses: [], tone: "neutral" },
  { key: "auto", label: "Auto-mapped", count: (r) => r.counts.autoMapped, statuses: ["auto_mapped", "accepted"], tone: "good" },
  { key: "review", label: "Needs review", count: (r) => r.counts.review, statuses: ["review"], tone: "warn" },
  { key: "none", label: "No match", count: (r) => r.counts.noMatch, statuses: ["no_match", "rejected"], tone: "bad" },
  { key: "already", label: "Already mapped", count: (r) => r.counts.alreadyMapped, statuses: ["already_mapped"], tone: "neutral" },
  { key: "invalid", label: "Invalid rows", count: (r) => r.counts.invalid, statuses: ["invalid"], tone: "neutral" },
];

const STATUS_LABEL: Record<MatchStatus, string> = {
  auto_mapped: "Auto-mapped",
  accepted: "Accepted",
  review: "Needs review",
  no_match: "No match",
  rejected: "Rejected",
  already_mapped: "Already mapped",
  undone: "Undone",
  invalid: "Invalid",
};

const TEMPLATE = "sku,barcode,name,brand,model,category,size,color,material,image_url\nTEE-NAVY-L,,Organic Crew Neck Tee,Acme,,T-Shirts,L,Navy,Organic Cotton,\n";

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Request failed";
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "");

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "catalog-matching-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function variantText(v: { size?: string; color?: string } | null | undefined) {
  return [v?.size, v?.color].filter(Boolean).join(" / ");
}

/**
 * Bulk catalog matching. Shared by Settings → Developers (client self-serve, CSV) and the platform tenant page
 * (ops, CSV or a client API connection).
 */
export function CatalogMatchPanel({
  client,
  searchProducts,
  allowApiSource = false,
  canWrite = true,
  onMappingsChanged,
}: {
  client: CatalogMatchClient;
  searchProducts: (q: string) => Promise<ProductHit[]>;
  allowApiSource?: boolean;
  canWrite?: boolean;
  /** Called after anything that may have created or removed SKU mappings. */
  onMappingsChanged?: () => void;
}) {
  const [runs, setRuns] = useState<MatchRun[] | null>(null);
  const [runId, setRunId] = useState<string>("");
  const [connections, setConnections] = useState<CatalogConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRuns = useCallback(
    async (select?: string) => {
      try {
        const list = await client.listRuns();
        setRuns(list);
        setRunId((cur) => select ?? (list.some((r) => r._id === cur) ? cur : list[0]?._id ?? ""));
      } catch (e) {
        setError(errorText(e));
      }
    },
    [client],
  );

  useEffect(() => {
    void loadRuns();
    if (allowApiSource) {
      client
        .listConnections()
        .then((c) => {
          setConnections(c);
          setConnectionId(c[0]?._id ?? "");
        })
        .catch(() => setConnections([]));
    }
  }, [client, allowApiSource, loadRuns]);

  async function start(fn: () => Promise<MatchRun>) {
    setBusy(true);
    setError("");
    try {
      const run = await fn();
      toast.success(`Scanned ${run.counts.scanned} products — ${run.counts.autoMapped} mapped automatically`);
      await loadRuns(run._id);
      onMappingsChanged?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const run = runs?.find((r) => r._id === runId) ?? null;

  return (
    <div className="cm">
      {canWrite && (
        <div className="cm-source">
          <div className="cm-source__row">
            <label className={`btn btn-brand btn-sm${busy ? " is-disabled" : ""}`}>
              {busy ? "Matching…" : "Upload catalog (CSV / XLSX)"}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                hidden
                disabled={busy}
                aria-label="Catalog file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void start(() => client.uploadFile(f));
                }}
              />
            </label>
            {allowApiSource && connections.length > 0 && (
              <>
                <span className="muted">or read from</span>
                <select className="inp cm-select" value={connectionId} disabled={busy} onChange={(e) => setConnectionId(e.target.value)} aria-label="Client API">
                  {connections.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.shopDomain}{c.productsPath})
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-soft btn-sm" disabled={busy || !connectionId} onClick={() => void start(() => client.runFromConnection(connectionId))}>
                  Fetch &amp; match
                </button>
              </>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
              Download template
            </button>
          </div>
          <p className="cm-hint">
            Columns are recognised by name: <code>sku</code> (required), <code>name</code> or <code>barcode</code>/<code>gtin</code>,
            and optionally <code>brand</code>, <code>model</code>, <code>category</code>, <code>size</code>, <code>color</code>,{" "}
            <code>material</code>. One row per variant, up to 5,000 rows. SKUs you have already mapped are never changed.
          </p>
        </div>
      )}

      {error && <p className="cm-error">{error}</p>}

      {!runs ? (
        <p className="muted">Loading…</p>
      ) : !runs.length ? (
        <p className="muted">No matching runs yet.</p>
      ) : (
        <>
          {runs.length > 1 && (
            <select className="inp cm-select" value={runId} onChange={(e) => setRunId(e.target.value)} aria-label="Matching run">
              {runs.map((r) => (
                <option key={r._id} value={r._id}>
                  {when(r.createdAt)} · {r.source === "csv" ? r.fileName || "CSV" : "Client API"} · {r.counts.scanned} rows
                  {r.undoneAt ? " (undone)" : ""}
                </option>
              ))}
            </select>
          )}
          {run && <RunView key={run._id} run={run} client={client} searchProducts={searchProducts} canWrite={canWrite} onChanged={async () => {
                await loadRuns(run._id);
                onMappingsChanged?.();
              }} />}
        </>
      )}
    </div>
  );
}

function RunView({
  run,
  client,
  searchProducts,
  canWrite,
  onChanged,
}: {
  run: MatchRun;
  client: CatalogMatchClient;
  searchProducts: (q: string) => Promise<ProductHit[]>;
  canWrite: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [tile, setTile] = useState(run.counts.review ? "review" : "all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: MatchItem[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const statuses = useMemo(() => TILES.find((t) => t.key === tile)?.statuses ?? [], [tile]);

  const load = useCallback(async () => {
    try {
      setData(await client.listItems(run._id, { status: statuses.join(",") || undefined, page, limit: PAGE_SIZE }));
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [client, run._id, statuses, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function acceptAll() {
    if (!window.confirm(`Accept the top suggestion for every SKU that needs review? SKUs where two products are equally likely, or the size/colour isn't offered, are left for you.`)) return;
    setBusy(true);
    try {
      const r = await client.acceptSuggestions(run._id);
      toast.success(`Accepted ${r.accepted}${r.skipped ? ` · ${r.skipped} still need you` : ""}`);
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!window.confirm(`Remove the ${run.counts.autoMapped} mappings this run created automatically? Ones you accepted by hand stay.`)) return;
    await act(async () => {
      const r = await client.undoRun(run._id);
      toast.success(`Removed ${r.removedMappings} mappings`);
    });
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="cm-run">
      {run.status === "failed" && <p className="cm-error">This run failed: {run.error}</p>}
      <div className="cm-tiles" role="tablist">
        {TILES.filter((t) => t.key !== "invalid" || run.counts.invalid).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tile === t.key}
            className={`cm-tile cm-tile--${t.tone}${tile === t.key ? " is-active" : ""}`}
            onClick={() => {
              setTile(t.key);
              setPage(1);
            }}
          >
            <span className="cm-tile__n">{t.count(run).toLocaleString("en-IN")}</span>
            <span className="cm-tile__l">{t.label}</span>
          </button>
        ))}
      </div>

      {canWrite && (
        <div className="cm-actions">
          {run.counts.review > 0 && (
            <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => void acceptAll()}>
              Accept all suggestions
            </button>
          )}
          {run.counts.autoMapped > 0 && !run.undoneAt && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void undo()}>
              Undo auto-mappings
            </button>
          )}
          {run.undoneAt && <span className="muted">Auto-mappings undone {when(run.undoneAt)}</span>}
        </div>
      )}

      {!data ? (
        <p className="muted">Loading…</p>
      ) : !data.items.length ? (
        <p className="muted">Nothing here.</p>
      ) : (
        <table className="tbl cm-table">
          <thead>
            <tr>
              <th>Client product</th>
              <th>ShelfMerch match</th>
              <th>Status</th>
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <ItemRow key={item._id} item={item} client={client} searchProducts={searchProducts} canWrite={canWrite} busy={busy} act={act} />
            ))}
          </tbody>
        </table>
      )}

      {pages > 1 && (
        <div className="cm-pager">
          <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function CandidateLine({ c }: { c: MatchCandidate }) {
  return (
    <div className="cm-cand">
      <div>
        <b>{c.name}</b> <span className="muted">· {c.variant?.sku || c.sku}</span>
        {variantText(c.variant) && <span className="muted"> · {variantText(c.variant)}</span>}
        <span className={`cm-score ${c.score >= 0.9 ? "is-high" : c.score >= 0.6 ? "is-mid" : "is-low"}`}>{pct(c.score)}</span>
      </div>
      <div className="cm-reasons">{c.reasons.join(" · ")}</div>
    </div>
  );
}

function ItemRow({
  item,
  client,
  searchProducts,
  canWrite,
  busy,
  act,
}: {
  item: MatchItem;
  client: CatalogMatchClient;
  searchProducts: (q: string) => Promise<ProductHit[]>;
  canWrite: boolean;
  busy: boolean;
  act: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState(item.candidates[0]?.catalogProductId ?? "");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [picked, setPicked] = useState<ProductHit | null>(null);

  useEffect(() => {
    if (!searching || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchProducts(query.trim()).then(setHits).catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [searching, query, searchProducts]);

  const open = ["review", "no_match", "rejected", "undone"].includes(item.status);
  const top = item.candidates[0];
  const chosen = item.candidates.find((c) => c.catalogProductId === choice);
  const targetId = picked?._id ?? chosen?.catalogProductId;

  return (
    <tr className={`cm-row cm-row--${item.status}`}>
      <td>
        <code>{item.client.sku || "—"}</code>
        <div>{item.client.name || <span className="muted">No name</span>}</div>
        <div className="muted cm-small">
          {[item.client.brand, item.client.model, variantText(item.client), item.client.barcode && `barcode ${item.client.barcode}`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </td>
      <td>
        {item.status === "invalid" || item.status === "already_mapped" ? (
          <span className="muted">{item.reviewReason || (item.status === "already_mapped" ? "Mapped before this run — left unchanged" : "")}</span>
        ) : !top ? (
          <span className="muted">No similar product found</span>
        ) : open && canWrite ? (
          <>
            {picked ? (
              <div className="cm-cand">
                <b>{picked.name}</b> <span className="muted">· {picked.sku} · picked by you</span>
              </div>
            ) : (
              <CandidateLine c={chosen ?? top} />
            )}
            {item.candidates.length > 1 && !picked && (
              <select className="inp cm-select cm-small" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={`Candidates for ${item.client.sku}`}>
                {item.candidates.map((c) => (
                  <option key={c.catalogProductId} value={c.catalogProductId}>
                    {pct(c.score)} · {c.name} ({c.sku})
                  </option>
                ))}
              </select>
            )}
            {item.reviewReason && <div className="cm-why">{item.reviewReason}</div>}
          </>
        ) : (
          <>
            <CandidateLine c={top} />
            {item.reviewReason && item.status === "review" && <div className="cm-why">{item.reviewReason}</div>}
          </>
        )}
        {searching && (
          <div className="cm-search">
            <input className="inp cm-small" autoFocus placeholder="Search ShelfMerch products…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {hits.length > 0 && (
              <ul className="cm-hits">
                {hits.map((h) => (
                  <li key={h._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(h);
                        setSearching(false);
                        setQuery("");
                      }}
                    >
                      {h.name} <span className="muted">· {h.sku}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </td>
      <td>
        <span className={`cm-status cm-status--${item.status}`}>{STATUS_LABEL[item.status]}</span>
      </td>
      {canWrite && (
        <td className="cm-row__actions">
          {open && (
            <>
              <button
                type="button"
                className="btn btn-brand btn-sm"
                disabled={busy || !targetId}
                onClick={() => void act(() => client.acceptItem(item._id, { catalogProductId: targetId }), `${item.client.sku} mapped`)}
              >
                Accept
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setSearching((s) => !s); setPicked(null); }}>
                {searching ? "Cancel" : "Pick other"}
              </button>
              {(item.status === "review" || item.status === "no_match") && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act(() => client.rejectItem(item._id))}>
                  Reject
                </button>
              )}
            </>
          )}
        </td>
      )}
    </tr>
  );
}
