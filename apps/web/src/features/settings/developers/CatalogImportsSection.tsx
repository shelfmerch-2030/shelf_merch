import { useEffect, useState } from "react";
import { getCatalogImports, type CatalogImportRow } from "@/services/developers-api";

const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * Catalog imports made over the public API (POST /catalog/imports). Read-only: clients import from their
 * own platform with an API key; this shows what arrived.
 */
export function CatalogImportsSection() {
  const [data, setData] = useState<{ importedCount: number; imports: CatalogImportRow[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getCatalogImports()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <section className="settings-section">
      <span className="settings-section__label">Catalog imports</span>
      <p className="settings-section__hint" style={{ marginTop: 0 }}>
        Import ShelfMerch products into your own store or system with the Catalog API (<code>GET /catalog/products</code>,{" "}
        <code>POST /catalog/imports</code>), then order them by <code>variant_id</code> — no SKUs of your own needed. Imported
        products send <code>catalog.product.*</code> webhooks when their price, availability or details change.
      </p>
      {error ? (
        <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
      ) : !data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p style={{ margin: "0 0 10px" }}>
            Products imported: <b>{data.importedCount.toLocaleString("en-IN")}</b>
          </p>
          {!data.imports.length ? (
            <p className="muted">No imports yet.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Scope</th>
                  <th>Imported</th>
                  <th>Updated</th>
                  <th>Skipped</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {data.imports.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {when(i.created_at)} <span className={`tag ${i.mode === "live" ? "tag-live" : "tag-draft"}`}>{i.mode === "live" ? "Live" : "Test"}</span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {i.scope.all ? `All products${i.scope.category ? ` in ${i.scope.category}` : ""}` : `${i.scope.product_ids?.length ?? 0} selected`}
                    </td>
                    <td>{i.summary.imported}</td>
                    <td>{i.summary.updated}</td>
                    <td>{i.summary.skipped}</td>
                    <td style={i.summary.failed ? { color: "var(--danger)" } : undefined}>{i.status === "failed" ? "Import failed" : i.summary.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
