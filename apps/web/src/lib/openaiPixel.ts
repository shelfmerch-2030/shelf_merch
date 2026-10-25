/**
 * OpenAI Ads Measurement Pixel.
 * Official loader and commands: https://developers.openai.com/ads/measurement-pixel
 *
 * The script is not inserted, and `oaiq` is not called, unless both are true:
 * a non-empty `VITE_OPENAI_PIXEL_ID`, and measurement consent `"granted"`.
 * Shelf Merch has no consent control, so `readOpenAiMeasurementConsent()`
 * stays `"unknown"` and this module does not load the pixel.
 */

export const OPENAI_PIXEL_SCRIPT_SRC = "https://bzrcdn.openai.com/sdk/oaiq.min.js";

export type OpenAiMeasurementConsent = "granted" | "denied" | "unknown";

type Oaiq = {
  (...args: unknown[]): void;
  q: unknown[];
};

type PixelWindow = Window & { oaiq?: Oaiq };

export type OpenAiPixelDeps = {
  getPixelId: () => string | undefined | null;
  getConsent: () => OpenAiMeasurementConsent;
  getWindow: () => PixelWindow | undefined;
};

/**
 * No cookie banner or consent platform exists. Keep this on `"unknown"`
 * until a real control can record an explicit measurement choice.
 */
export function readOpenAiMeasurementConsent(): OpenAiMeasurementConsent {
  return "unknown";
}

function pixelIdFrom(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

function safeEventId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 128 || id.includes("@") || /\s/.test(id)) return null;
  return id;
}

function installOpenAiQueue(win: PixelWindow, doc: Document) {
  if (win.oaiq) return;
  const q = function oaiqQueue(this: unknown, ...args: unknown[]) {
    q.q.push(args);
  } as Oaiq;
  q.q = [];
  win.oaiq = q;
  const script = doc.createElement("script");
  script.async = true;
  script.src = OPENAI_PIXEL_SCRIPT_SRC;
  const first = doc.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(script, first);
  else (doc.head || doc.documentElement).appendChild(script);
}

export function createOpenAiPixelTracker(deps: OpenAiPixelDeps) {
  const sent = new Set<string>();
  let initialized = false;

  function pixelId() {
    return pixelIdFrom(deps.getPixelId());
  }

  function measurementAllowed() {
    return pixelId().length > 0 && deps.getConsent() === "granted";
  }

  function prepare() {
    try {
      if (!measurementAllowed() || initialized) return;
      const win = deps.getWindow();
      const doc = win?.document;
      if (!win || !doc) return;
      installOpenAiQueue(win, doc);
      win.oaiq?.("consent", true);
      win.oaiq?.("init", { pixelId: pixelId() });
      initialized = true;
    } catch {
      /* Measurement must not affect application startup. */
    }
  }

  function measure(eventName: "lead_created" | "registration_completed", eventId: unknown) {
    try {
      const id = safeEventId(eventId);
      if (!measurementAllowed() || !id) return;
      const key = `${eventName}:${id}`;
      if (sent.has(key)) return;
      sent.add(key);
      prepare();
      deps.getWindow()?.oaiq?.("measure", eventName, { type: "customer_action" }, { event_id: id });
    } catch {
      /* A pixel failure must not affect the completed product action. */
    }
  }

  return {
    prepare,
    trackLeadCreated(eventId: unknown) {
      measure("lead_created", eventId);
    },
    trackRegistrationCompleted(eventId: unknown) {
      measure("registration_completed", eventId);
    },
  };
}

const openAiPixel = createOpenAiPixelTracker({
  getPixelId: () => import.meta.env.VITE_OPENAI_PIXEL_ID,
  getConsent: readOpenAiMeasurementConsent,
  getWindow: () => (typeof window === "undefined" ? undefined : window),
});

export function prepareOpenAiPixel() {
  openAiPixel.prepare();
}

export function trackOpenAiLeadCreated(eventId: unknown) {
  openAiPixel.trackLeadCreated(eventId);
}

export function trackOpenAiRegistrationCompleted(eventId: unknown) {
  openAiPixel.trackRegistrationCompleted(eventId);
}
