type Props = {
  message?: string;
  fullScreen?: boolean;
  /** Visual density for inline page loads. */
  variant?: "page" | "list" | "compact";
};

/**
 * Modern SaaS loading: content skeletons + a thin edge progress bar.
 * No logo cards, spinners, or decorative dots.
 */
export function LoadingState({
  message = "Loading…",
  fullScreen = true,
  variant = "page",
}: Props) {
  const rows = variant === "compact" ? 4 : variant === "list" ? 7 : 6;

  return (
    <div
      className={
        fullScreen
          ? "sm-load sm-load--screen"
          : variant === "list"
            ? "sm-load sm-load--list"
            : variant === "compact"
              ? "sm-load sm-load--compact"
              : "sm-load sm-load--page"
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="sm-load__progress" aria-hidden="true">
        <span />
      </div>

      <div className="sm-load__body">
        {variant !== "compact" ? (
          <div className="sm-load__hero">
            <div className="sm-load__hero-copy">
              <span className="sm-skel sm-skel--title" />
              <span className="sm-skel sm-skel--sub" />
            </div>
            <span className="sm-skel sm-skel--btn" />
          </div>
        ) : null}

        {variant === "page" ? (
          <div className="sm-load__kpis">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="sm-load__kpi">
                <span className="sm-skel sm-skel--caption" />
                <span className="sm-skel sm-skel--num" />
                <span className="sm-skel sm-skel--hint" />
              </div>
            ))}
          </div>
        ) : null}

        <div className="sm-load__panel">
          <div className="sm-load__toolbar">
            <span className="sm-skel sm-skel--search" />
            <span className="sm-skel sm-skel--chip" />
            <span className="sm-skel sm-skel--chip" />
          </div>
          <div className="sm-load__rows">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="sm-load__row" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="sm-skel sm-skel--avatar" />
                <div className="sm-load__row-main">
                  <span className="sm-skel sm-skel--name" style={{ width: `${54 + ((i * 11) % 28)}%` }} />
                  <span className="sm-skel sm-skel--meta" style={{ width: `${38 + ((i * 7) % 22)}%` }} />
                </div>
                <span className="sm-skel sm-skel--pill" />
                <span className="sm-skel sm-skel--meta sm-skel--end" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Page-shaped shimmer for the tenant dashboard. */
export function DashboardLoadingSkeleton() {
  return (
    <div className="dash-skel" aria-busy="true" aria-live="polite" aria-label="Loading dashboard">
      <div className="sm-load__progress sm-load__progress--embed" aria-hidden="true">
        <span />
      </div>
      <div className="dash-skel__welcome">
        <span className="dash-skel__avatar sm-skel-pulse" />
        <div className="dash-skel__welcome-copy">
          <span className="sm-skel-line sm-skel-line--lg" style={{ width: "42%" }} />
          <span className="sm-skel-line" style={{ width: "28%" }} />
        </div>
        <div className="dash-skel__welcome-actions">
          <span className="sm-skel-chip" />
          <span className="sm-skel-chip" />
        </div>
      </div>

      <div className="dash-skel__metrics">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="dash-skel__metric">
            <span className="sm-skel-line" style={{ width: "46%" }} />
            <span className="sm-skel-line sm-skel-line--xl" style={{ width: "34%" }} />
            <span className="sm-skel-line sm-skel-line--sm" style={{ width: "58%" }} />
          </div>
        ))}
      </div>

      <div className="dash-skel__main">
        <div className="dash-skel__panel dash-skel__panel--tall">
          <span className="sm-skel-line sm-skel-line--lg" style={{ width: "36%" }} />
          <span className="sm-skel-block" />
          <span className="sm-skel-line" style={{ width: "70%" }} />
          <span className="sm-skel-line sm-skel-line--sm" style={{ width: "52%" }} />
        </div>
        <div className="dash-skel__panel dash-skel__panel--tall">
          <span className="sm-skel-line sm-skel-line--lg" style={{ width: "40%" }} />
          <span className="sm-skel-block sm-skel-block--media" />
        </div>
      </div>

      <div className="dash-skel__grid">
        <div className="dash-skel__panel">
          <span className="sm-skel-line sm-skel-line--lg" style={{ width: "44%" }} />
          <span className="sm-skel-block" style={{ height: 88 }} />
        </div>
        <div className="dash-skel__panel">
          <span className="sm-skel-line sm-skel-line--lg" style={{ width: "38%" }} />
          <span className="sm-skel-block sm-skel-block--media" style={{ height: 120 }} />
        </div>
        <div className="dash-skel__panel">
          <span className="sm-skel-line sm-skel-line--lg" style={{ width: "48%" }} />
          <span className="sm-skel-line" style={{ width: "88%" }} />
          <span className="sm-skel-line" style={{ width: "72%" }} />
          <span className="sm-skel-line sm-skel-line--sm" style={{ width: "64%" }} />
        </div>
      </div>
    </div>
  );
}

export function CatalogLoadingSkeleton() {
  return (
    <div className="sm-skeleton-grid" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="sm-skeleton-card">
          <div className="sm-skeleton-img" />
          <div className="sm-skeleton-line" />
          <div className="sm-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
