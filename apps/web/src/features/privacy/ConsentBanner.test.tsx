// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { CONSENT_STORAGE_KEY } from "@/lib/consentChoice";
import { ConsentBanner } from "./ConsentBanner";
import { MeasurementConsentChoice } from "./MeasurementConsentChoice";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("consent banner", () => {
  it("keeps optional measurement off until accept, reject, or a saved preference", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    expect(screen.getByRole("dialog", { name: "Cookies and measurement" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reject optional" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toMatchObject({
      analytics: false,
      advertising: false,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves an analytics-only preference from manage preferences", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);
    await user.click(screen.getByRole("button", { name: "Manage preferences" }));
    await user.click(screen.getByRole("checkbox", { name: /Analytics/ }));
    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toEqual({
      v: 1,
      analytics: true,
      advertising: false,
    });
  });

  it("reopens saved preferences without clearing them", async () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, analytics: true, advertising: false }),
    );
    render(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("shelfmerch:open-consent"));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Analytics/ })).toBeTruthy();
  });
});

describe("privacy consent choice", () => {
  it("records accept all and a later rejection", async () => {
    const user = userEvent.setup();
    render(<MeasurementConsentChoice />);
    expect(screen.getByText(/Optional measurement stays off/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Accept all" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toMatchObject({
      analytics: true,
      advertising: true,
    });
    await user.click(screen.getByRole("button", { name: "Reject optional" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toMatchObject({
      analytics: false,
      advertising: false,
    });
  });
});
