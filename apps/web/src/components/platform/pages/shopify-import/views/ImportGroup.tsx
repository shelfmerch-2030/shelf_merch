import type { ShopifyImportSummary } from "../model";

const STATUSES = [
  { status: "imported", label: "Imported" },
  { status: "updated", label: "Updated" },
  { status: "skipped", label: "Skipped" },
  { status: "failed", label: "Failed" },
] as const;

/** Catalog or kit results grouped by import status. */
export function ImportGroup({
  label,
  hint,
  items,
}: {
  label: string;
  hint: string;
  items: ShopifyImportSummary["items"];
}) {
  return (
    <div
      className="card"
      style={{ flex: "1 1 280px", minWidth: 0, padding: 14, background: "var(--surface-2)" }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}
      >
        <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: 13.5 }}>
          {label}{" "}
          <span className="muted" style={{ fontWeight: "var(--font-weight-medium)" }}>
            ({items.length})
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          {hint}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
        {STATUSES.map(({ status, label: statusLabel }) => {
          const results = items.filter((item) => item.status === status);
          return (
            <section key={status} style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 12.5, margin: "4px 0 8px", color: status === "failed" ? "var(--danger)" : undefined }}>
                {statusLabel} ({results.length})
              </h3>
              {results.length > 0 ? (
                <ul
                  aria-label={`${statusLabel} ${label.toLowerCase()}`}
                  tabIndex={0}
                  style={{ fontSize: 12.5, paddingLeft: 16, margin: 0, maxHeight: 180, overflow: "auto", overflowWrap: "anywhere" }}
                >
                  {results.map((item, index) => (
                    <li key={`${item.title}-${index}`} style={{ marginBottom: 4 }}>
                      {item.title}
                      {status === "failed" && item.reason && (
                        <div style={{ color: "var(--danger)", marginTop: 2 }}>{item.reason}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  No {statusLabel.toLowerCase()} items.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
