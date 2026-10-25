/**
 * Browser choice for optional advertising measurement.
 * Shelf Merch has no consent platform to reuse. This store is the single
 * choice for the OpenAI Measurement Pixel. It does not control Google Tag
 * Manager, GA4, or Meta.
 *
 * No choice is stored until the visitor picks Allow or Don't allow.
 * "unknown" keeps measurement unloaded.
 */

export const MEASUREMENT_CONSENT_STORAGE_KEY = "shelfmerch.advertising-measurement-consent";

export type MeasurementConsent = "granted" | "denied" | "unknown";

const listeners = new Set<() => void>();

function storedDecision(storage: Storage): MeasurementConsent {
  const value = storage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : "unknown";
}

function browserStorage(): Storage | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    return localStorage;
  } catch {
    return undefined;
  }
}

export function readMeasurementConsent(): MeasurementConsent {
  const storage = browserStorage();
  if (!storage) return "unknown";
  try {
    return storedDecision(storage);
  } catch {
    return "unknown";
  }
}

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A listener failure must not block the visitor's choice. */
    }
  }
}

export function setMeasurementConsent(decision: "granted" | "denied") {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(MEASUREMENT_CONSENT_STORAGE_KEY, decision);
  } catch {
    return;
  }
  notify();
}

export function withdrawMeasurementConsent() {
  setMeasurementConsent("denied");
}

export function subscribeMeasurementConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
