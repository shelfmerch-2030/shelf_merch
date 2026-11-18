// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router";
import { OrdersPage } from "./OrdersPage";
import { OrderFulfillmentActions } from "./views/OrderFulfillmentActions";
import {
  fetchPlatformOrders,
  fetchPlatformVendors,
  setOrderStatus,
  uploadOrderMockup,
  assignOrderVendor,
  createProductionTask,
  addOrderNote,
  createOrderReplacement,
} from "@/services/platform-api";

vi.mock("@/services/platform-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/platform-api")>()),
  fetchPlatformOrders: vi.fn(),
  fetchPlatformVendors: vi.fn(),
  setOrderStatus: vi.fn(),
  uploadOrderMockup: vi.fn(),
  assignOrderVendor: vi.fn(),
  createProductionTask: vi.fn(),
  addOrderNote: vi.fn(),
  createOrderReplacement: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPlatformOrders).mockResolvedValue({
    items: [{ _id: "order1", orderNumber: "SM-1", qcStatus: "rework", status: "qc_pending" }],
    page: 1,
    limit: 100,
    total: 1,
  });
  vi.mocked(fetchPlatformVendors).mockResolvedValue([]);
  vi.mocked(setOrderStatus).mockResolvedValue({});
  vi.mocked(uploadOrderMockup).mockResolvedValue({});
  vi.mocked(assignOrderVendor).mockResolvedValue({});
  vi.mocked(createProductionTask).mockResolvedValue({ _id: "task1" });
  vi.mocked(addOrderNote).mockResolvedValue({});
  vi.mocked(createOrderReplacement).mockResolvedValue({ replacement: { _id: "replacement1" } });
});
afterEach(cleanup);

function mountActions(order: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <OrderFulfillmentActions order={{ _id: "order1", ...order }} onChanged={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("guided fulfillment actions", () => {
  it("starts with review and one direct approval action, with supporting tools collapsed", async () => {
    mountActions({
      status: "created",
      validNextStatuses: ["approved", "issue_raised", "cancelled"],
    });
    expect(screen.getByRole("heading", { name: "Review this order" })).toBeVisible();
    expect(screen.getByText("More actions").parentElement).not.toHaveAttribute("open");
    expect(screen.getByText("Add an internal note").parentElement).not.toHaveAttribute("open");
    expect(
      screen
        .getByRole("list", { name: "Fulfillment progress" })
        .querySelector('[aria-current="step"]'),
    ).toHaveTextContent("Review");
    fireEvent.click(screen.getByRole("button", { name: "Approve order" }));
    await waitFor(() =>
      expect(setOrderStatus).toHaveBeenCalledWith("order1", "approved", undefined),
    );
    expect(createProductionTask).not.toHaveBeenCalled();
  });

  it.each([
    { status: "approved", mockupUrl: "" },
    { status: "mockup_pending", mockupUrl: "" },
    { status: "mockup_pending", mockupUrl: "https://example.com/mockup.png" },
  ])("starts production directly from $status with mockup '$mockupUrl'", async (order) => {
    mountActions({ ...order, validNextStatuses: ["in_production", "cancelled"] });
    expect(screen.getByRole("heading", { name: "Start production" })).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Fulfillment progress" })
        .querySelector('[aria-current="step"]'),
    ).toHaveTextContent("Production");
    expect(screen.getByRole("list", { name: "Fulfillment progress" }))
      .not.toHaveTextContent("Mockup");
    fireEvent.click(screen.getByRole("button", { name: "Start production" }));
    await waitFor(() => expect(createProductionTask).toHaveBeenCalledWith("order1", undefined));
    expect(uploadOrderMockup).not.toHaveBeenCalled();
    expect(setOrderStatus).not.toHaveBeenCalled();
  });

  it("keeps mockup tools optional under More actions", async () => {
    mountActions({ status: "approved", validNextStatuses: ["in_production", "mockup_pending"] });
    expect(screen.getByText("More actions").parentElement).not.toHaveAttribute("open");
    expect(screen.getByText("Mockup (optional)").parentElement).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("More actions"));
    fireEvent.click(screen.getByText("Mockup (optional)"));
    expect(screen.getByRole("button", { name: "Send mockup for approval" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Mockup image URL"), {
      target: { value: " https://example.com/mockup.png " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send mockup for approval" }));
    await waitFor(() =>
      expect(uploadOrderMockup).toHaveBeenCalledWith("order1", "https://example.com/mockup.png"),
    );
    expect(setOrderStatus).not.toHaveBeenCalled();
  });

  it("saves the selected vendor before starting production and blocks duplicate submissions", async () => {
    vi.mocked(fetchPlatformVendors).mockResolvedValue([
      { _id: "vendor1", name: "Print team", type: "printing", status: "active" },
    ]);
    let finish: (value: unknown) => void = () => {};
    vi.mocked(createProductionTask).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mountActions({ status: "mockup_approved", validNextStatuses: ["in_production", "cancelled"] });
    fireEvent.click(screen.getByText("Production assignment (optional)"));
    await screen.findByRole("option", { name: "Print team" });
    fireEvent.change(screen.getByLabelText("Production vendor (optional)"), {
      target: { value: "vendor1" },
    });
    expect(screen.getByLabelText("Production assignee (optional)")).toHaveValue("Print team");
    fireEvent.click(screen.getByRole("button", { name: "Start production" }));
    fireEvent.click(screen.getByRole("button", { name: "Start production" }));
    await waitFor(() => expect(createProductionTask).toHaveBeenCalledWith("order1", "Print team"));
    expect(assignOrderVendor).toHaveBeenCalledWith("order1", "vendor1");
    expect(vi.mocked(assignOrderVendor).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createProductionTask).mock.invocationCallOrder[0],
    );
    expect(createProductionTask).toHaveBeenCalledTimes(1);
    finish({ _id: "task1" });
    await screen.findByRole("status");
  });

  it("guides packed orders to booking and only offers dispatch after an AWB exists", async () => {
    const order = {
      _id: "order1",
      status: "packed",
      validNextStatuses: ["shipped", "cancelled"],
      qcStatus: "passed",
      productionTask: { _id: "task1", status: "ready_to_ship", qcResult: "passed" },
    };
    const { rerender } = mountActions(order);
    expect(screen.getByRole("heading", { name: "Book the shipment" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark dispatched" })).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <OrderFulfillmentActions
          order={{ ...order, shipment: { awb: "AWB123", courier: "Delhivery" } }}
          onChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark dispatched" }));
    await waitFor(() =>
      expect(setOrderStatus).toHaveBeenCalledWith("order1", "shipped", undefined),
    );
  });

  it("requires packing completion even if a shipment is already attached", async () => {
    mountActions({
      status: "packed",
      validNextStatuses: ["shipped", "cancelled"],
      qcStatus: "passed",
      productionTask: { _id: "task1", status: "packing", qcResult: "passed" },
      shipment: { awb: "EARLY" },
    });
    expect(screen.getByRole("heading", { name: "Complete packing" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark dispatched" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open production task" })).toHaveAttribute(
      "href",
      "/platform/production?taskId=task1",
    );
  });

  it("keeps delivery confirmation available and shows completion without another next action", async () => {
    const task = { _id: "task1", status: "completed", qcResult: "passed" };
    const { rerender } = mountActions({
      status: "shipped",
      validNextStatuses: ["delivered", "issue_raised"],
      productionTask: task,
      shipment: { awb: "AWB123", trackingUrl: "https://example.com/track" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark delivered" }));
    await waitFor(() =>
      expect(setOrderStatus).toHaveBeenCalledWith("order1", "delivered", undefined),
    );
    rerender(
      <MemoryRouter>
        <OrderFulfillmentActions
          order={{
            _id: "order1",
            status: "delivered",
            validNextStatuses: ["issue_raised"],
            productionTask: task,
          }}
          onChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Order delivered" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark delivered" })).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("list", { name: "Fulfillment progress" })
        .querySelector('[aria-current="step"]'),
    ).toBeNull();
  });

  it("retains notes on API failure and exposes a created replacement order", async () => {
    vi.mocked(addOrderNote).mockRejectedValueOnce(new Error("Unable to save note"));
    const { unmount } = mountActions({ status: "cancelled", validNextStatuses: [] });
    fireEvent.click(screen.getByText("Add an internal note"));
    fireEvent.change(screen.getByLabelText("Internal note"), {
      target: { value: "Call recipient" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save note");
    expect(screen.getByLabelText("Internal note")).toHaveValue("Call recipient");
    unmount();
    mountActions({
      status: "issue_raised",
      validNextStatuses: ["replacement_processing", "cancelled"],
    });
    expect(screen.getByRole("button", { name: "Create replacement order" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Replacement reason"), {
      target: { value: " Print damaged " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create replacement order" }));
    await waitFor(() =>
      expect(createOrderReplacement).toHaveBeenCalledWith("order1", "Print damaged"),
    );
    expect(await screen.findByRole("link", { name: "Open replacement order" })).toHaveAttribute(
      "href",
      "/platform/orders/replacement1",
    );
  });
});

describe("orders QC visibility", () => {
  it("shows QC results and preserves the tenant filter when changing QC filters", async () => {
    render(
      <MemoryRouter initialEntries={["/platform/orders?tenantId=tenant1"]}>
        <OrdersPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Rework required", { selector: "span" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("QC status"), { target: { value: "pending" } });
    await waitFor(() =>
      expect(fetchPlatformOrders).toHaveBeenLastCalledWith({
        limit: 100,
        tenantId: "tenant1",
        qcStatus: "pending",
      }),
    );
    fireEvent.change(screen.getByLabelText("QC status"), { target: { value: "" } });
    await waitFor(() =>
      expect(fetchPlatformOrders).toHaveBeenLastCalledWith({
        limit: 100,
        tenantId: "tenant1",
        qcStatus: undefined,
      }),
    );
  });
  it("removes manual packed status and links to the exact production task", async () => {
    render(
      <MemoryRouter>
        <OrderFulfillmentActions
          order={{
            _id: "order1",
            status: "qc_pending",
            qcStatus: "passed",
            validNextStatuses: ["packed", "cancelled", "issue_raised"],
            productionTask: { _id: "task1", status: "packing", qcResult: "passed" },
          }}
          onChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchPlatformVendors).toHaveBeenCalled());
    expect(screen.queryByRole("option", { name: "packed" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open production task" })).toHaveAttribute(
      "href",
      "/platform/production?taskId=task1",
    );
  });
  it("offers dispatch only after QC and packing complete", async () => {
    const order = {
      _id: "order1",
      status: "packed",
      validNextStatuses: ["shipped", "cancelled"],
      qcStatus: "passed",
    };
    const { rerender } = render(
      <MemoryRouter>
        <OrderFulfillmentActions
          order={{ ...order, productionTask: { status: "packing", qcResult: "passed" } }}
          onChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchPlatformVendors).toHaveBeenCalled());
    expect(screen.queryByRole("option", { name: "shipped" })).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <OrderFulfillmentActions
          order={{
            ...order,
            productionTask: { status: "ready_to_ship", qcResult: "passed" },
            shipment: { awb: "AWB123" },
          }}
          onChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("option", { name: "shipped" })).toBeInTheDocument();
  });
});
