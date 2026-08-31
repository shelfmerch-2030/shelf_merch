import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";

type PublicInviteErrorProps = {
  title: string;
  message: string;
  onRetry?: () => void;
};

export function PublicInviteError({ title, message, onRetry }: PublicInviteErrorProps) {
  return (
    <div className="sf-public-error">
      <div className="sf-public-error-card">
        <ShelfMerchLogo height={28} className="sf-public-error-logo" />

        <div className="sf-public-error-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v5" />
            <path d="M12 16h.01" />
          </svg>
        </div>

        <h1 className="sf-public-error-title">{title}</h1>
        <p className="sf-public-error-msg">{message}</p>

        <div className="sf-public-error-actions">
          {onRetry ? (
            <button type="button" className="sf-public-error-btn" onClick={onRetry}>
              Try again
            </button>
          ) : (
            <button
              type="button"
              className="sf-public-error-btn"
              onClick={() => window.location.reload()}
            >
              Refresh page
            </button>
          )}
        </div>

        <p className="sf-public-error-hint">
          If this keeps happening, ask your sender for a new invite link.
        </p>
      </div>
    </div>
  );
}