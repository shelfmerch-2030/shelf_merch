import { afterEach, describe, expect, it, vi } from "vitest";
import { streamCopilotMessage } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("streamCopilotMessage", () => {
  it("reports a gateway outage when the proxy returns HTML", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html>Bad Gateway</html>", { status: 502 }),
    ));
    const onError = vi.fn();

    await streamCopilotMessage("c1", "Show apparel", { onError });

    expect(onError).toHaveBeenCalledExactlyOnceWith({
      code: "GATEWAY_ERROR",
      message: "Copilot is temporarily unavailable (HTTP 502). Please try again.",
    });
  });

  it("preserves the error details returned by Copilot", async () => {
    const error = { code: "RATE_LIMITED", message: "Too many requests" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status: 429 })));
    const onError = vi.fn();

    await streamCopilotMessage("c1", "Show apparel", { onError });

    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  });
});
