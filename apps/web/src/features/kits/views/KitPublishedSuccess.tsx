import { useEffect } from "react";
import confetti from "canvas-confetti";
import { Gift, Send } from "lucide-react";
import kitPublishedImg from "../../../../assets/kit-published.png";
import "./kit-published-success.css";

const CONFETTI_COLORS = ["#2563eb", "#3b82f6", "#60a5fa", "#fbbf24", "#93c5fd"];

export function KitPublishedSuccess({
  kitName,
  onSendKit,
  onGoToKits,
}: {
  kitName: string;
  onSendKit: () => void;
  onGoToKits: () => void;
}) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const end = Date.now() + 1_800;
    const timer = window.setInterval(() => {
      const remaining = end - Date.now();
      if (remaining <= 0) {
        window.clearInterval(timer);
        return;
      }

      confetti({
        particleCount: 10,
        angle: 60,
        spread: 70,
        startVelocity: 34,
        origin: { x: 0, y: 0.55 },
        colors: CONFETTI_COLORS,
        scalar: 0.9,
      });
      confetti({
        particleCount: 10,
        angle: 120,
        spread: 70,
        startVelocity: 34,
        origin: { x: 1, y: 0.55 },
        colors: CONFETTI_COLORS,
        scalar: 0.9,
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="kit-published-page">
      <section className="kit-published-card" aria-labelledby="kit-published-title">
        <div className="kit-published-art" aria-hidden="true">
          <div className="kit-published-glow" />
          <img src={kitPublishedImg} alt="" />
        </div>

        <div className="kit-published-copy">
          <span className="kit-published-eyebrow">
            <span className="kit-published-eyebrow-dot" aria-hidden="true" />
            Ready to share
          </span>
          <h1 id="kit-published-title">Your kit has been published!</h1>
          <p className="kit-published-name">{kitName}</p>
          <p className="kit-published-lead">Now send this kit to your colleagues.</p>
        </div>

        <div className="kit-published-actions">
          <button type="button" className="kit-published-send" onClick={onSendKit}>
            <Send size={18} aria-hidden="true" />
            Send Kit
          </button>
          <button type="button" className="kit-published-kits" onClick={onGoToKits}>
            <Gift size={18} aria-hidden="true" />
            Go to Kits
          </button>
        </div>
      </section>
    </main>
  );
}
