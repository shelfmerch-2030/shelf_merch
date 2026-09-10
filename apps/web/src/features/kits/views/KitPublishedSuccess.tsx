import { Check, Gift, Send } from "lucide-react";
import kitPublishedImg from "../../../../assets/kit-published.png";
import "./kit-published-success.css";

export function KitPublishedSuccess({
  kitName,
  onSendKit,
  onGoToKits,
}: {
  kitName: string;
  onSendKit: () => void;
  onGoToKits: () => void;
}) {
  return (
    <div className="kit-published fade-in">
      <div className="kit-published__layout">
        <div className="kit-published__copy">
          <div className="kit-published__icon" aria-hidden="true">
            <Check strokeWidth={2.6} />
          </div>
          <p className="kit-published__eyebrow">
            <span className="kit-published__eyebrow-dot" aria-hidden="true" />
            Ready to send
          </p>
          <h1 className="kit-published__title" id="kit-published-title">
            Your kit is <em>published.</em>
          </h1>
          <p className="kit-published__lead">
            <strong>{kitName}</strong> is live in your catalog. Send it to colleagues now, or come
            back to it anytime from Kits.
          </p>

          <div className="kit-published__status">
            <span className="kit-published__status-icon" aria-hidden="true">
              <Gift size={17} strokeWidth={2} />
            </span>
            <span>
              <strong>{kitName}</strong> ready to send
            </span>
          </div>

          <div className="kit-published__actions">
            {onRequestSample ? (
              <button type="button" className="btn btn-ghost btn-lg" onClick={onRequestSample}>
                Request a Sample
              </button>
            ) : null}
            <button type="button" className="btn btn-brand btn-lg" onClick={onSendKit}>
              Send kit <Send size={15} />
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={onGoToKits}>
              Go to kits
            </button>
          </div>

          <div className="kit-published__note">
            <strong>What happens next</strong>
            <p>
              Start a send with this kit, or keep designing more boxes. Recipients get a branded
              experience — you can reuse this kit across campaigns.
            </p>
          </div>
        </div>

        <div className="kit-published__visual" aria-hidden="true">
          <div className="kit-published__shape kit-published__shape--yellow" />
          <div className="kit-published__shape kit-published__shape--coral" />
          <div className="kit-published__shape kit-published__shape--blue" />
          <article className="kit-published__card">
            <span className="kit-published__card-label">Branded kit</span>
            <h3>
              Ready
              <br />
              to send
            </h3>
            <div className="kit-published__card-art">
              <img src={kitPublishedImg} alt="" />
            </div>
            <div className="kit-published__meter">
              <div>
                <b>{kitName}</b>
                <small>Kit name</small>
              </div>
              <div>
                <b>Live</b>
                <small>Ready to share</small>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}