// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ApiError } from "@/services/api";
import { RequestDemoForm } from "./RequestDemoForm";

const publicFetch = vi.fn();
const trackOpenAiLeadCreated = vi.fn();

vi.mock("@/services/api", async () => {
  const actual = await vi.importActual<typeof import("@/services/api")>("@/services/api");
  return { ...actual, publicFetch: (...args: unknown[]) => publicFetch(...args) };
});

vi.mock("@/lib/openaiPixel", () => ({
  trackOpenAiLeadCreated: (...args: unknown[]) => trackOpenAiLeadCreated(...args),
}));

afterEach(() => {
  cleanup();
  publicFetch.mockReset();
  trackOpenAiLeadCreated.mockReset();
});

function renderForm() {
  return render(
    <MemoryRouter>
      <RequestDemoForm />
    </MemoryRouter>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.type(document.getElementById("demo-full-name") as HTMLInputElement, "Ada Lovelace");
  await user.type(document.getElementById("demo-company-name") as HTMLInputElement, "Analytical Engines");
  await user.type(document.getElementById("demo-email") as HTMLInputElement, "ada@example.com");
  await user.type(document.getElementById("demo-mobile") as HTMLInputElement, "9876543210");
  return user;
}

describe("RequestDemoForm OpenAI lead measurement", () => {
  it("tracks lead_created only after the demo request is saved", async () => {
    publicFetch.mockResolvedValue({ id: "lead-1", status: "new" });
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    expect(await document.body.textContent).toContain("Request received");
    expect(publicFetch).toHaveBeenCalledTimes(1);
    expect(trackOpenAiLeadCreated).toHaveBeenCalledTimes(1);
    expect(trackOpenAiLeadCreated).toHaveBeenCalledWith("lead-1");
    expect(JSON.stringify(trackOpenAiLeadCreated.mock.calls)).not.toContain("ada@example.com");
  });

  it("does not track a lead when the request fails", async () => {
    publicFetch.mockRejectedValue(new ApiError(500, "unavailable", "SERVER"));
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    expect(await document.querySelector("[role='alert']")?.textContent).toContain(
      "Something went wrong while submitting your request",
    );
    expect(trackOpenAiLeadCreated).not.toHaveBeenCalled();
    expect(document.querySelector("button[type='submit']")).not.toBeNull();
  });

  it("does not treat a demo-button or WhatsApp click as a lead", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderForm();
    const user = userEvent.setup();

    await user.click(document.querySelector(".request-demo__whatsapp-button") as HTMLButtonElement);

    expect(open).toHaveBeenCalledTimes(1);
    expect(publicFetch).not.toHaveBeenCalled();
    expect(trackOpenAiLeadCreated).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("saves one lead when submit is repeated before the response returns", async () => {
    let resolveFetch: (value: { id: string; status: string }) => void = () => undefined;
    publicFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    renderForm();
    await fillRequiredFields();
    const form = document.querySelector("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);
    expect(publicFetch).toHaveBeenCalledTimes(1);

    resolveFetch({ id: "lead-1", status: "new" });
    await waitFor(() => {
      expect(trackOpenAiLeadCreated).toHaveBeenCalledTimes(1);
    });
    expect(trackOpenAiLeadCreated).toHaveBeenCalledWith("lead-1");
  });

  it("still confirms the request when measurement throws", async () => {
    publicFetch.mockResolvedValue({ id: "lead-2", status: "new" });
    trackOpenAiLeadCreated.mockImplementation(() => {
      throw new Error("pixel unavailable");
    });
    renderForm();
    const user = await fillRequiredFields();

    await user.click(document.querySelector("button[type='submit']") as HTMLButtonElement);

    await waitFor(() => {
      expect(document.body.textContent).toContain("Request received");
    });
  });
});
