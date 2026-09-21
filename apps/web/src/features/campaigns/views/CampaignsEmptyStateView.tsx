import campaignsEmptyArt from "../../../../assets/campaigns-empty.png";
import "../campaigns-page.css";

/** Empty campaigns: focused hero + panel, or embedded empty inside type tab. */
export function CampaignsEmptyStateView({
  canSend,
  onSendGift,
  embedded = false,
}: {
  canSend: boolean;
  onSendGift: () => void;
  /** When true, render only the empty body (used inside the list panel). */
  embedded?: boolean;
}) {
  const emptyBody = (
    <div className={`camp-empty${embedded ? " camp-empty--panel" : ""}`}>
      <img src={campaignsEmptyArt} alt="" className="camp-empty__art" />
      <h3 className="camp-empty__title">No campaigns yet</h3>
      <p className="camp-empty__desc">
        Launch a points campaign from a shop, or send a kit to start tracking activity here.
      </p>
      {canSend ? (
        <button type="button" className="camp-empty__cta" onClick={onSendGift}>
          Create your first campaign
        </button>
      ) : (
        <p className="camp-empty__note">
          Your company admin sets up shops and kits; you can launch campaigns from here once
          assigned as a department manager.
        </p>
      )}
    </div>
  );

  if (embedded) {
    return emptyBody;
  }

  return (
    <div className="campaigns-page">
      <header className="camp-hero">
        <div className="camp-hero__copy">
          <h1>Campaigns</h1>
          <p className="camp-hero__sub">Launch points campaigns and track kit sends.</p>
        </div>
        {canSend ? (
          <div className="camp-hero__actions">
            <button type="button" className="camp-hero__cta" onClick={onSendGift}>
              Send gift
            </button>
          </div>
        ) : null}
      </header>

      <section className="camp-panel">{emptyBody}</section>
    </div>
  );
}
