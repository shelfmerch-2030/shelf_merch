// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MEASUREMENT_CONSENT_STORAGE_KEY } from "@/lib/measurementConsent";
import { MeasurementConsentChoice } from "./MeasurementConsentChoice";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("MeasurementConsentChoice", () => {
  it("records allow and withdrawal without a separate banner", async () => {
    const user = userEvent.setup();
    render(<MeasurementConsentChoice />);

    expect(document.body.textContent).toContain("Advertising measurement stays off");
    await user.click(document.querySelector("button") as HTMLButtonElement);
    expect(localStorage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(document.body.textContent).toContain("You allowed advertising measurement");

    await user.click(document.querySelectorAll("button")[0] as HTMLButtonElement);
    expect(localStorage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("denied");
    expect(document.body.textContent).toContain("You declined advertising measurement");
  });
});
