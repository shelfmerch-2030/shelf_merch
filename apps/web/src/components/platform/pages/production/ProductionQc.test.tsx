// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router";
import { TaskManageModal } from "./views/TaskManageModal";
import { recordTaskQc, setTaskStatus, uploadTaskQcPhoto, requestDelhiveryShipment } from "./model";
import { QC_CHECKS } from "@/services/production-qc";

vi.mock("./model", () => ({
  recordTaskQc: vi.fn(),
  setTaskStatus: vi.fn(),
  uploadTaskQcPhoto: vi.fn(),
  requestDelhiveryShipment: vi.fn(),
}));
const row = {
  _id: "task123",
  orderId: "order123",
  orderNumber: "SM-123",
  status: "qc_pending",
  orderStatus: "qc_pending",
  expectedQuantity: 2,
  qcStatus: "pending",
  qcInspections: [],
  qcPhotos: [],
  validNextStatuses: ["issue"],
};
const mount = (data: Record<string, unknown> = row, readOnly = false) =>
  render(
    <MemoryRouter>
      <TaskManageModal row={data} onClose={vi.fn()} onChanged={vi.fn()} readOnly={readOnly} />
    </MemoryRouter>,
  );
async function photo() {
  fireEvent.change(screen.getByLabelText("QC photos (at least one required)"), {
    target: { files: [new File(["photo"], "qc.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(screen.getByText("QC photo saved.")).toBeVisible());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(uploadTaskQcPhoto).mockResolvedValue({ url: "/uploads/qc/test.png" });
});
afterEach(cleanup);

describe("production QC workflow", () => {
  it.each([
    "created",
    "material_pending",
    "mockup_pending",
    "mockup_approved",
    "in_production",
    "printing",
    "embroidery",
    "issue",
  ])(
    "keeps the %s popup focused on production without premature QC or shipment controls",
    (status) => {
      mount({
        ...row,
        status,
        orderStatus: "in_production",
        qcStatus: "not_started",
        validNextStatuses: ["mockup_pending", "issue"],
      });
      expect(screen.getByLabelText("Advance status")).toHaveValue(status);
      expect(screen.queryByLabelText("Units inspected")).not.toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: "Pass" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("QC photos (at least one required)")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Request Delhivery shipment" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Inspection history/)).not.toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveStyle({ maxWidth: "460px" });
    },
  );

  it("reveals physical QC only after the server saves the inspection stage", async () => {
    mount({
      ...row,
      status: "printing",
      orderStatus: "in_production",
      validNextStatuses: ["qc_pending", "issue"],
    });
    fireEvent.change(screen.getByLabelText("Advance status"), { target: { value: "qc_pending" } });
    expect(screen.queryByLabelText("Units inspected")).not.toBeInTheDocument();
    screen.getByLabelText("Status note (optional)").focus();
    fireEvent.change(screen.getByLabelText("Status note (optional)"), {
      target: { value: "Printing finished" },
    });
    expect(screen.getByLabelText("Status note (optional)")).toHaveFocus();
    vi.mocked(setTaskStatus).mockResolvedValue(row);
    fireEvent.click(screen.getByRole("button", { name: "Send for physical QC" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Physical quality check" })).toBeVisible(),
    );
    expect(setTaskStatus).toHaveBeenCalledWith("task123", "qc_pending", "Printing finished");
    expect(screen.getByLabelText("Units inspected")).toBeEnabled();
    expect(screen.queryByLabelText("Advance status")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveStyle({ maxWidth: "1140px" });
    // The full inspection form scrolls inside the large modal rather than being clipped.
    expect(
      screen.getByRole("heading", { name: "Physical quality check" }).parentElement?.parentElement,
    ).toHaveStyle({ overflow: "auto" });
  });

  it("keeps cancelled orders and completed tasks free of editing controls", () => {
    const { unmount } = mount({ ...row, orderStatus: "cancelled" });
    expect(screen.getByText(/The order is cancelled/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Record QC" })).not.toBeInTheDocument();
    expect(screen.queryByText("Report a production issue")).not.toBeInTheDocument();
    unmount();
    mount({
      ...row,
      status: "completed",
      orderStatus: "shipped",
      qcResult: "passed",
      validNextStatuses: [],
      shipment: { awb: "AWB123" },
    });
    expect(screen.getByRole("heading", { name: "Production task completed" })).toBeVisible();
    expect(screen.getByText("AWB123")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Complete task" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Advance status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Units inspected")).not.toBeInTheDocument();
  });

  it("requires an explicit decision and complete inspection, then packs before enabling shipment", async () => {
    mount();
    expect(screen.getByRole("radio", { name: "Pass" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Fail / rework" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Record QC" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Request Delhivery shipment" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "packing" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Pass" }));
    expect(screen.getByLabelText("Units inspected")).toHaveValue(2);
    expect(screen.getByLabelText("Units failed")).toHaveValue(0);
    for (const { label } of QC_CHECKS) fireEvent.click(screen.getByLabelText(label));
    expect(screen.getByRole("button", { name: "Record QC" })).toBeDisabled();
    await photo();
    expect(screen.getByRole("button", { name: "Record QC" })).toBeEnabled();
    expect(screen.getByText("All requirements are complete. You can record QC.")).toBeVisible();
    vi.mocked(recordTaskQc).mockResolvedValue({
      ...row,
      status: "packing",
      qcResult: "passed",
      qcStatus: "passed",
      validNextStatuses: ["ready_to_ship", "issue"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Record QC" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Complete packing" })).toBeVisible(),
    );
    expect(screen.queryByLabelText("Units inspected")).not.toBeInTheDocument();
    expect(recordTaskQc).toHaveBeenCalledWith(
      "task123",
      expect.objectContaining({
        passed: true,
        inspectedQuantity: 2,
        failedQuantity: 0,
        photoUrls: ["/uploads/qc/test.png"],
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Request Delhivery shipment" }),
    ).not.toBeInTheDocument();
    vi.mocked(setTaskStatus).mockResolvedValue({
      ...row,
      status: "ready_to_ship",
      orderStatus: "packed",
      qcResult: "passed",
      qcStatus: "passed",
      validNextStatuses: ["issue"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete packing" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Request Delhivery shipment" })).toBeEnabled(),
    );
    vi.mocked(requestDelhiveryShipment).mockResolvedValue({
      _id: "shipment",
      courier: "Delhivery",
      awb: "AWB123",
      trackingUrl: "https://example.com/track",
    });
    fireEvent.click(screen.getByRole("button", { name: "Request Delhivery shipment" }));
    await waitFor(() => expect(screen.getByText("AWB123")).toBeVisible());
    expect(screen.getByRole("button", { name: "Complete task" })).toBeEnabled();
    expect(requestDelhiveryShipment).toHaveBeenCalledTimes(1);
  });

  it("requires a failure reason and failed quantity, then returns the task for rework", async () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Fail / rework" }));
    fireEvent.change(screen.getByLabelText("Units inspected"), { target: { value: "2" } });
    await photo();
    fireEvent.change(screen.getByLabelText("Failure reason (required)"), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: "Record QC" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Failure reason (required)"), {
      target: { value: " Print misaligned " },
    });
    expect(screen.getByRole("button", { name: "Record QC" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Units failed"), { target: { value: "1" } });
    vi.mocked(recordTaskQc).mockResolvedValue({
      ...row,
      status: "in_production",
      qcStatus: "rework",
      qcResult: "failed",
      validNextStatuses: ["printing", "qc_pending", "issue"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Record QC" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Advance status")).toHaveValue("in_production"),
    );
    expect(recordTaskQc).toHaveBeenCalledWith(
      "task123",
      expect.objectContaining({ passed: false, reason: "Print misaligned", failedQuantity: 1 }),
    );
    expect(screen.queryByRole("button", { name: "Record QC" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request Delhivery shipment" }),
    ).not.toBeInTheDocument();
  });

  it("keeps inspection and status controls unavailable for read-only users", () => {
    mount(row, true);
    expect(screen.getByText(/Read-only access/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Record QC" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Units inspected")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save status" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request Delhivery shipment" }),
    ).not.toBeInTheDocument();
  });

  it("explains missing requirements and restores blank counts when Pass is explicitly selected", async () => {
    mount();
    expect(screen.getByText("Choose Pass or Fail / rework.")).toBeVisible();
    expect(
      screen.getByText("Enter a whole number greater than zero for Units inspected."),
    ).toBeVisible();
    expect(screen.getByText("Upload at least one QC photo.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Units failed"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("radio", { name: "Pass" }));
    expect(screen.getByLabelText("Units inspected")).toHaveValue(2);
    expect(screen.getByLabelText("Units failed")).toHaveValue(0);
    expect(screen.getByText("Complete the inspection checklist (5 remaining).")).toBeVisible();
    for (const { label } of QC_CHECKS) fireEvent.click(screen.getByLabelText(label));
    expect(screen.queryByText(/Complete the inspection checklist/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record QC" })).toBeDisabled();
    await photo();
    expect(screen.queryByText("Before recording QC:")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record QC" })).toBeEnabled();
  });

  it("preserves manually entered quantities and explains why a partial or failed inspection cannot pass", async () => {
    mount({ ...row, qcPhotos: [{ url: "/uploads/qc/test.png" }] });
    fireEvent.change(screen.getByLabelText("Units inspected"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Units failed"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("radio", { name: "Pass" }));
    for (const { label } of QC_CHECKS) fireEvent.click(screen.getByLabelText(label));
    expect(screen.getByLabelText("Units inspected")).toHaveValue(1);
    expect(screen.getByLabelText("Units failed")).toHaveValue(1);
    expect(screen.getByText("Inspect all 2 ordered units before passing QC.")).toBeVisible();
    expect(
      screen.getByText(
        "Units failed must be 0 for a pass. Choose Fail / rework if any units failed.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Record QC" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Units inspected"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Units failed"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Record QC" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Units inspected"), { target: { value: "" } });
    expect(
      screen.getByText("Enter a whole number greater than zero for Units inspected."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Record QC" })).toBeDisabled();
    expect(recordTaskQc).not.toHaveBeenCalled();
  });
});
