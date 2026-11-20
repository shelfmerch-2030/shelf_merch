// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CopilotConfirmationCard, CopilotWriteSuccess } from "./CopilotConfirmationCard";
import { CopilotMarkdown } from "./CopilotMarkdown";
import { CopilotUserMessage } from "./CopilotUserMessage";
import {
  amountLabel,
  completedPresentation,
  operationLabels,
  previewRows,
} from "./actionPresentation";
import type { CopilotConfirmationArtifact } from "./api";
import * as api from "./api";

vi.mock("./api", async () => ({
  ...(await vi.importActual<typeof import("./api")>("./api")),
  resolveCopilotWriteApi: vi.fn().mockResolvedValue({ status: "pending" }),
  executeCopilotWriteApi: vi.fn(),
  cancelCopilotWriteApi: vi.fn(),
  persistCopilotWriteArtifactApi: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const base: CopilotConfirmationArtifact = {
  kind: "confirmation",
  operation: "shops.create",
  confirmationId: "presentation-fixture-confirmation",
  status: "pending",
  preview: { name: "AI Store", currencyMode: "points" },
  request: { name: "Outdated request", amount: 999999 },
};

it.each([
  ["cancelled", "Cancelled"],
  ["completed", "Completed"],
  ["failed", "Failed"],
  ["expired", "Expired"],
  ["consumed", "Unverified"],
  ["unverified", "Unverified"],
  [undefined, "Status unavailable"],
] as const)(
  "renders authoritative %s without reconstructing pending PREPARE or calling recovery",
  (status, label) => {
    render(<CopilotConfirmationCard artifact={{ ...base, status }} onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: `${label} Create store` })).toBeInTheDocument();
    expect(
      screen.getByText("Original preview · proposed values").closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(api.resolveCopilotWriteApi).not.toHaveBeenCalled();
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
    expect(screen.queryByText("Outdated request")).not.toBeInTheDocument();
  },
);
it.each([
  ["This confirmation expired.", "Expired"],
  ["Completion is not verified.", "Unverified"],
])("keeps backend terminal explanation %s", (message, label) => {
  render(
    <CopilotConfirmationCard
      artifact={{ ...base, status: "failed", message }}
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(message);
});
it("renders PREPARE with a friendly heading and native keyboard buttons", () => {
  render(<CopilotConfirmationCard artifact={base} onChange={vi.fn()} />);
  expect(screen.getByText("Review & confirm")).toBeInTheDocument();
  for (const name of ["Confirm", "Cancel"]) {
    const button = screen.getByRole("button", { name });
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toBeDisabled();
  }
  expect(screen.queryByText(/shops\.create|Outdated request|999999/)).not.toBeInTheDocument();
});
it.each(Object.keys(operationLabels))("uses readable completion headings for %s", (operation) => {
  const p = completedPresentation(operation, {});
  expect(p.title).not.toContain(operation);
  expect(p.message).not.toContain(operation);
});
it("shows only verified store fields and existing actions even when saved presentation is stale", () => {
  const result = {
    id: "507f1f77bcf86cd799439011",
    name: "AI Store",
    status: "live",
    currencyMode: "points",
  };
  render(
    <CopilotWriteSuccess
      artifact={{
        kind: "success",
        operation: "shops.create",
        result,
        title: "Old title",
        message: "Click Confirm again",
        details: ["Forged financial total"],
      }}
    />,
  );
  expect(screen.getByText("AI Store is now Live.")).toBeInTheDocument();
  expect(screen.getByText("Points")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View Store" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Manage Store" })).toBeInTheDocument();
  expect(screen.queryByText(/Click Confirm|Forged financial/)).not.toBeInTheDocument();
});
it("does not report Live or offer View Store for unknown status", () => {
  render(
    <CopilotWriteSuccess
      artifact={{
        kind: "success",
        operation: "shops.publish",
        message: "Live",
        result: { id: "store", name: "Rewards" },
        actions: [{ label: "View Store", href: "/store" }],
      }}
    />,
  );
  expect(screen.queryByRole("link", { name: "View Store" })).not.toBeInTheDocument();
  expect(screen.queryByText("Store published successfully!")).not.toBeInTheDocument();
});
it.each(["wallets.setup", "wallets.topup"])(
  "distinguishes finance approval from credit for %s",
  (operation) => {
    const result = {
      name: "Team budget",
      fundingPending: true,
      fundingApprovalStatus: "pending",
      requestedAmount: 125000.5,
      currency: "INR",
      balance: 10000,
      status: "active",
    };
    render(
      <CopilotWriteSuccess
        artifact={{ kind: "success", operation, message: "Confirmed wallets topup", result }}
      />,
    );
    expect(screen.getByText(/Finance approval is pending/)).toBeInTheDocument();
    expect(screen.getByText("₹1,25,000.50")).toBeInTheDocument();
    expect(screen.getByText("₹10,000")).toBeInTheDocument();
    expect(screen.queryByText("Funds credited")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "pending");
    expect(result.balance).toBe(10000);
  },
);
it.each([
  {},
  { fundingApprovalStatus: "approved", balance: 1000, currency: "INR" },
  { status: "succeeded" },
])("never invents credit from an ambiguous result %j", (result) => {
  const p = completedPresentation("wallets.topup", result);
  expect(p.title).not.toBe("Funds credited");
  expect(p.message).toMatch(/not confirmed/);
});
it("distinguishes credited, payment-required and failed results using explicit backend states", () => {
  expect(completedPresentation("wallets.topup", { status: "credited" }).title).toBe(
    "Funds credited",
  );
  expect(completedPresentation("wallets.setup", { nextStep: "payment_required" }).message).toMatch(
    /Payment is required/,
  );
  expect(completedPresentation("wallets.topup", { status: "failed" }).tone).toBe("failure");
  expect(completedPresentation("employees.create", { status: "pending" }).tone).toBe(
    "pending",
  );
});
it("formats amounts without converting missing currency or invalid numbers into zero INR", () => {
  expect(amountLabel(1234567.89, "INR")).toBe("₹12,34,567.89");
  expect(amountLabel(0, "INR")).toBe("₹0");
  expect(amountLabel(-1000, "INR")).toBe("₹-1,000");
  expect(amountLabel(undefined, "INR")).toBe("Unavailable");
  expect(amountLabel(NaN, "INR")).toBe("Unavailable");
  expect(amountLabel(1000, undefined)).toBe("1,000 (currency unavailable)");
});
it("shows department budgets and before/after values without raw nested JSON or transport identifiers", () => {
  const rows = previewRows({
    currency: "INR",
    walletId: "internal-id",
    documentTicketId: "secret-ticket",
    before: { unallocatedAmount: 200000 },
    after: { unallocatedAmount: 199000 },
    departments: [{ name: "Marketing", managerName: "aisha", budget: 1000 }],
  });
  expect(rows).toContainEqual({ label: "Before · Unallocated balance", value: "₹2,00,000" });
  expect(rows).toContainEqual({ label: "Departments 1 · Budget", value: "₹1,000" });
  expect(JSON.stringify(rows)).not.toMatch(/internal-id|secret-ticket/);
});
it("renders readable semantic Markdown with keyboard-accessible tables and sanitized links", () => {
  const { container } = render(
    <CopilotMarkdown
      content={
        "## Budget summary\n\nFirst **paragraph** with `INR`.\n\nNext paragraph.\n\n1. Review\n2. Confirm\n\n- One\n- Two\n\n> Keep the receipt.\n\n| Team | Budget |\n| --- | --- |\n| Marketing | ₹1,000 |\n\n```text\nhello\n```\n\n[Unsafe](javascript:alert(1))"
      }
    />,
  );
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Budget summary");
  expect(container.querySelector("ol")).toBeInTheDocument();
  expect(container.querySelector("ul")).toBeInTheDocument();
  expect(container.querySelector("strong")).toHaveTextContent("paragraph");
  expect(container.querySelector("pre code")).toHaveTextContent("hello");
  expect(screen.getByRole("region", { name: "Response table" })).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(container.innerHTML).not.toContain('href="javascript:');
});
it("shows friendly persisted attachments without mutating AI/backend context", () => {
  const content =
    'Please use this PO\n\n[Attachments]\n- Purchase order "Marketing PO.pdf" (documentTicketId=private-ticket). Uploaded only.';
  const files = [
    {
      id: "private-attachment",
      kind: "purchase_order" as const,
      ticketId: "private-ticket",
      originalName: "Marketing PO.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    },
  ];
  const { container } = render(<CopilotUserMessage content={content} attachments={files} />);
  expect(screen.queryByText("Marketing PO.pdf")).not.toBeInTheDocument();
  expect(screen.getByText("Purchase order")).toBeInTheDocument();
  expect(container.textContent).toContain("Please use this PO");
  expect(container.innerHTML).not.toMatch(
    /private-ticket|private-attachment|documentTicketId|\[Attachments\]/,
  );
  expect(content).toContain("documentTicketId=private-ticket");
  expect(files[0].ticketId).toBe("private-ticket");
});
it("shows a filename-free attachment without a text bubble for an attachment-only message", () => {
  const files = [{ id: "image", kind: "file" as const, originalName: "photo.png", mimeType: "image/png", sizeBytes: 500 }];
  const { container } = render(<CopilotUserMessage content="Attached 1 file(s)" attachments={files} />);
  expect(screen.getByText("Image attachment")).toBeVisible();
  expect(screen.queryByText(/photo\.png|Attached 1 file/)).not.toBeInTheDocument();
  expect(container.querySelector(".sm-copilot-user-text")).toBeNull();
});
it("preserves a user's literal Attachments text when no generated metadata exists", () => {
  const content = "Notes\n\n[Attachments]\nmy own text";
  const { container } = render(<CopilotUserMessage content={content} />);
  expect(container.textContent).toBe(content);
});

it("preserves user-written attachment sections before the generated suffix", () => {
  const ownText = "Notes\n\n[Attachments]\nMy own notes";
  const files = [{ id: "file", kind: "file" as const, originalName: "Brief.pdf", mimeType: "application/pdf", sizeBytes: 0 }];
  const { container, rerender } = render(<CopilotUserMessage content={ownText} attachments={files} />);
  expect(container.textContent).toContain(ownText);
  rerender(<CopilotUserMessage content={`${ownText}\n\n[Attachments]\n- File "Brief.pdf" (application/pdf). Reference only.`} attachments={files} />);
  expect(container.textContent).toContain(ownText);
  expect(container.textContent).not.toContain("Reference only.");
  expect(screen.getByText("Attachment")).toBeInTheDocument();
});
