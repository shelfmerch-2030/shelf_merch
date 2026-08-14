import { Link } from "react-router";
import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import {
  COLLABORATION_TOOLS,
  DISPLAY_TOOLS,
  USER_MANAGEMENT_TOOLS,
  asTile,
  type Integration,
  type Tile,
} from "../data";
import type { IntegrationsVm } from "../controllers/useIntegrationsController";
import { MergeLinkSession } from "../components/MergeLinkSession";
import { IntegrationDetailView, IntegrationMark } from "./IntegrationDetailView";
import { isMergeHrisIntegration } from "@/services/merge-api";

function IntegrationTile({
  item,
  detail = false,
  onSelect,
  connected = false,
  disabled = false,
}: {
  item: Tile | Integration;
  detail?: boolean;
  onSelect: (tile: Tile) => void;
  connected?: boolean;
  disabled?: boolean;
}) {
  const tile = asTile(item);

  return (
    <button
      type="button"
      className={`bonus-integ-tile${detail ? " bonus-integ-tile--detail" : ""}${disabled ? " bonus-integ-tile--disabled" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect(tile);
      }}
    >
      {(tile.icon || tile.mark) && (
        <span className="bonus-integ-logo" aria-hidden="true">
          {tile.icon ? (
            <img src={tile.icon} alt="" />
          ) : (
            <span style={{ background: tile.tone }}>{tile.mark}</span>
          )}
        </span>
      )}
      <span className="bonus-integ-copy">
        <span className="bonus-integ-name">
          {tile.name}
          {connected ? (
            <span className="bonus-integ-recommended" style={{ marginLeft: 8 }}>
              Connected
            </span>
          ) : null}
        </span>
        {tile.recommended && !connected && (
          <span className="bonus-integ-recommended">Recommended</span>
        )}
        {detail && tile.desc && <span className="bonus-integ-desc">{tile.desc}</span>}
      </span>
    </button>
  );
}

function isZohoConnected(status: IntegrationsVm["zoho"]["status"]) {
  return (
    status === "connected" ||
    status === "needs_attention" ||
    status === "expired" ||
    status === "error"
  );
}

/**
 * Logo-centered HRIS card.
 * Unconnected Merge/Zoho → start connect immediately.
 * Connected → open management detail.
 * Optional requiresSetup tiles → open detail only (no Link launch).
 */
function HrisLogoCard({
  item,
  onSelect,
  onConnect,
  connected = false,
  needsAttention = false,
  flowBusy = false,
}: {
  item: Tile | Integration;
  onSelect: (tile: Tile) => void;
  onConnect: (tile: Tile) => void;
  connected?: boolean;
  needsAttention?: boolean;
  flowBusy?: boolean;
}) {
  const tile = asTile(item);
  const requiresSetup = Boolean(tile.requiresSetup);
  const startsConnectDirectly =
    !requiresSetup &&
    (isMergeHrisIntegration(tile.id) || tile.id === "zoho-people") &&
    !connected;

  const statusLabel = requiresSetup
    ? "Requires setup"
    : needsAttention
      ? "Needs attention"
      : connected
        ? "Connected"
        : null;

  return (
    <button
      type="button"
      className={`bonus-integ-logo-card${connected || needsAttention ? " bonus-integ-logo-card--connected" : ""}${requiresSetup ? " bonus-integ-logo-card--setup" : ""}`}
      disabled={flowBusy}
      onClick={() => {
        if (startsConnectDirectly) {
          onConnect(tile);
          return;
        }
        onSelect(tile);
      }}
      aria-label={
        requiresSetup
          ? `${tile.name}, requires setup`
          : needsAttention
            ? `${tile.name}, needs attention — manage`
            : connected
              ? `${tile.name}, connected — manage`
              : `Connect ${tile.name}`
      }
    >
      <span className="bonus-integ-logo-card__mark" aria-hidden="true">
        {tile.icon ? (
          <img src={tile.icon} alt="" />
        ) : (
          <span className="bonus-integ-logo-card__fallback" style={{ background: tile.tone }}>
            {tile.mark || tile.name.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="bonus-integ-logo-card__label">
        {tile.name}
        {statusLabel ? (
          <span
            className={`bonus-integ-logo-card__status${needsAttention ? " bonus-integ-logo-card__status--attention" : ""}${requiresSetup ? " bonus-integ-logo-card__status--setup" : ""}`}
          >
            {statusLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Section({
  title,
  desc,
  badge,
  children,
}: {
  title: string;
  desc: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="bonus-integ-section">
      <h2>
        {title}
        {badge ? <span className="bonus-integ-section-badge">{badge}</span> : null}
      </h2>
      <p>{desc}</p>
      {children}
    </section>
  );
}

/** Integrations screen: tile grids, or a selected tile management detail. */
export function IntegrationsView(vm: IntegrationsVm) {
  const mergeLink =
    vm.mergeLinkToken != null ? (
      <MergeLinkSession
        key={`${vm.mergeLinkProvider ?? "hris"}:${vm.mergeLinkToken}`}
        linkToken={vm.mergeLinkToken}
        provider={vm.mergeLinkProvider}
        onSuccess={vm.onMergeLinkSuccess}
        onExit={vm.onMergeLinkExit}
      />
    ) : null;

  if (vm.selected) {
    const connection = isMergeHrisIntegration(vm.selected.id)
      ? vm.mergeConnectionsByProvider[vm.selected.id] || null
      : null;
    return (
      <>
        {mergeLink}
        <IntegrationDetailView
          tile={vm.selected}
          onBack={vm.onBack}
          onInstall={vm.onInstall}
          onSupport={vm.onSupport}
          connection={connection}
          busy={vm.mergeLinking || vm.mergeExchanging || vm.zoho.connecting || vm.slack.connecting}
          syncing={Boolean(connection && vm.mergeSyncingId === connection.id)}
          disconnecting={Boolean(connection && vm.mergeDisconnectingId === connection.id)}
          onSync={vm.onMergeSync}
          onDisconnect={vm.onMergeDisconnect}
          canManage={vm.zoho.canManage}
          zoho={vm.selected.id === "zoho-people" ? vm.zoho : null}
          slack={vm.selected.id === "slack" ? vm.slack : null}
        />
      </>
    );
  }

  const zohoConnected = isZohoConnected(vm.zoho.status);
  const hasMergeConnection = Object.keys(vm.mergeConnectionsByProvider).length > 0;

  return (
    <div className="bonus-integ-page">
      {mergeLink}
      <h1>Integrations</h1>

      <Section
        title="User management"
        desc="Connect your HRIS or HRMS software to automatically sync user information, including employee names, emails, and more."
      >
        <div className="bonus-integ-logo-grid">
          {USER_MANAGEMENT_TOOLS.map((item) => {
            const tile = asTile(item);
            const mergeConn = isMergeHrisIntegration(tile.id)
              ? vm.mergeConnectionsByProvider[tile.id]
              : undefined;
            const needsAttention = Boolean(mergeConn?.status === "needs_attention");
            const connected =
              (isMergeHrisIntegration(tile.id) && Boolean(mergeConn)) ||
              (tile.id === "zoho-people" && zohoConnected);
            return (
              <HrisLogoCard
                item={item}
                key={item.id}
                onSelect={vm.onSelect}
                onConnect={vm.onInstall}
                connected={connected && !needsAttention}
                needsAttention={needsAttention}
                flowBusy={
                  vm.mergeLinking || vm.mergeExchanging || vm.zoho.connecting
                }
              />
            );
          })}
        </div>
        {hasMergeConnection ? (
          <p className="bonus-integ-desc" style={{ marginTop: 14 }}>
            <Link to="/app/integrations/hris-employees">View Merge HRIS employees</Link>
          </p>
        ) : null}
      </Section>

      <Section
        title="Collaboration tools"
        desc="Connect ShelfMerch to Slack to post updates in your workspace. Other chat tools are coming soon."
      >
        <div className="bonus-integ-grid bonus-integ-grid--compact">
          {COLLABORATION_TOOLS.map((item) => {
            const isSlack = item.id === "slack";
            const slackConn = vm.slack.connection;
            const slackConnected = Boolean(
              isSlack &&
                slackConn &&
                (slackConn.status === "connected" || slackConn.status === "needs_attention"),
            );
            return (
              <IntegrationTile
                item={item}
                key={item.id}
                onSelect={vm.onSelect}
                disabled={!isSlack}
                connected={slackConnected}
              />
            );
          })}
        </div>
      </Section>

      <Section
        title="Single sign-on"
        desc="Enable single sign-on (SSO) to protect your company's account information."
      >
        <div className="bonus-integ-plan">
          <div className="bonus-integ-plan-h">
            <LockKeyhole size={17} aria-hidden="true" />
            <h3>Single Sign-On (SSO)</h3>
          </div>
          <p>
            Configure SAML-based Single Sign-On to let your team sign in to ShelfMerch using your
            identity provider.
          </p>
          <strong>Available on the Enterprise plan</strong>
          <button type="button" onClick={vm.onViewPlans}>
            View plans
          </button>
        </div>
      </Section>

      <Section
        title="ShelfMerch display"
        desc="Maximize the impact of gifting across the tools your employees already use."
      >
        <div className="bonus-integ-grid bonus-integ-grid--detail">
          {DISPLAY_TOOLS.map((item) => (
            <IntegrationTile detail item={item} key={item.id} onSelect={vm.onSelect} />
          ))}
        </div>
      </Section>
    </div>
  );
}
