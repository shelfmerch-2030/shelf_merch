// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CopilotConfirmationCard, CopilotWriteSuccess } from "./CopilotConfirmationCard";
import { completedPresentation, sendPointsRows } from "./actionPresentation";
import { defaultPointsScope, inrToPoints, inrToCredits } from "@/lib/storeCurrency";
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
const preview = {
  currency: "INR",
  currencyMode: "points",
  pointsScope: "shop",
  campaignName: "Welcome rewards",
  shopName: "Team store",
  fundingSource: "organization_unallocated",
  fundingName: "Operating wallet",
  recipientCount: 2,
  creditsPerRecipient: 250,
  totalBudget: 500,
  deliveryMode: "now",
  invitations: 2,
  walletImpact: {
    debitedNow: 500,
    balanceBefore: 10000,
    balanceAfter: 9500,
    unallocatedBefore: 8000,
    unallocatedAfter: 7500,
  },
};
const artifact: CopilotConfirmationArtifact = {
  kind: "confirmation",
  operation: "campaigns.launch",
  confirmationId: "fixture-confirm-points-1234567890",
  status: "pending",
  preview,
  request: {
    name: "Untrusted request",
    creditsPerRecipient: 999999,
    totalBudget: 999999,
    fundingName: "Wrong wallet",
  },
};

it.each([
  [1, "points"],
  [3, "points"],
  [1, "inr"],
  [3, "inr"],
])("renders verified quantities for %s recipients in %s stores", (count, currencyMode) => {
  render(
    <CopilotConfirmationCard
      artifact={{
        ...artifact,
        preview: { ...preview, currencyMode, recipientCount: count, totalBudget: count * 250 },
      }}
      onChange={vi.fn()}
    />,
  );
  expect(
    screen.getByText(
      `${currencyMode === "points" ? inrToPoints(250) + " Points" : inrToCredits(250) + " Credits"} · ₹250`,
    ),
  ).toBeInTheDocument();
  const rows = sendPointsRows({
    ...preview,
    currencyMode,
    recipientCount: count,
    totalBudget: count * 250,
  });
  expect(rows).toContainEqual({ label: "Recipients", value: String(count) });
  expect(rows).toContainEqual({ label: "Total cost (INR)", value: count === 1 ? "₹250" : "₹750" });
  for (const text of ["Untrusted request", "Wrong wallet", "999999"])
    expect(screen.queryByText(text)).not.toBeInTheDocument();
});
it.each(["campaigns.points_draft", "campaigns.allocate_credits", "campaigns.launch"])(
  "keeps explicit confirmation and financial details for %s",
  (operation) => {
    render(<CopilotConfirmationCard artifact={{ ...artifact, operation }} onChange={vi.fn()} />);
    for (const text of [
      "Welcome rewards",
      "Operating wallet",
      "Organization wallet (unallocated funds)",
      "Selected store",
      "₹10,000 → ₹9,500",
      "₹8,000 → ₹7,500",
    ])
      expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  },
);
it("shows no debit for draft/credit previews while retaining the required launch budget", () => {
  const rows = sendPointsRows({
    ...preview,
    walletImpact: { debitedNow: 0, requiredAtLaunch: 500, balance: 10000, unallocatedAmount: 8000 },
  });
  expect(rows).toContainEqual({ label: "Debit if confirmed", value: "₹0" });
  expect(rows).toContainEqual({ label: "Required at launch", value: "₹500" });
});
it("labels department funding and displays only the backend-masked impact", () => {
  const rows = sendPointsRows({
    ...preview,
    pointsScope: "stadium",
    fundingSource: "department_budget",
    fundingName: "Marketing",
    walletImpact: {
      debitedNow: 500,
      balanceBefore: 2000,
      balanceAfter: 1500,
      unallocatedBefore: 2000,
      unallocatedAfter: 1500,
    },
  });
  expect(rows).toContainEqual({ label: "Funding source", value: "Department budget" });
  expect(rows).toContainEqual({ label: "Funding account", value: "Marketing" });
  expect(rows).toContainEqual({
    label: "Department remaining before → after",
    value: "₹2,000 → ₹1,500",
  });
  expect(rows).toContainEqual({ label: "Redemption scope", value: "Tenant-wide" });
  expect(
    rows.some(
      (row) => row.label.startsWith("Wallet balance") || row.label.startsWith("Unallocated"),
    ),
  ).toBe(false);
});
it("does not infer units, totals, scope, funding name or a debit from incomplete old results", () => {
  const rows = sendPointsRows(
    { recipientCount: 1, creditsPerRecipient: 250, walletDebited: false },
    true,
  );
  for (const label of ["Funding source", "Funding account", "Redemption scope", "Conversion"])
    expect(rows).toContainEqual({ label, value: "Unavailable" });
  expect(rows).toContainEqual({ label: "Per recipient", value: "Units unavailable · Unavailable" });
  expect(rows).toContainEqual({ label: "Recorded wallet debit", value: "Not verified" });
  expect(rows.some((row) => row.label === "Total cost (INR)")).toBe(false);
});
it("does not call a legacy masked amount organization cash when scope metadata is missing", () => {
  const rows = sendPointsRows({ currency: "INR", balance: 1200, unallocatedAmount: 1200 }, true);
  expect(rows).toContainEqual({ label: "Available funding (scope unavailable)", value: "₹1,200" });
  expect(rows.some((row) => row.label === "Unallocated funds")).toBe(false);
});
it("uses the shared store setting default independently of display currency", () => {
  expect(defaultPointsScope({ pointsConversionEnabled: true })).toBe("stadium");
  expect(defaultPointsScope({ pointsConversionEnabled: false })).toBe("shop");
  expect(defaultPointsScope()).toBe("shop");
});
it.each(["campaigns.points_draft", "campaigns.allocate_credits"])(
  "does not describe %s as sent or debited",
  (operation) => {
    const p = completedPresentation(operation, { ...preview, status: "approved" });
    expect(p.message).toContain("does not debit");
    expect(p.title).not.toMatch(/sent|launched/i);
  },
);
it("distinguishes scheduled launch, actual debit and deferred invitations", () => {
  const source = {
    ...preview,
    status: "launched",
    deliveryMode: "scheduled",
    sendAt: "2027-01-01T04:30:00.000Z",
    timezone: "Asia/Kolkata",
    walletDebited: true,
    debitedAmountInr: 500,
    invitationsSent: 0,
    invitationsUnresolved: false,
  };
  render(
    <CopilotWriteSuccess
      artifact={{
        kind: "success",
        operation: "campaigns.launch",
        message: "Points sent",
        result: source,
      }}
    />,
  );
  expect(screen.getByText("Campaign scheduled")).toBeInTheDocument();
  expect(screen.getByText(/Recipient delivery waits/)).toBeInTheDocument();
  expect(screen.getByText(source.sendAt)).toBeInTheDocument();
  expect(screen.getByText("Asia/Kolkata")).toBeInTheDocument();
  expect(screen.queryByText("Points sent")).not.toBeInTheDocument();
  expect(sendPointsRows(source, true)).toContainEqual({
    label: "Recorded wallet debit",
    value: "₹500",
  });
  expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
});
it.each([
  { invitationsSent: 0, invitationsUnresolved: true },
  { invitationsSent: 1, invitationsUnresolved: false },
])("flags unresolved or partial immediate invitation results: %j", (partial) => {
  const result = { ...preview, status: "redemption_open", ...partial };
  const p = completedPresentation("campaigns.launch", result);
  expect(p.tone).toBe("pending");
  expect(p.message).toContain("before retrying");
  render(
    <CopilotWriteSuccess
      artifact={{ kind: "success", operation: "campaigns.launch", message: "All sent", result }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  expect(screen.queryByText("All sent")).not.toBeInTheDocument();
});
it("keeps self-share separate from immediate email delivery and failed launch separate from completion", () => {
  expect(
    completedPresentation("campaigns.launch", {
      ...preview,
      status: "redemption_open",
      deliveryMode: "self",
      invitationsSent: 0,
    }).message,
  ).toContain("No invitation emails");
  expect(completedPresentation("campaigns.launch", { ...preview, status: "failed" }).tone).toBe(
    "failure",
  );
  expect(completedPresentation("campaigns.launch", { ...preview, status: "consumed" }).title).toBe(
    "Completion unverified",
  );
});
it.each(["cancelled", "failed", "expired", "unverified", "completed"] as const)(
  "does not restore Confirm on %s Send Points cards",
  (status) => {
    render(<CopilotConfirmationCard artifact={{ ...artifact, status }} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  },
);
