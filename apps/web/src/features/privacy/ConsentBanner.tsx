import { useEffect, useRef, useState } from "react";
import { readConsentChoice, subscribeConsentChoice } from "@/lib/consentChoice";
import { useConsentDraft } from "./useConsentDraft";
import "./measurement-consent.css";

export function ConsentBanner() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => readConsentChoice() === null);
  const [managing, setManaging] = useState(false);
  const { draft, setDraft, acceptAll, rejectOptional, saveDraft } = useConsentDraft();

  useEffect(() => {
    return subscribeConsentChoice(() => {
      if (readConsentChoice() === null) setVisible(true);
    });
  }, []);

  useEffect(() => {
    const open = () => {
      setManaging(true);
      setVisible(true);
      panelRef.current?.querySelector("button")?.focus();
    };
    window.addEventListener("shelfmerch:open-consent", open);
    return () => window.removeEventListener("shelfmerch:open-consent", open);
  }, []);

  if (!visible) return null;

  function closeAfterChoice(save: () => void) {
    save();
    setVisible(false);
    setManaging(false);
  }

  return (
    <div
      ref={panelRef}
      className="consent-banner"
      role="dialog"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-copy"
    >
      <div className="consent-banner__inner">
        <div className="consent-banner__copy">
          <h2 id="consent-banner-title">Your privacy choices</h2>
          <p id="consent-banner-copy">
            We use essential cookies to keep Shelfmerch working. With your permission, we also use
            cookies for analytics and advertising.
          </p>
        </div>
        <div className="consent-banner__controls">
          <div className="consent-banner__actions">
            <button type="button" onClick={() => closeAfterChoice(acceptAll)}>
              Accept all
            </button>
            <button type="button" onClick={() => closeAfterChoice(rejectOptional)}>
              Reject optional
            </button>
          </div>
          <div className="consent-banner__links">
            <button type="button" onClick={() => setManaging((open) => !open)} aria-expanded={managing}>
              Manage preferences
            </button>
            <a href="/privacy#cookie-preferences">Privacy policy</a>
          </div>
        </div>
        {managing ? (
          <fieldset className="consent-banner__prefs">
            <legend>Optional measurement</legend>
            <label>
              <input type="checkbox" checked disabled /> Essential, always on
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.analytics}
                onChange={(event) => setDraft((current) => ({ ...current, analytics: event.target.checked }))}
              />
              Analytics, Google Analytics 4
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.advertising}
                onChange={(event) => setDraft((current) => ({ ...current, advertising: event.target.checked }))}
              />
              Advertising, Meta and OpenAI measurement
            </label>
            <button type="button" onClick={() => closeAfterChoice(saveDraft)}>
              Save preferences
            </button>
          </fieldset>
        ) : null}
      </div>
    </div>
  );
}
