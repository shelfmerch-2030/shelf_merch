import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertTriangle, FileText, Headset, Home, RotateCcw } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { isRouteErrorResponse, Link, useRouteError, useRevalidator } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import error500Illu from "../../assets/status/error-500-illu.png";
import { ShopSubdomainGate } from "./ShopSubdomainGate";

const queryClient = new QueryClient();

function resolveErrorCode(error: unknown): string {
  if (isRouteErrorResponse(error)) return String(error.status || 500);
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isFinite(status) && status > 0) return String(status);
  }
  return "500";
}

function ErrorStatusPage({
  titleLead,
  titleAccent,
  description,
  errorCode,
  requestId,
  actions,
}: {
  titleLead: ReactNode;
  titleAccent: string;
  description: string;
  errorCode: string;
  requestId?: string;
  actions: ReactNode;
}) {
  return (
    <div className="error-page">
      <div className="error-page__main">
        <div className="error-page__copy">
          <Link to="/" className="error-page__logo" aria-label="Shelf Merch home">
            <img
              src="/images/logo/shelfmerch-wordmark-white.png"
              alt=""
              className="error-page__wordmark"
            />
          </Link>

          <h1 className="error-page__title">
            <span className="error-page__title-lead">
              {titleLead}
              <span className="error-page__marks" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </span>{" "}
            <em className="error-page__title-accent">{titleAccent}</em>
          </h1>

          <p className="error-page__desc">{description}</p>

          <div className="error-page__actions">{actions}</div>
        </div>

        <div className="error-page__visual">
          <img src={error500Illu} alt="" className="error-page__illu" />
        </div>
      </div>

      <footer className="error-page__meta" role="group" aria-label="Error details">
        <div className="error-page__meta-item">
          <span className="error-page__meta-icon" aria-hidden>
            <AlertTriangle size={18} strokeWidth={2} />
          </span>
          <div>
            <div className="error-page__meta-label">Error Code</div>
            <div className="error-page__meta-value">{errorCode}</div>
          </div>
        </div>
        <div className="error-page__meta-item">
          <span className="error-page__meta-icon" aria-hidden>
            <FileText size={18} strokeWidth={2} />
          </span>
          <div>
            <div className="error-page__meta-label">Request ID</div>
            <div className="error-page__meta-value error-page__meta-value--mono">
              {requestId || "—"}
            </div>
          </div>
        </div>
        <div className="error-page__meta-item">
          <span className="error-page__meta-icon" aria-hidden>
            <Headset size={18} strokeWidth={2} />
          </span>
          <div>
            <div className="error-page__meta-label">Need help?</div>
            <Link to="/app/support" className="error-page__meta-link">
              Contact Support <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** App shell: provides react-query + renders the matched route tree. */
export function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ShopSubdomainGate />
      <Toaster />
    </QueryClientProvider>
  );
}

export function NotFound() {
  const requestId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `err-${Date.now().toString(36)}`;
  }, []);

  return (
    <ErrorStatusPage
      titleLead="Oops! Page not"
      titleAccent="found."
      description="The page you're looking for doesn't exist or has been moved."
      errorCode="404"
      requestId={requestId}
      actions={
        <Link to="/" className="error-page__btn error-page__btn--primary">
          <Home size={16} strokeWidth={2.2} aria-hidden />
          Go to homepage
        </Link>
      }
    />
  );
}

export function RouteError() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  console.error(error);

  const errorCode = resolveErrorCode(error);
  const requestId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `err-${Date.now().toString(36)}`;
  }, []);

  return (
    <ErrorStatusPage
      titleLead="Oops! Something went"
      titleAccent="wrong."
      description="We couldn't load this page right now. This is usually temporary. Please try again in a few moments."
      errorCode={errorCode}
      requestId={requestId}
      actions={
        <>
          <button
            type="button"
            className="error-page__btn error-page__btn--primary"
            onClick={() => revalidator.revalidate()}
          >
            <RotateCcw size={16} strokeWidth={2.2} aria-hidden />
            Try again
          </button>
          <Link to="/" className="error-page__btn error-page__btn--secondary">
            <Home size={16} strokeWidth={2.2} aria-hidden />
            Go to homepage
          </Link>
        </>
      }
    />
  );
}
