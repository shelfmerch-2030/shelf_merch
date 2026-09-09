import { describe, expect, it } from "vitest";
import {
  buildRequestDemoWhatsAppHref,
  buildRequestDemoWhatsAppMessage,
  getRequestDemoFirstName,
} from "./model";

describe("request demo form model", () => {
  it("derives a friendly first name from the submitted full name", () => {
    expect(getRequestDemoFirstName("  Priya Shah  ")).toBe("Priya");
    expect(getRequestDemoFirstName("   ")).toBe("there");
  });

  it("builds a WhatsApp link with entered request details", () => {
    const message = buildRequestDemoWhatsAppMessage({
      fullName: "Priya Shah",
      companyName: "Acme",
      workEmail: "priya@acme.test",
      mobileNumber: "+91 98765 43210",
      requirement: "Employee Onboarding Kits",
    });

    const href = buildRequestDemoWhatsAppHref(message);

    expect(decodeURIComponent(href)).toContain("https://wa.me/917337221188?text=");
    expect(decodeURIComponent(href)).toContain("Full name: Priya Shah");
    expect(decodeURIComponent(href)).toContain("Requirement: Employee Onboarding Kits");
  });
});
