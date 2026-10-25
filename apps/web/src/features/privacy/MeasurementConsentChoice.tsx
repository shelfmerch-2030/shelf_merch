import { useEffect, useState } from "react";
import {
  readMeasurementConsent,
  setMeasurementConsent,
  subscribeMeasurementConsent,
  withdrawMeasurementConsent,
  type MeasurementConsent,
} from "@/lib/measurementConsent";
import "./measurement-consent.css";

const STATUS: Record<MeasurementConsent, string> = {
  unknown: "No choice is saved in this browser. Advertising measurement stays off.",
  granted: "You allowed advertising measurement in this browser. You can withdraw that choice at any time.",
  denied: "You declined advertising measurement in this browser. It stays off.",
};

export function MeasurementConsentChoice() {
  const [consent, setConsent] = useState<MeasurementConsent>("unknown");

  useEffect(() => {
    setConsent(readMeasurementConsent());
    return subscribeMeasurementConsent(() => setConsent(readMeasurementConsent()));
  }, []);

  return (
    <section
      id="measurement-choice"
      className="measurement-consent"
      aria-labelledby="measurement-choice-title"
    >
      <h2 id="measurement-choice-title">Advertising measurement</h2>
      <p>
        Shelf Merch can use an optional OpenAI measurement pixel to record that a demo request was
        saved or an account registration finished. That pixel is not loaded unless you allow it here
        and Shelf Merch has switched it on. Event data is limited to the event name and an id. Your
        name, email, phone number, and verification code are not included.
      </p>
      <p>
        If the pixel runs, OpenAI may store two first-party cookies in this browser: __oppref for
        about 30 days and __obref for about 365 days. Withdrawing consent stops later measurement and
        asks the pixel to remove those cookies. This choice is saved only in this browser. It does not
        control essential cookies, and it does not control other tags that the site may already load.
      </p>
      <p className="measurement-consent__status" role="status">
        {STATUS[consent]}
      </p>
      <div className="measurement-consent__actions">
        {consent !== "granted" ? (
          <button type="button" onClick={() => setMeasurementConsent("granted")}>
            Allow advertising measurement
          </button>
        ) : (
          <button type="button" onClick={() => withdrawMeasurementConsent()}>
            Withdraw consent
          </button>
        )}
        {consent === "unknown" ? (
          <button type="button" onClick={() => withdrawMeasurementConsent()}>
            Don&apos;t allow
          </button>
        ) : null}
      </div>
    </section>
  );
}
