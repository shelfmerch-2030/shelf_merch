import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertTriangle, FileText, Home, RotateCcw } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { isRouteErrorResponse, Link, useRouteError, useRevalidator } from "react-router";
import { Toaster } from "@/components/ui/sonner";
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
  cardTitle,
  cardStatus,
  cardHint,
  actions,
}: {
  titleLead: ReactNode;
  titleAccent: string;
  description: string;
  errorCode: string;
  requestId?: string;
  cardTitle: ReactNode;
  cardStatus: string;
  cardHint: string;
  actions: ReactNode;
}) {
  return (
    <div className="error-page fade-in">
      <div className="error-page__layout">
        <div className="error-page__copy">
          <div className="error-page__icon" aria-hidden="true">
            <AlertTriangle strokeWidth={2.4} />
          </div>
          <p className="error-page__eyebrow">
            <span className="error-page__eyebrow-dot" aria-hidden="true" />
            Error {errorCode}
          </p>
          <h1 className="error-page__title">
            {titleLead} <em>{titleAccent}</em>
          </h1>
          <p className="error-page__lead">{description}</p>

          {requestId ? (
            <div className="error-page__info">
              <span className="error-page__info-icon" aria-hidden="true">
                <FileText size={17} strokeWidth={2} />
              </span>
              <span>
                Request ID{" "}
                <strong className="error-page__mono">{requestId}</strong>
              </span>
            </div>
          ) : null}

          <div className="error-page__actions">{actions}</div>

          <div className="error-page__note">
            <strong>Need help?</strong>
            <p>
              <Link to="/app/support">Contact support</Link> and share the request ID above if the
              issue continues.
            </p>
          </div>
        </div>

        <div className="error-page__visual" aria-hidden="true">
          <div className="error-page__shape error-page__shape--coral" />
          <div className="error-page__shape error-page__shape--yellow" />
          <div className="error-page__shape error-page__shape--blue" />
          <article className="error-page__card">
            <span className="error-page__card-label">Status</span>
            <h3>{cardTitle}</h3>
            <div className="error-page__card-code">{errorCode}</div>
            <div className="error-page__meter">
              <div>
                <span className="num">{errorCode}</span>
                <small>Error code</small>
              </div>
              <div>
                <b>{cardStatus}</b>
                <small>{cardHint}</small>
              </div>
            </div>
          </article>
        </div>
      </div>
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
      titleLead="This page"
      titleAccent="wasn't found."
      description="The page you're looking for doesn't exist or may have been moved. Check the URL or head back to your dashboard."
      errorCode="404"
      requestId={requestId}
      cardTitle={
        <>
          Page
          <br />
          missing
        </>
      }
      cardStatus="Not found"
      cardHint="Check the URL"
      actions={
        <Link to="/" className="btn btn-brand btn-lg">
          <Home size={15} strokeWidth={2.2} aria-hidden />
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
      titleLead="Something went"
      titleAccent="wrong."
      description="We couldn't load this page right now. This is usually temporary — try again in a few moments."
      errorCode={errorCode}
      requestId={requestId}
      cardTitle={
        <>
          Server
          <br />
          issue
        </>
      }
      cardStatus="Unavailable"
      cardHint="Try again shortly"
      actions={
        <>
          <button
            type="button"
            className="btn btn-brand btn-lg"
            onClick={() => revalidator.revalidate()}
          >
            <RotateCcw size={15} strokeWidth={2.2} aria-hidden />
            Try again
          </button>
          <Link to="/" className="btn btn-ghost btn-lg">
            <Home size={15} strokeWidth={2.2} aria-hidden />
            Go to homepage
          </Link>
        </>
      }
    />
  );
}
