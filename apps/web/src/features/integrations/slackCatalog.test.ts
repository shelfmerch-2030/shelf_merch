import { describe, it, expect } from "vitest";
import { COLLABORATION_TOOLS } from "./data";

describe("Slack integrations catalog", () => {
  it("includes Slack in collaboration tools", () => {
    const slack = COLLABORATION_TOOLS.find((t) => t.id === "slack");
    expect(slack).toBeTruthy();
    expect(slack?.name).toBe("Slack");
    expect(slack?.requiresSetup).toBeFalsy();
  });
});