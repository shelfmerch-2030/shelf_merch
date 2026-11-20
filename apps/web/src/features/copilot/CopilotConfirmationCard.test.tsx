// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotConfirmationCard } from "./CopilotConfirmationCard";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    executeCopilotWriteApi: vi.fn(),
    cancelCopilotWriteApi: vi.fn(),
    resolveCopilotWriteApi: vi.fn(),
    persistCopilotWriteArtifactApi: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseArtifact = {
  kind: "confirmation" as const,
  operation: "shops.update",
  confirmationId: "confirm-update-abcdefghijklmnopqrstuv",
  preview: { shopId: "507f1f77bcf86cd799439011", changes: [{ field: "name", from: "Old", to: "New" }] },
  request: { shopId: "507f1f77bcf86cd799439011", name: "New" },
  status: "pending" as const,
};

const departmentArtifact = {
  ...baseArtifact,
  operation: "entities.setup",
  preview: {
    currency: "INR", totalAllocation: 50_000, before: { balance: 100_000 }, after: { unallocatedAmount: 50_000 },
    departments: [
      { name: "Marketing", action: "create", budget: 30_000, managerName: "Rahul Sharma", managerTitle: "Marketing Manager", invitation: "new_invitation", sendInvite: true },
      { name: "Sales", action: "create", budget: 20_000, managerName: "Priya Verma", managerTitle: "Sales Manager", invitation: "new_invitation", sendInvite: true },
    ],
    notices: [{ kind: "warning", detail: "Funding must be approved before allocation." }],
  },
  request: {
    walletId: "507f1f77bcf86cd799439011", departments: [
      { name: "Sales", manager: { email: "priya@example.com", sendInvite: true } },
      { name: "Marketing", manager: { email: "rahul@example.com", sendInvite: true } },
    ],
  },
};

describe("Department Setup confirmation presentation", () => {
  it("renders the saved preview compactly and keeps the exact prepared request for Confirm", async () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ confirmationId: departmentArtifact.confirmationId, status: "pending" });
    vi.mocked(api.executeCopilotWriteApi).mockResolvedValue({ departments: [] });
    render(<CopilotConfirmationCard artifact={JSON.parse(JSON.stringify(departmentArtifact))} onChange={vi.fn()} />);
    expect(screen.getByText("Create 2 departments")).toBeInTheDocument();
    expect(screen.getByText("Total allocation")).toBeInTheDocument();
    expect(screen.getByText("Remaining unallocated")).toBeInTheDocument();
    expect(screen.getAllByText("₹50,000")).toHaveLength(2);
    expect(screen.getByText("Marketing — ₹30,000")).toBeInTheDocument();
    expect(screen.getByText("Sales — ₹20,000")).toBeInTheDocument();
    expect(screen.getByText("Rahul Sharma · Marketing Manager")).toBeInTheDocument();
    expect(screen.getByText("Priya Verma · Sales Manager")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "rahul@example.com" })).toHaveAttribute("href", "mailto:rahul@example.com");
    expect(screen.getByRole("link", { name: "priya@example.com" })).toHaveAttribute("href", "mailto:priya@example.com");
    expect(screen.getByText(/Enabled for both managers/)).toBeInTheDocument();
    expect(screen.getByText("Funding must be approved before allocation.")).toBeInTheDocument();
    expect(screen.queryByText(/new_invitation|Before - Balance|Departments 1|Notices 1/)).toBeNull();
    await waitFor(() => expect(api.resolveCopilotWriteApi).toHaveBeenCalledTimes(1));
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.executeCopilotWriteApi).toHaveBeenCalledWith("entities.setup", {
      ...departmentArtifact.request, confirmationId: departmentArtifact.confirmationId, idempotencyKey: expect.any(String),
    }));
  });

  it("explains mixed invitation outcomes and uses the same Cancel handler", async () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ confirmationId: departmentArtifact.confirmationId, status: "pending" });
    vi.mocked(api.cancelCopilotWriteApi).mockResolvedValue({ confirmationId: departmentArtifact.confirmationId, status: "cancelled" });
    const [first, second] = departmentArtifact.preview.departments;
    const artifact = { ...departmentArtifact, preview: { ...departmentArtifact.preview, departments: [first, { ...second, invitation: "link_existing" }] } };
    render(<CopilotConfirmationCard artifact={artifact} onChange={vi.fn()} />);
    expect(screen.getByText(/New manager invitation · Email will be sent/)).toBeInTheDocument();
    expect(screen.getByText(/Existing manager account will be linked · No invitation email/)).toBeInTheDocument();
    expect(screen.queryByText(/Enabled for both managers/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(api.cancelCopilotWriteApi).toHaveBeenCalledWith("entities.setup", departmentArtifact.confirmationId));
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  });

  it("shows a disabled invitation and missing details without guessing", () => {
    const artifact = { ...departmentArtifact, request: undefined, preview: { fundingPending: true, departments: [
      { name: "Support", sendInvite: false, invitation: "assign_without_invite" },
      { name: "Operations" },
    ] } };
    render(<CopilotConfirmationCard artifact={artifact} onChange={vi.fn()} />);
    expect(screen.getByText(/Manager will be assigned without email/)).toBeInTheDocument();
    expect(screen.getByText(/Invitation setting unavailable/)).toBeInTheDocument();
    expect(screen.getAllByText("Work email unavailable")).toHaveLength(2);
    expect(screen.getByText("Current unallocated")).toBeInTheDocument();
    expect(screen.getByText("Allocations will be applied after wallet funding is approved.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("CopilotConfirmationCard store update recovery", () => {
  it("shows success for a successful update execute and persists the outcome", async () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({
      status: "pending",
      confirmationId: baseArtifact.confirmationId,
    });
    vi.mocked(api.executeCopilotWriteApi).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      name: "New",
      status: "draft",
    });
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: baseArtifact.confirmationId,
    });
    const onChange = vi.fn();
    render(
      <CopilotConfirmationCard
        artifact={baseArtifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "success", operation: "shops.update", confirmationId: baseArtifact.confirmationId, status: "completed" }),
      ),
    );
    expect(api.persistCopilotWriteArtifactApi).toHaveBeenCalled();
  });

  it("keeps genuine validation failures as failed without inventing success", async () => {
    vi.mocked(api.resolveCopilotWriteApi)
      .mockResolvedValueOnce({
        status: "pending",
        confirmationId: baseArtifact.confirmationId,
      })
      .mockResolvedValueOnce({
        status: "pending",
        confirmationId: baseArtifact.confirmationId,
      });
    vi.mocked(api.executeCopilotWriteApi).mockRejectedValue(new Error("Store details are not valid"));
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: baseArtifact.confirmationId,
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <CopilotConfirmationCard
        artifact={baseArtifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Store details are not valid");
    rerender(
      <CopilotConfirmationCard
        artifact={{ ...baseArtifact, status: "failed" }}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: /Confirm/i })).not.toBeInTheDocument();
  });

  it("recovers success after a network interruption when backend already completed", async () => {
    vi.mocked(api.resolveCopilotWriteApi)
      .mockResolvedValueOnce({
        status: "pending",
        confirmationId: baseArtifact.confirmationId,
      })
      .mockResolvedValueOnce({
        status: "completed",
        confirmationId: baseArtifact.confirmationId,
        result: { id: "507f1f77bcf86cd799439011", name: "New", status: "draft" },
      });
    vi.mocked(api.executeCopilotWriteApi).mockRejectedValue(new Error("Network error"));
    vi.mocked(api.persistCopilotWriteArtifactApi).mockResolvedValue({
      ok: true,
      conversationId: "507f1f77bcf86cd799439099",
      confirmationId: baseArtifact.confirmationId,
    });
    const onChange = vi.fn();
    render(
      <CopilotConfirmationCard
        artifact={baseArtifact}
        conversationId="507f1f77bcf86cd799439099"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "success", operation: "shops.update" }),
      ),
    );
    expect(api.executeCopilotWriteApi).toHaveBeenCalledOnce();
  });
});

const allocationArtifact = {
  ...baseArtifact,
  operation: "budget.allocate",
  preview: {
    walletName: "Company INR budget", currency: "INR", netChange: 1000,
    before: { unallocatedAmount: 10000 }, after: { unallocatedAmount: 9000 },
    departments: [{ name: "Marketing", amount: 1000, beforeAllocated: 2000, afterAllocated: 3000, beforeUnspent: 1500, afterUnspent: 2500 }],
  },
  request: { name: "Untrusted request name", walletId: "wallet-id", amount: 999999, allocations: [{ entityId: "marketing-id", amount: 1000 }] },
};

describe("Copilot allocation confirmations", () => {
  it("shows the trusted department, INR amount, named funding source and before/after figures", () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: "pending", confirmationId: allocationArtifact.confirmationId });
    render(<CopilotConfirmationCard artifact={allocationArtifact} onChange={vi.fn()} />);
    expect(screen.getByRole("group")).toHaveAccessibleName("Confirm Allocate department budget");
    for (const text of ["Company INR budget", "Marketing", "INR", "₹10,000 → ₹9,000", "₹2,000 → ₹3,000", "₹1,500 → ₹2,500"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText("Untrusted request name")).not.toBeInTheDocument();
    expect(screen.queryByText("999999")).not.toBeInTheDocument();
  });

  it("uses budget.allocate for resolve and cancel and persists cancellation across reload", async () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: "pending", confirmationId: allocationArtifact.confirmationId });
    vi.mocked(api.cancelCopilotWriteApi).mockResolvedValue({ status: "cancelled", confirmationId: allocationArtifact.confirmationId });
    const onChange = vi.fn();
    const { rerender } = render(<CopilotConfirmationCard artifact={allocationArtifact} conversationId="conversation" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled", operation: "budget.allocate" })));
    expect(api.cancelCopilotWriteApi).toHaveBeenCalledWith("budget.allocate", allocationArtifact.confirmationId);
    expect(api.resolveCopilotWriteApi).toHaveBeenCalledWith("budget.allocate", expect.objectContaining({ confirmationId: allocationArtifact.confirmationId }));
    expect(api.persistCopilotWriteArtifactApi).toHaveBeenCalledWith("conversation", expect.objectContaining({ artifact: expect.objectContaining({ operation: "budget.allocate", status: "cancelled" }) }));
    rerender(<CopilotConfirmationCard artifact={{ ...allocationArtifact, status: "cancelled" }} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  });

  it("sends duplicate confirm clicks once to the registered workflow", async () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: "pending", confirmationId: allocationArtifact.confirmationId });
    let finish!: (value: Record<string, unknown>) => void;
    vi.mocked(api.executeCopilotWriteApi).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onChange = vi.fn();
    render(<CopilotConfirmationCard artifact={allocationArtifact} onChange={onChange} />);
    const button = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.executeCopilotWriteApi).toHaveBeenCalledOnce();
    expect(api.executeCopilotWriteApi).toHaveBeenCalledWith("budget.allocate", expect.objectContaining({ confirmationId: allocationArtifact.confirmationId, idempotencyKey: expect.any(String) }));
    finish({ netChange: 1000 });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "success", operation: "budget.allocate" })));
  });

  it("recovers completed allocation after reload without executing", async () => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status: "completed", confirmationId: allocationArtifact.confirmationId, result: { netChange: 1000 } });
    const onChange = vi.fn();
    render(<CopilotConfirmationCard artifact={allocationArtifact} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "success", operation: "budget.allocate" })));
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  });

  it("renders an invalid legacy artifact as disabled and requests a fresh preview", () => {
    render(<CopilotConfirmationCard artifact={{ ...allocationArtifact, operation: "wallets.allocate", status: "failed", message: "This preview uses an unsupported workflow. Ask Copilot to prepare the change again." }} onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("prepare the change again");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
    expect(api.resolveCopilotWriteApi).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", "This confirmation expired. Ask Copilot to prepare it again."],
    ["consumed", "This confirmation was consumed, but completion is not verified. Check status before preparing again."],
    ["failed", "Execution failed. Check the operation status before preparing again."],
  ] as const)("disables %s confirmations returned by read-only recovery", async (status, message) => {
    vi.mocked(api.resolveCopilotWriteApi).mockResolvedValue({ status, confirmationId: allocationArtifact.confirmationId });
    const onChange = vi.fn();
    render(<CopilotConfirmationCard artifact={allocationArtifact} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", message })));
    expect(api.executeCopilotWriteApi).not.toHaveBeenCalled();
  });
});
