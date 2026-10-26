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
        <h2 id="consent-banner-title">Cookies and measurement</h2>
        <p id="consent-banner-copy">
          Essential cookies keep sign-in, security, and the service working. Analytics and advertising
          measurement stay off until you choose. Accepting advertising allows the Meta tag in Google Tag
          Manager. The OpenAI pixel stays unloaded until Shelf Merch finishes a separate review.
        </p>
        <div className="consent-banner__actions">
          <button type="button" onClick={() => closeAfterChoice(acceptAll)}>
            Accept all
          </button>
          <button type="button" onClick={() => closeAfterChoice(rejectOptional)}>
            Reject optional
          </button>
          <button type="button" onClick={() => setManaging((open) => !open)} aria-expanded={managing}>
            Manage preferences
          </button>
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
        <a href="/privacy#cookie-preferences">Privacy and cookie details</a>
      </div>
    </div>
  );
}
