import { Loader2, RefreshCw, Unplug } from "lucide-react";
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
import type { HrisSyncView } from "../hrisSyncUi";

export function HrisSyncPanel({
  view,
  providerName,
  canManage,
  busy = false,
  disconnecting = false,
  syncStatusLoading = false,
  syncStatusError = false,
  onSync,
  onReconnect,
  onDisconnect,
}: {
  view: HrisSyncView;
  providerName: string;
  canManage: boolean;
  busy?: boolean;
  disconnecting?: boolean;
  syncStatusLoading?: boolean;
  syncStatusError?: boolean;
  onSync?: () => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <section className="bonus-integ-hris" aria-label={`${providerName} sync status`} aria-live="polite">
      <div className="bonus-integ-hris-status">
        <p className="bonus-integ-hris-connection">
          <span className="bonus-integ-hris-mark" aria-hidden="true">
            {view.connectionMark}
          </span>
          <span>{view.connectionLine}</span>
        </p>
        <h2 className="bonus-integ-hris-headline">{view.headline}</h2>
        <p className="bonus-integ-hris-lead">{view.lead}</p>
        <p className="bonus-integ-hris-sync-line">{view.syncLine}</p>
      </div>

      {view.automaticEnabled ? (
        <div className="bonus-integ-hris-auto">
          <p className="bonus-integ-hris-auto__label">
            Automatic sync <strong>Enabled</strong>
          </p>
          <p>Automatic sync is enabled. ShelfMerch keeps employee data updated automatically from your HRMS.</p>
          <p>Changes from your HRMS are synchronized automatically.</p>
        </div>
      ) : null}

      {view.banner ? (
        <div className={`bonus-integ-callout bonus-integ-callout--${view.bannerTone === "info" ? "info" : "warning"}`} role="status">
          <p>{view.banner}</p>
        </div>
      ) : null}

      {view.progressLines.length > 0 ? (
        <ul className="bonus-integ-hris-progress">
          {view.progressLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {view.preparingNote ? <p className="bonus-integ-meta-note">{view.preparingNote}</p> : null}

      <p className="bonus-integ-hris-last" title={view.lastSyncedExact || undefined}>
        {view.lastSyncedLabel}
      </p>

      {syncStatusLoading ? <p className="bonus-integ-meta-note">Checking sync status…</p> : null}
      {syncStatusError ? (
        <p className="bonus-integ-meta-note" role="status">
          Sync status is unavailable right now.
        </p>
      ) : null}

      <div className="bonus-integ-detail-actions bonus-integ-detail-actions--split">
        {canManage && view.showSyncButton && onSync ? (
          <div className="bonus-integ-hris-sync-action">
            <button
              type="button"
              className="bonus-integ-btn bonus-integ-btn--secondary"
              disabled={view.syncButtonDisabled || busy || disconnecting}
              aria-busy={view.syncButtonDisabled || undefined}
              onClick={onSync}
            >
              {view.syncButtonDisabled ? (
                <Loader2 size={15} className="auth-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={15} aria-hidden="true" />
              )}
              <span>{view.syncButtonLabel}</span>
            </button>
            {view.automaticEnabled ? (
              <p className="bonus-integ-meta-note">Use Sync now if you want to refresh employee data immediately.</p>
            ) : null}
          </div>
        ) : null}

        {canManage && (view.showReconnect || view.showConnect) && onReconnect ? (
          <button
            type="button"
            className="bonus-integ-btn bonus-integ-btn--primary"
            disabled={busy || disconnecting}
            onClick={onReconnect}
          >
            <RefreshCw size={15} aria-hidden="true" />
            <span>
              {busy ? "Working…" : view.showReconnect ? "Reconnect" : `Connect ${providerName}`}
            </span>
          </button>
        ) : null}

        {canManage && onDisconnect && view.connectionWord !== "Disconnected" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="bonus-integ-btn bonus-integ-btn--danger"
                disabled={disconnecting || busy}
              >
                <Unplug size={15} aria-hidden="true" />
                <span>{disconnecting ? "Disconnecting…" : "Disconnect"}</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{view.disconnectTitle}</AlertDialogTitle>
                <AlertDialogDescription>{view.disconnectDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDisconnect}>Disconnect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      {view.history.length > 0 ? (
        <section className="bonus-integ-hris-history" aria-labelledby="hris-sync-history-heading">
          <h3 id="hris-sync-history-heading">Recent syncs</h3>
          <ul className="bonus-integ-hris-history__list">
            {view.history.map((row) => (
              <li key={row.id} className="bonus-integ-hris-run">
                <details>
                  <summary className="bonus-integ-hris-run__summary">
                    <span>{row.when}</span>
                    <span>{row.reasonLabel}</span>
                    <span>{row.statusLabel}</span>
                    {row.recordsLabel ? <span>{row.recordsLabel}</span> : null}
                  </summary>
                  <ul className="bonus-integ-hris-run__details">
                    {row.detailLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
