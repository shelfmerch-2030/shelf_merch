// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CopilotConfirmationCard, CopilotWriteSuccess } from "./CopilotConfirmationCard";
import { CopilotArtifacts } from "./CopilotProductCards";
import type { CopilotSuccessArtifact } from "./api";
import * as api from "./api";

vi.mock("./api", async original => ({ ...await original<typeof import("./api")>(),
  executeCopilotWriteApi: vi.fn(), persistCopilotWriteArtifactApi: vi.fn(),
  resolveCopilotWriteApi: vi.fn().mockResolvedValue({ status: "failed" }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const result = {
  combined: true, outcome: "completed", status: "redemption_open", currency: "INR", currencyMode: "points",
  recipientCount: 1, creditsPerRecipient: 500, walletDebited: true, debitedAmountInr: 500,
  fundingName: "Merchandise Toast", invitationStatus: "acknowledged", invitationsAcknowledged: 1,
};
const success: CopilotSuccessArtifact = {
  kind: "success", operation: "campaigns.send_points", confirmationId: "send-123", message: "Recorded", result,
};
function renderOutcome(changes: Record<string, unknown> = {}) {
  render(<CopilotWriteSuccess artifact={{ ...success, result: { ...result, ...changes } }} />);
  return screen.getByLabelText("Send Points outcome");
}

it("shows the verified single-recipient amount and debit above the detailed result card", () => {
  const message = renderOutcome();
  expect(message).toHaveTextContent("✅ Your send of 1,000 Points for 1 recipient is complete!");
  expect(message).toHaveTextContent("₹500 was deducted from Merchandise Toast.");
  expect(message).toHaveTextContent("The invitation submission was acknowledged. Mailbox delivery is not guaranteed.");
  const card = screen.getByRole("status");
  expect(message.nextElementSibling).toBe(card);
  expect(card).toHaveTextContent("Recorded wallet debit");
  expect(card).toHaveTextContent("Invitation submissions acknowledged");
});

it("clearly distinguishes per-recipient units from the total debit for multiple recipients", () => {
  const message = renderOutcome({ recipientCount: 3, debitedAmountInr: 1500, invitationsAcknowledged: 3 });
  expect(message).toHaveTextContent("1,000 Points each for 3 recipients");
  expect(message).toHaveTextContent("₹1,500 was deducted");
  expect(message).toHaveTextContent("Invitation submissions were acknowledged");
});

it("uses the existing Credits conversion for INR-mode stores", () => {
  expect(renderOutcome({ currencyMode: "inr" })).toHaveTextContent("500 Credits for 1 recipient");
});

it("describes the recorded schedule without claiming invitations were submitted", () => {
  const message = renderOutcome({ invitationStatus: "scheduled", deliveryMode: "scheduled",
    sendAt: "2026-11-20T10:00:00.000Z", timezone: "Asia/Kolkata", invitationsAcknowledged: 0 });
  expect(message).toHaveTextContent("Your send of 1,000 Points for 1 recipient is scheduled.");
  expect(message).toHaveTextContent("2026-11-20T10:00:00.000Z (Asia/Kolkata)");
  expect(message).not.toHaveTextContent(/complete|acknowledged|✅/);
});

it("describes self-share without implying an email was sent", () => {
  const message = renderOutcome({ invitationStatus: "self_share", deliveryMode: "self" });
  expect(message).toHaveTextContent("is ready to share. No invitation emails were requested.");
  expect(message).not.toHaveTextContent(/acknowledged|sent successfully/);
});

it.each([
  { invitationStatus: "unresolved" },
  { invitationStatus: "acknowledged", invitationsUnresolved: true },
])("keeps uncertainty explicit and never suggests automatic resend: %j", changes => {
  const message = renderOutcome(changes);
  expect(message).toHaveTextContent("invitation submission is unresolved");
  expect(message).toHaveTextContent("will not be automatically resent");
  expect(message).not.toHaveTextContent(/is complete|acknowledged|✅/);
});

it.each(["pending", "unknown", undefined])("does not turn %s submission status into success", invitationStatus => {
  const message = renderOutcome({ invitationStatus });
  expect(message).toHaveTextContent(invitationStatus === "pending" ? "Invitation submission is pending" : "Invitation submission has not been verified");
  expect(message).not.toHaveTextContent(/is complete|acknowledged|✅/);
});

it.each(["partial", "recovery_required"])("keeps %s outcomes distinct from completed sends", outcome => {
  const message = renderOutcome({ outcome, walletDebited: false });
  expect(message).toHaveTextContent("needs review before completion");
  expect(message).not.toHaveTextContent(/is complete|acknowledged|deducted|✅/);
});

it("honors review-required delivery even when the launch is completed", () => {
  expect(renderOutcome({ invitationStatus: "requires_review" })).toHaveTextContent("needs review before completion");
});

it("does not describe an in-progress operation as complete even with an acknowledged status", () => {
  const message = renderOutcome({ outcome: "in_progress", walletDebited: false });
  expect(message).toHaveTextContent("still being processed");
  expect(message).not.toHaveTextContent(/is complete|acknowledged|deducted|✅/);
});

it.each([false, undefined])("does not infer a debit from planned amounts when walletDebited is %s", walletDebited => {
  expect(renderOutcome({ walletDebited, totalBudget: 500 })).not.toHaveTextContent("deducted");
});

it("does not invent missing amounts or recipients from request, preview or artifact text", () => {
  render(<CopilotWriteSuccess artifact={{ ...success, message: "Sent to Stale Person, ₹9,999 deducted",
    result: { outcome: "completed", invitationStatus: "acknowledged", walletDebited: true },
    ...{ preview: { recipientCount: 99, creditsPerRecipient: 9999, fundingName: "Stale wallet" },
      request: { name: "Stale Person" } },
  }} />);
  const message = screen.getByLabelText("Send Points outcome");
  expect(message).toHaveTextContent("Your Points launch was recorded");
  expect(message).not.toHaveTextContent(/Stale|9,999|99 recipients|deducted/);
});

it("renders partial progress from backend facts rather than the confirmation preview", () => {
  render(<CopilotConfirmationCard artifact={{ kind: "confirmation", operation: success.operation,
    confirmationId: "partial-123", status: "failed", preview: { ...result, fundingName: "Stale wallet" },
    progress: { ...result, outcome: "recovery_required", invitationStatus: "requires_review" },
  }} onChange={vi.fn()} />);
  const message = screen.getByLabelText("Send Points outcome");
  expect(message).toHaveTextContent("needs review before completion");
  expect(message).toHaveTextContent("₹500 was deducted from Merchandise Toast");
  expect(message).not.toHaveTextContent("Stale wallet");
  expect(screen.getByLabelText("Recorded send progress")).toBeInTheDocument();
});

it("shows the message once across rerenders and persisted conversation reload without writes", () => {
  const persisted = JSON.parse(JSON.stringify([success]));
  const view = render(<CopilotArtifacts artifacts={persisted} />);
  view.rerender(<CopilotArtifacts artifacts={JSON.parse(JSON.stringify(persisted))} />);
  expect(screen.getAllByLabelText("Send Points outcome")).toHaveLength(1);
  view.unmount();
  render(<CopilotArtifacts artifacts={JSON.parse(JSON.stringify(persisted))} />);
  expect(screen.getAllByLabelText("Send Points outcome")).toHaveLength(1);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  expect(api.persistCopilotWriteArtifactApi).not.toHaveBeenCalled();
  expect(api.resolveCopilotWriteApi).not.toHaveBeenCalled();
});

it("does not add the combined-send message to existing staged workflow results", () => {
  render(<CopilotWriteSuccess artifact={{ ...success, operation: "campaigns.launch" }} />);
  expect(screen.queryByLabelText("Send Points outcome")).not.toBeInTheDocument();
});
