import { useEffect, useRef, useState } from "react";
import { SendingRocketArt } from "./SendingRocketArt";

export type SendingPointsRecipient = {
  id: string;
  name: string;
  avatarUrl?: string;
};

type Props = {
  recipients: SendingPointsRecipient[];
  totalPoints: number;
  isComplete: boolean;
  /** When set, show error UI instead of the sending/success animation. */
  error?: string | null;
  onRetry?: () => void;
  /** e.g. "points" or "credits" */
  unitLabel?: string;
};

/** Send-points loading — rocket launch illustration with live count. */
export function SendingPointsAnimation({
  totalPoints,
  isComplete,
  error = null,
  onRetry,
  unitLabel = "points",
}: Props) {
  const [displayPoints, setDisplayPoints] = useState(0);
  const rafRef = useRef<number | null>(null);
  const displayRef = useRef(0);
  const target = Math.max(0, Math.round(totalPoints));
  const unit = normalizedUnit(unitLabel);
  const unitCap = cap(unit);
  const reachedTarget = isComplete && displayPoints >= target;

  const liveMessage = error
    ? error
    : reachedTarget
      ? `${unitCap} have been Successfully sent`
      : `Sending ${displayPoints.toLocaleString("en-IN")} ${unit}`;

  const statusLine = error
    ? `Couldn't send ${unit}`
    : reachedTarget
      ? `${target.toLocaleString("en-IN")} ${unit} sent!`
      : `Sending ${displayPoints.toLocaleString("en-IN")} ${unit}...`;

  useEffect(() => {
    displayRef.current = displayPoints;
  }, [displayPoints]);

  useEffect(() => {
    if (error) {
      setDisplayPoints(0);
      displayRef.current = 0;
      return;
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      const next = isComplete ? target : Math.floor(target * 0.88);
      displayRef.current = next;
      setDisplayPoints(next);
      return;
    }

    const start = performance.now();
    const duration = isComplete ? 420 : 2200;
    const from = displayRef.current;
    const to = isComplete ? target : Math.max(from, Math.floor(target * 0.88));

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (to - from) * eased);
      displayRef.current = next;
      setDisplayPoints(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (isComplete) {
        displayRef.current = target;
        setDisplayPoints(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isComplete, error, target]);

  const sceneState = error
    ? "spa-scene--err"
    : reachedTarget
      ? "spa-scene--done"
      : "spa-scene--loading";

  return (
    <div className="spa-root" role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">{liveMessage}</span>

      {error ? (
        <div className="spa-meta">
          <p className="spa-title spa-title--err">{statusLine}</p>
          <p className="spa-sub">{error}</p>
          {onRetry ? (
            <button type="button" className="btn btn-brand" style={{ marginTop: 14 }} onClick={onRetry}>
              Back to checkout
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className={`spa-scene ${sceneState}`} aria-hidden="true">
            <SendingRocketArt done={reachedTarget} />
            {!reachedTarget ? (
              <>
                <span className="spa-point" />
                <span className="spa-point" />
                <span className="spa-point" />
                <span className="spa-point" />
                <span className="spa-point" />
              </>
            ) : null}
          </div>

          <div className="spa-meta">
            {reachedTarget ? (
              <div className="spa-success-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5.5 12.6l4.1 4.1 8.9-9.4"
                    stroke="#fff"
                    strokeWidth="3.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            ) : null}
            <p className="spa-title spa-title--primary">{statusLine}</p>
            <p className="spa-sub">
              {reachedTarget
                ? `${unitCap} have been Successfully sent`
                : "Hang tight! This may take a few seconds."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function normalizedUnit(unitLabel: string) {
  const u = unitLabel.toLowerCase();
  if (u.startsWith("point")) return "points";
  if (u.startsWith("credit")) return "credits";
  return u || "points";
}
