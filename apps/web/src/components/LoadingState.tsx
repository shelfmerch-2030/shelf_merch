type Props = {
  message?: string;
  fullScreen?: boolean;
  /** Kept for existing callers; the approved loader uses one visual treatment. */
  variant?: "page" | "list" | "compact";
};

export function LoadingState({
  message = "Loading...",
  fullScreen = true,
  variant: _variant = "page",
}: Props) {
  return (
    <div
      className={fullScreen ? "sm-load9-wrap sm-load9-wrap--screen" : "sm-load9-wrap"}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="sm-preview-load-9" aria-hidden="true">
        <div className="sm-preview-spinner">
          <div className="sm-preview-bubble-1"></div>
          <div className="sm-preview-bubble-2"></div>
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
