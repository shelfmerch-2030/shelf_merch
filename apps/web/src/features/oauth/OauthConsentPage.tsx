import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AuthLayout } from "@/features/auth/views/AuthLayout";
import { clearSession, getAccessToken, isAuthenticated } from "@/services/auth-store";
import { isSafeResumeUrl } from "./safeOauthReturn";

type ConsentSession = {
  client: { name: string };
  account: { name: string; email: string };
  workspaces: { id: string; name: string }[];
  scope: string;
};

type ApiErrorBody = { error?: { code?: string; message?: string } };

async function consentRequest(path: string, body?: unknown): Promise<Response> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function OauthConsentPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ConsentSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login?return=/oauth/consent", { replace: true });
      return;
    }
    let cancelled = false;
    consentRequest("/oauth/consent/session")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as ConsentSession & ApiErrorBody | null;
        if (cancelled) return;
        if (res.status === 401 && body?.error?.code !== "INTERACTION_EXPIRED") {
          if (body?.error?.code === "SESSION_EXPIRED") clearSession();
          const expired = body?.error?.code === "SESSION_EXPIRED" ? "session=expired&" : "";
          navigate(`/login?${expired}return=/oauth/consent`, { replace: true });
          return;
        }
        if (!res.ok) {
          setError(body?.error?.message || "This authorization request could not be opened.");
          return;
        }
        const next = body as ConsentSession;
        setSession(next);
        if (next.workspaces?.length === 1) setWorkspaceId(next.workspaces[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("This authorization request could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function decide(decision: "allow" | "deny") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await consentRequest("/oauth/consent/decision", {
        decision,
        ...(decision === "allow" ? { tenantId: workspaceId } : {}),
      });
      const body = (await res.json().catch(() => null)) as { resumeUrl?: string } & ApiErrorBody | null;
      if (!res.ok || !body?.resumeUrl || !isSafeResumeUrl(body.resumeUrl, window.location.origin)) {
        setError(body?.error?.message || "The decision could not be completed.");
        setBusy(false);
        return;
      }
      window.location.assign(body.resumeUrl);
    } catch {
      setError("The decision could not be completed.");
      setBusy(false);
    }
  }

  const canAllow = Boolean(session && workspaceId && session.workspaces.some((workspace) => workspace.id === workspaceId));

  return (
    <AuthLayout variant="compact" title="Allow catalog access" subtitle="An application is asking to read your catalog.">
      {!session && !error ? <p className="auth-simple-subtitle">Checking your ShelfMerch session…</p> : null}
      {session ? (
        <div className="auth-simple-form">
          <dl className="auth-simple-field">
            <div>
              <dt className="auth-simple-label">Application</dt>
              <dd>{session.client.name}</dd>
            </div>
            <div>
              <dt className="auth-simple-label">ShelfMerch account</dt>
              <dd>
                {session.account.name} ({session.account.email})
              </dd>
            </div>
            <div>
              <dt className="auth-simple-label">Permission</dt>
              <dd>Read the product catalog (catalog:read)</dd>
            </div>
          </dl>
          {session.workspaces.length ? (
            <fieldset className="auth-simple-fieldset">
              <legend className="auth-simple-label">Workspace</legend>
              {session.workspaces.map((workspace) => (
                <label key={workspace.id} className="auth-simple-field">
                  <input
                    type="radio"
                    name="workspace"
                    value={workspace.id}
                    checked={workspaceId === workspace.id}
                    onChange={() => setWorkspaceId(workspace.id)}
                  />{" "}
                  {workspace.name}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="auth-simple-error" role="status">
              This account has no company workspace you can connect. An admin or entity manager role is required.
            </p>
          )}
          {error ? (
            <p className="auth-simple-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="auth-simple-submit" disabled={!canAllow || busy} onClick={() => decide("allow")}>
            Allow
          </button>
          <button type="button" className="auth-simple-submit" disabled={busy || !session} onClick={() => decide("deny")}>
            Deny
          </button>
        </div>
      ) : null}
      {!session && error ? (
        <p className="auth-simple-error" role="alert">
          {error}
        </p>
      ) : null}
    </AuthLayout>
  );
}
