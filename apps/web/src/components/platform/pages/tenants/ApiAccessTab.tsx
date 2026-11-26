import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/services/api";
import type { ApiKeyRow, WebhookEndpoint } from "@/services/developers-api";
import { PlatformError, PlatformLoading } from "../../platform-ui";

type ApiAccess = { keys: ApiKeyRow[]; endpoints: WebhookEndpoint[]; liveApiOrdersLast30Days: number; importedProducts?: number };

const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** Platform view of a tenant's public-API keys and webhook endpoints (support / security). */
export function ApiAccessTab({ tenantId, canWrite }: { tenantId: string; canWrite: boolean }) {
  const [data, setData] = useState<ApiAccess | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiFetch<ApiAccess>(`/platform/api-access?tenantId=${tenantId}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [tenantId]);
  useEffect(load, [load]);

  async function run(label: string, path: string) {
    if (!window.confirm(label)) return;
    try {
      await apiFetch(path, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (error) return <PlatformError message={error} />;
  if (!data) return <PlatformLoading message="Loading API access…" />;

  return (
    <div className="card" style={{ padding: 20 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        Live API orders in the last 30 days: <b>{data.liveApiOrdersLast30Days}</b>. Catalog products imported via the API:{" "}
        <b>{data.importedProducts ?? 0}</b>. Keys and endpoints are managed by the
        tenant's company admins under Settings → Developers.
      </p>

      <h3 style={{ fontSize: 15 }}>API keys</h3>
      {!data.keys.length ? (
        <p className="muted">None.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Last used</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name} <span className="tag">{k.mode}</span></td>
                <td><code>{k.prefix}</code></td>
                <td style={{ fontSize: 12 }}>{k.scopes.join(", ")}</td>
                <td>{when(k.lastUsedAt)}</td>
                <td>{k.revokedAt ? `Revoked ${when(k.revokedAt)}` : "Active"}</td>
                <td style={{ textAlign: "right" }}>
                  {canWrite && !k.revokedAt && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => run(`Revoke "${k.name}" for this tenant? Their integration stops immediately.`, `/platform/api-access/keys/${k.id}/revoke`)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 15, marginTop: 20 }}>Webhook endpoints</h3>
      {!data.endpoints.length ? (
        <p className="muted">None.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>URL</th><th>Mode</th><th>Health</th><th>Last success</th><th /></tr></thead>
          <tbody>
            {data.endpoints.map((e) => (
              <tr key={e.id}>
                <td style={{ wordBreak: "break-all" }}><code>{e.url}</code></td>
                <td>{e.mode}</td>
                <td>{!e.enabled ? `Disabled — ${e.disabledReason}` : e.consecutiveFailures ? `Failing (${e.consecutiveFailures})` : "Healthy"}</td>
                <td>{when(e.lastSuccessAt)}</td>
                <td style={{ textAlign: "right" }}>
                  {canWrite && e.enabled && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(`Disable ${e.url}? The tenant can re-enable it.`, `/platform/api-access/webhooks/${e.id}/disable`)}>
                      Disable
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
