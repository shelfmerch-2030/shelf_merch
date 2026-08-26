import megaphoneBox from "../../../../assets/megaphone_box.png";
import "../campaigns-page.css";

/** Empty campaigns: focused hero + panel, or embedded empty inside type tab. */
export function CampaignsEmptyStateView({
  canSend,
  onSendGift,
  onSendPointsCampaign,
  onSendKitCampaign,
  embedded = false,
}: {
  canSend: boolean;
  onSendGift: () => void;
  onSendPointsCampaign: () => void;
  onSendKitCampaign: () => void;
  /** When true, render only the empty body (used inside the list panel). */
  embedded?: boolean;
}) {
  const emptyBody = (
    <div className={`camp-empty${embedded ? " camp-empty--panel" : ""}`}>
      <img src={megaphoneBox} alt="" className="camp-empty__art" />
      <h3 className="camp-empty__title">No campaigns yet</h3>
      <p className="camp-empty__desc">
        Launch a points campaign from a shop, or send a kit to start tracking activity here.
      </p>
      {canSend ? (
        <>
          <button type="button" className="camp-empty__cta" onClick={onSendGift}>
            Create your first campaign
          </button>
          <div className="camp-start">
            <div className="camp-start__card">
              <span className="camp-start__label">Send points</span>
              <span className="camp-start__hint">
                Let recipients choose swag from your branded shop.
              </span>
              <button type="button" className="camp-start__link" onClick={onSendPointsCampaign}>
                Start points campaign
              </button>
            </div>
            <div className="camp-start__card">
              <span className="camp-start__label">Send a kit</span>
              <span className="camp-start__hint">Ship a curated bundle of branded items.</span>
              <button type="button" className="camp-start__link" onClick={onSendKitCampaign}>
                Start kit campaign
              </button>
            </div>
          </div>
        </>
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
