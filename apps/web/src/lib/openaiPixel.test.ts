import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPENAI_PIXEL_SCRIPT_SRC,
  createOpenAiPixelTracker,
  prepareOpenAiPixel,
  readOpenAiMeasurementConsent,
  trackOpenAiLeadCreated,
  trackOpenAiRegistrationCompleted,
  type OpenAiMeasurementConsent,
} from "./openaiPixel";

type ScriptEl = { async: boolean; src: string };

function fakeBrowser() {
  const scripts: ScriptEl[] = [];
  const win = {
    document: {
      createElement: (tag: string) => {
        if (tag !== "script") return {};
        const el: ScriptEl = { async: false, src: "" };
        scripts.push(el);
        return el;
      },
      getElementsByTagName: () => [] as ScriptEl[],
      head: { appendChild: () => undefined },
      documentElement: { appendChild: () => undefined },
    },
  };
  return { win: win as unknown as Window & { oaiq?: (...args: unknown[]) => void }, scripts };
}

function trackerFor(consent: OpenAiMeasurementConsent, pixelId = "px_test", browser = fakeBrowser()) {
  const tracker = createOpenAiPixelTracker({
    getPixelId: () => pixelId,
    getConsent: () => consent,
    getWindow: () => browser.win,
  });
  return { tracker, ...browser };
}

function calls(win: { oaiq?: { q?: unknown[] } }) {
  return (win.oaiq?.q ?? []) as unknown[][];
}

describe("OpenAI measurement pixel", () => {
  it("stays unloaded in the application because consent is unknown", () => {
    expect(readOpenAiMeasurementConsent()).toBe("unknown");
    prepareOpenAiPixel();
    trackOpenAiLeadCreated("lead-1");
    trackOpenAiRegistrationCompleted("user-1");
    expect(typeof window === "undefined" || !("oaiq" in window)).toBe(true);
  });

  it("does not add the pixel to the GTM document shell", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(html).toContain("googletagmanager.com/gtm.js");
    expect(html).not.toContain("oaiq");
    expect(html).not.toContain("bzrcdn.openai.com");
  });

  it("does not initialize when the pixel id is missing, blank, or consent is not granted", () => {
    for (const pixelId of ["", "   ", undefined]) {
      const browser = fakeBrowser();
      const tracker = createOpenAiPixelTracker({
        getPixelId: () => pixelId,
        getConsent: () => "granted",
        getWindow: () => browser.win,
      });
      tracker.prepare();
      tracker.trackLeadCreated("lead-1");
      expect(browser.scripts).toHaveLength(0);
      expect(browser.win.oaiq).toBeUndefined();
    }

    const blocked = trackerFor("unknown", "px_live");
    blocked.tracker.prepare();
    blocked.tracker.trackRegistrationCompleted("user-1");
    expect(blocked.scripts).toHaveLength(0);
    expect(blocked.win.oaiq).toBeUndefined();
  });

  it("sends lead_created and registration_completed without customer details", () => {
    const lead = trackerFor("granted");
    lead.tracker.trackLeadCreated("lead-1");
    const registration = trackerFor("granted", "px_reg");
    registration.tracker.trackRegistrationCompleted("user-1");

    expect(lead.scripts.map((script) => script.src)).toEqual([OPENAI_PIXEL_SCRIPT_SRC]);
    expect(lead.scripts[0]?.async).toBe(true);
    expect(calls(lead.win)).toEqual([
      ["consent", true],
      ["init", { pixelId: "px_test" }],
      ["measure", "lead_created", { type: "customer_action" }, { event_id: "lead-1" }],
    ]);
    expect(calls(registration.win)[2]).toEqual([
      "measure",
      "registration_completed",
      { type: "customer_action" },
      { event_id: "user-1" },
    ]);

    const payload = JSON.stringify([...calls(lead.win), ...calls(registration.win)]);
    expect(payload).not.toContain("email");
    expect(payload).not.toContain("phone");
    expect(payload).not.toContain("name");
    expect(payload).not.toContain("@");
    expect(payload).not.toContain('"user"');
  });

  it("sends one conversion for a repeated event id and ignores unsafe ids", () => {
    const { tracker, win, scripts } = trackerFor("granted");
    tracker.trackLeadCreated("lead-1");
    tracker.trackLeadCreated("lead-1");
    tracker.trackLeadCreated("  lead-1  ");
    tracker.trackLeadCreated("ada@example.com");
    tracker.trackLeadCreated("");
    tracker.prepare();

    const measured = calls(win).filter((call) => call[0] === "measure");
    expect(measured).toEqual([
      ["measure", "lead_created", { type: "customer_action" }, { event_id: "lead-1" }],
    ]);
    expect(scripts).toHaveLength(1);
  });

  it("swallows pixel failures", () => {
    const browser = fakeBrowser();
    const tracker = createOpenAiPixelTracker({
      getPixelId: () => "px_test",
      getConsent: () => "granted",
      getWindow: () => browser.win,
    });
    tracker.prepare();
    browser.win.oaiq = () => {
      throw new Error("pixel unavailable");
    };
    expect(() => tracker.trackLeadCreated("lead-9")).not.toThrow();
    expect(() => tracker.trackRegistrationCompleted("user-9")).not.toThrow();
  });
});
