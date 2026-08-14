import { Link } from "react-router";
import { ArrowLeft, CircleHelp, Loader2 } from "lucide-react";
import type { Tile } from "../data";
import type { IntegrationsVm } from "../controllers/useIntegrationsController";
import { isMergeHrisIntegration } from "@/services/merge-api";
import type { MergeConnectionPublic } from "@/services/merge-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function IntegrationMark({
  tile,
  size = "normal",
}: {
  tile: Tile;
  size?: "normal" | "large";
}) {
  return (
    <span className={`bonus-integ-logo bonus-integ-logo--${size}`} aria-hidden="true">
      {tile.icon ? (
        <img src={tile.icon} alt="" />
      ) : (
        <span style={{ background: tile.tone }}>{tile.mark}</span>
      )}
    </span>
  );
}

function detailCopy(tile: Tile) {
  if (tile.requiresSetup) {
    return `${tile.name} requires additional setup in Merge before it can be connected from ShelfMerch.`;
  }
  if (tile.id === "slack") {
    return "Install our Slack app to announce gifting activity in Slack and create gift moments without leaving Slack.";
  }
  if (tile.id === "microsoft-teams") {
    return "Install our Microsoft Teams app to announce gifting activity and keep employee moments visible in team channels.";
  }
  if (tile.id === "google-chat") {
    return "Connect Google Chat to share gifting updates with the right spaces automatically.";
  }
  return (
    tile.desc ??
    `Connect ${tile.name} to ShelfMerch and automate this part of your gifting workflow.`
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mergeSyncFailureCopy(connection: MergeConnectionPublic) {
  if (connection.lastError === "MERGE_SCOPES_DISABLED") {
    return "This HRIS connection is valid, but required Merge data scopes are disabled.";
  }
  if (connection.lastSyncStatus === "failed") {
    return "Sync failed. Retry sync without reconnecting.";
  }
  return null;
}

export function IntegrationDetailView({
  tile,
  onBack,
  onInstall,
  onSupport,
  connection,
  busy = false,
  syncing = false,
  disconnecting = false,
  onSync,
  onDisconnect,
  canManage = false,
  zoho = null,
}: {
  tile: Tile;
  onBack: () => void;
  onInstall: (tile: Tile) => void;
  onSupport: () => void;
  connection?: MergeConnectionPublic | null;
  busy?: boolean;
  syncing?: boolean;
  disconnecting?: boolean;
  onSync?: (connectionId: string) => void;
  onDisconnect?: (connectionId: string) => void;
  canManage?: boolean;
  zoho?: IntegrationsVm["zoho"] | null;
}) {
  const isMergeProvider = isMergeHrisIntegration(tile.id);
  const mergeHealthy = Boolean(connection && connection.status === "connected");
  const mergeNeedsReconnect = Boolean(connection && connection.status === "needs_attention");
  const syncFailed = connection?.lastSyncStatus === "failed";
  const syncFailureMessage = connection ? mergeSyncFailureCopy(connection) : null;
  const zohoConnected = Boolean(
    zoho &&
      (zoho.status === "connected" ||
        zoho.status === "needs_attention" ||
        zoho.status === "expired" ||
        zoho.status === "error"),
  );
  const showMergeDisconnect =
    isMergeProvider &&
    canManage &&
    onDisconnect &&
    connection &&
    (mergeHealthy || mergeNeedsReconnect);

  return (
    <div className="bonus-integ-detail-page">
      <button type="button" className="bonus-integ-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        <span>Back to integrations</span>
      </button>
      <div className="bonus-integ-detail-card">
        {(tile.icon || tile.mark) && (
          <div className="bonus-integ-detail-brand">
            <IntegrationMark tile={tile} size="large" />
          </div>
        )}
        <h1>{tile.name} Integration</h1>
        <p>{detailCopy(tile)}</p>

        {isMergeProvider && tile.requiresSetup && !connection ? (
          <p className="bonus-integ-connected-badge" role="status">
            Requires setup
          </p>
        ) : isMergeProvider && mergeHealthy && connection ? (
          <>
            <p className="bonus-integ-connected-badge" role="status">
              Connected
              {syncFailed ? " · Sync failed" : ""}
            </p>
            <p className="bonus-integ-desc">
              Last synced: {formatDate(connection.lastSyncAt)}
            </p>
            {syncFailureMessage ? (
              <p className="bonus-integ-desc" role="status">
                {syncFailureMessage}
              </p>
            ) : null}
            <div className="bonus-integ-detail-actions">
              {canManage && onSync ? (
                <button
                  type="button"
                  className="bonus-integ-install"
                  disabled={syncing || busy || disconnecting}
                  onClick={() => onSync(connection.id)}
                >
                  {syncing ? (
                    <span className="auth-submit-busy">
                      <Loader2 size={16} className="auth-spin" aria-hidden="true" />
                      Syncing…
                    </span>
                  ) : (
                    <span>{syncFailed ? "Retry sync" : "Sync now"}</span>
                  )}
                </button>
              ) : null}
              {showMergeDisconnect ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="bonus-integ-install bonus-integ-install--danger"
                      disabled={disconnecting || syncing || busy}
                    >
                      {disconnecting ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect {tile.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        ShelfMerch will unlink this {tile.name} Linked Account. Imported HRIS
                        employees are kept. Other HRIS providers stay connected. You can reconnect
                        later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDisconnect?.(connection.id)}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
            <p className="bonus-integ-desc" style={{ marginTop: 12 }}>
              <Link to="/app/integrations/hris-employees">View HRIS employees</Link>
            </p>
          </>
        ) : isMergeProvider && mergeNeedsReconnect && connection ? (
          <>
            <p className="bonus-integ-connected-badge" role="status">
              Needs attention
            </p>
            <p className="bonus-integ-desc">
              This Linked Account needs to be re-authorized with Merge before syncing can continue.
            </p>
            <div className="bonus-integ-detail-actions">
              <button
                type="button"
                className="bonus-integ-install"
                disabled={busy || disconnecting}
                onClick={() => onInstall(tile)}
              >
                <span>{busy ? "Working…" : `Reconnect ${tile.name}`}</span>
              </button>
              {showMergeDisconnect ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="bonus-integ-install bonus-integ-install--danger"
                      disabled={disconnecting || busy}
                    >
                      {disconnecting ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect {tile.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        ShelfMerch will unlink this {tile.name} Linked Account. Imported HRIS
                        employees are kept. Other HRIS providers stay connected. You can reconnect
                        later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDisconnect?.(connection.id)}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </>
        ) : zohoConnected && zoho ? (
          <>
            <p className="bonus-integ-connected-badge" role="status">
              {zoho.status === "connected"
                ? "Connected"
                : zoho.status === "expired"
                  ? "Connection expired"
                  : zoho.status === "needs_attention"
                    ? "Needs attention"
                    : "Error"}
            </p>
            <p className="bonus-integ-desc">
              Last synced: {formatDate(zoho.integration?.lastSyncedAt)}
            </p>
            <div className="bonus-integ-detail-actions">
              {canManage ? (
                <button
                  type="button"
                  className="bonus-integ-install"
                  disabled={zoho.syncing || zoho.status === "expired"}
                  onClick={zoho.onSync}
                >
                  {zoho.syncing ? (
                    <span className="auth-submit-busy">
                      <Loader2 size={16} className="auth-spin" aria-hidden="true" />
                      Syncing…
                    </span>
                  ) : (
                    <span>Sync Employees</span>
                  )}
                </button>
              ) : null}
              {zoho.status === "expired" && canManage ? (
                <button
                  type="button"
                  className="bonus-integ-install"
                  disabled={zoho.connecting}
                  onClick={zoho.onConnect}
                >
                  Reconnect
                </button>
              ) : null}
              {canManage ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="bonus-integ-install bonus-integ-install--danger"
                      disabled={zoho.disconnecting}
                    >
                      Disconnect
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Zoho People?</AlertDialogTitle>
                      <AlertDialogDescription>
                        ShelfMerch will stop syncing employees from Zoho People. Existing contacts
                        and orders are kept. You can reconnect later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={zoho.onDisconnect}>Disconnect</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </>
        ) : tile.requiresSetup ? (
          <p className="bonus-integ-desc" role="status">
            Connection is unavailable until setup is complete.
          </p>
        ) : (
          <button
            type="button"
            className="bonus-integ-install"
            disabled={busy}
            onClick={() => onInstall(tile)}
          >
            {tile.mark && !tile.icon ? <IntegrationMark tile={tile} /> : null}
            <span>{busy ? "Working…" : `Connect ${tile.name}`}</span>
          </button>
        )}

        <div className="bonus-integ-help">
          <CircleHelp size={14} aria-hidden="true" />
          <span>Can't figure it out? Just </span>
          <button type="button" onClick={onSupport}>
            drop us a line.
          </button>
        </div>
      </div>
    </div>
  );
}
