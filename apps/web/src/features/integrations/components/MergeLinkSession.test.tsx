import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  mergeLinkHostUrl,
  parseMergeLinkHostMessage,
  MERGE_LINK_MSG_SOURCE,
} from "./mergeLinkHostMessages";
import { MergeLinkSession } from "./MergeLinkSession";

describe("parseMergeLinkHostMessage", () => {
  const origin = "http://localhost:8080";

  it("accepts success with publicToken from matching origin/source", () => {
    expect(
      parseMergeLinkHostMessage(
        {
          origin,
          data: {
            source: MERGE_LINK_MSG_SOURCE,
            type: "success",
            publicToken: "pub_abc",
          },
        },
        origin,
      ),
    ).toEqual({
      source: MERGE_LINK_MSG_SOURCE,
      type: "success",
      publicToken: "pub_abc",
    });
  });

  it("accepts ready, exit, and error", () => {
    expect(
      parseMergeLinkHostMessage(
        { origin, data: { source: MERGE_LINK_MSG_SOURCE, type: "ready" } },
        origin,
      )?.type,
    ).toBe("ready");
    expect(
      parseMergeLinkHostMessage(
        { origin, data: { source: MERGE_LINK_MSG_SOURCE, type: "exit" } },
        origin,
      )?.type,
    ).toBe("exit");
    expect(
      parseMergeLinkHostMessage(
        {
          origin,
          data: { source: MERGE_LINK_MSG_SOURCE, type: "error", message: "boom" },
        },
        origin,
      ),
    ).toEqual({
      source: MERGE_LINK_MSG_SOURCE,
      type: "error",
      message: "boom",
    });
  });

  it("ignores invalid origin", () => {
    expect(
      parseMergeLinkHostMessage(
        {
          origin: "https://evil.example",
          data: { source: MERGE_LINK_MSG_SOURCE, type: "success", publicToken: "x" },
        },
        origin,
      ),
    ).toBeNull();
  });

  it("ignores unrelated source / malformed payloads", () => {
    expect(
      parseMergeLinkHostMessage(
        { origin, data: { source: "other", type: "success", publicToken: "x" } },
        origin,
      ),
    ).toBeNull();
    expect(parseMergeLinkHostMessage({ origin, data: null }, origin)).toBeNull();
    expect(
      parseMergeLinkHostMessage(
        { origin, data: { source: MERGE_LINK_MSG_SOURCE, type: "success" } },
        origin,
      ),
    ).toBeNull();
  });

  it("builds host URL with encoded linkToken", () => {
    expect(mergeLinkHostUrl("http://localhost:8080", "tok/a+b")).toBe(
      "http://localhost:8080/merge-link-host.html?linkToken=tok%2Fa%2Bb",
    );
  });
});

describe("MergeLinkSession iframe modal", () => {
  const openSpy = vi.fn();

  beforeEach(() => {
    openSpy.mockReset();
    vi.stubGlobal("open", openSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not call window.open and mounts iframe after token is provided", () => {
    render(
      <MergeLinkSession
        linkToken="token-workday-1"
        provider="workday"
        onSuccess={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(openSpy).not.toHaveBeenCalled();
    const iframe = screen.getByTitle("Merge Link") as HTMLIFrameElement;
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe.src).toContain("/merge-link-host.html?linkToken=token-workday-1");
  });

  it("remounts iframe with a fresh token when provider switches", () => {
    const { rerender } = render(
      <MergeLinkSession
        linkToken="token-workday"
        provider="workday"
        onSuccess={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    expect((screen.getByTitle("Merge Link") as HTMLIFrameElement).src).toContain(
      "token-workday",
    );

    rerender(
      <MergeLinkSession
        linkToken="token-bamboohr"
        provider="bamboohr"
        onSuccess={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    expect((screen.getByTitle("Merge Link") as HTMLIFrameElement).src).toContain(
      "token-bamboohr",
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("success postMessage triggers onSuccess and does not call onExit", async () => {
    const onSuccess = vi.fn();
    const onExit = vi.fn();
    render(
      <MergeLinkSession
        linkToken="token-1"
        provider="keka"
        onSuccess={onSuccess}
        onExit={onExit}
      />,
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            source: MERGE_LINK_MSG_SOURCE,
            type: "success",
            publicToken: "public_123",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("public_123");
    });
    expect(onExit).not.toHaveBeenCalled();
  });

  it("exit postMessage closes without success", async () => {
    const onSuccess = vi.fn();
    const onExit = vi.fn();
    render(
      <MergeLinkSession
        linkToken="token-1"
        provider="ukg-pro"
        onSuccess={onSuccess}
        onExit={onExit}
      />,
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { source: MERGE_LINK_MSG_SOURCE, type: "exit" },
        }),
      );
    });

    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("ignores invalid origin and unrelated messages", async () => {
    const onSuccess = vi.fn();
    const onExit = vi.fn();
    render(
      <MergeLinkSession
        linkToken="token-1"
        provider="deel"
        onSuccess={onSuccess}
        onExit={onExit}
      />,
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://evil.example",
          data: {
            source: MERGE_LINK_MSG_SOURCE,
            type: "success",
            publicToken: "nope",
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { source: "other", type: "success", publicToken: "nope" },
        }),
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("Escape closes via onExit (no outer ShelfMerch X)", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(
      <MergeLinkSession
        linkToken="token-1"
        provider="workday"
        onSuccess={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onExit).toHaveBeenCalled());
  });
});
