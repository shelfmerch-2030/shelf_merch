import { useEffect, useRef, useState } from "react";
import type { QcInspection } from "@/services/production-qc";
import { fulfillmentStep } from "../fulfillmentWorkflow";
import {
  addOrderNote,
  assignOrderVendor,
  createOrderReplacement,
  createProductionTask,
  fetchPlatformVendors,
  setOrderStatus,
  uploadOrderMockup,
} from "../model";

export type OrderFulfillmentActionsVm = ReturnType<typeof useOrderFulfillmentActionsController>;

export function useOrderFulfillmentActionsController(
  order: Record<string, unknown>,
  onChanged: () => void,
) {
  const id = String(order._id);
  const currentStatus = String(order.status ?? "created");
  const task = order.productionTask as {
    _id?: string;
    status?: string;
    qcResult?: string;
    qcInspections?: QcInspection[];
    assignedTo?: string;
  } | null;
  const shipment = order.shipment as {
    awb?: string;
    courier?: string;
    trackingUrl?: string;
  } | null;
  const packingComplete =
    task?.qcResult === "passed" && ["ready_to_ship", "completed"].includes(task.status ?? "");
  const allowedStatuses = ((order.validNextStatuses ?? []) as string[]).filter(
    (next) =>
      !["qc_pending", "packed", "replacement_processing"].includes(next) &&
      (!["shipped", "delivered"].includes(next) || packingComplete) &&
      (next !== "shipped" || !!shipment?.awb),
  );
  const canStartProduction =
    ["approved", "mockup_pending", "mockup_approved", "in_production"].includes(currentStatus) &&
    (!task || ["completed", "issue"].includes(task.status ?? ""));
  const currentMockupUrl = String(order.mockupUrl ?? "");
  const qcStatus = String(order.qcStatus ?? "not_started");
  const step = fulfillmentStep({
    status: currentStatus,
    taskStatus: task?.status ?? "",
    hasShipment: !!shipment?.awb,
    packingComplete,
    canStartProduction,
    qcStatus,
  });
  const [status, setStatus] = useState(currentStatus);
  const [statusNote, setStatusNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [vendors, setVendors] = useState<{ _id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState(String(order.vendorId ?? ""));
  const [productionAssignee, setProductionAssignee] = useState(task?.assignedTo ?? "");
  const [vendorError, setVendorError] = useState("");
  const [mockupUrl, setMockupUrl] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const [replacementOrderId, setReplacementOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okNote, setOkNote] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    fetchPlatformVendors()
      .then((items) => {
        if (active) setVendors(items);
      })
      .catch(() => {
        if (active) setVendorError("Vendors could not be loaded. You can still enter an assignee.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErr("");
    setOkNote("");
    try {
      await fn();
      setOkNote(ok);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function changeStatus(next: string, message: string) {
    if (!allowedStatuses.includes(next)) return;
    void run(async () => {
      await setOrderStatus(id, next, statusNote.trim() || undefined);
      setStatusNote("");
    }, message);
  }

  return {
    currentStatus,
    allowedStatuses,
    productionTaskId: task?._id ?? "",
    productionTaskStatus: task?.status ?? "",
    qcStatus,
    qcInspections: task?.qcInspections ?? [],
    step,
    currentMockupUrl,
    shipmentAwb: shipment?.awb ?? "",
    shipmentCourier: shipment?.courier || "Courier",
    trackingUrl: shipment?.trackingUrl ?? "",
    canReplace: currentStatus === "issue_raised" || allowedStatuses.includes("issue_raised"),
    canStartProduction,
    status,
    statusNote,
    internalNote,
    vendors,
    vendorId,
    productionAssignee,
    vendorError,
    mockupUrl,
    replacementReason,
    replacementOrderId,
    busy,
    err,
    okNote,
    onStatus: setStatus,
    onStatusNote: setStatusNote,
    onInternalNote: setInternalNote,
    onVendorId: (value: string) => {
      setVendorId(value);
      const vendor = vendors.find((item) => item._id === value);
      if (vendor) setProductionAssignee(vendor.name);
    },
    onProductionAssignee: setProductionAssignee,
    onMockupUrl: setMockupUrl,
    onReplacementReason: setReplacementReason,
    onAdvance: () => {
      if (step.nextStatus) changeStatus(step.nextStatus, "Order updated.");
    },
    onSaveStatus: () => changeStatus(status, "Status updated."),
    onAssignVendor: () => {
      if (vendorId) void run(() => assignOrderVendor(id, vendorId), "Vendor assigned.");
    },
    onStartProduction: () => {
      if (canStartProduction)
        void run(async () => {
          if (vendorId && vendorId !== String(order.vendorId ?? ""))
            await assignOrderVendor(id, vendorId);
          return createProductionTask(id, productionAssignee.trim() || undefined);
        }, "Production task created. Continue in Production.");
    },
    onAddNote: () => {
      if (internalNote.trim())
        void run(async () => {
          await addOrderNote(id, internalNote.trim());
          setInternalNote("");
        }, "Note added.");
    },
    onAttachMockup: () => {
      if (mockupUrl.trim())
        void run(
          async () => {
            await uploadOrderMockup(id, mockupUrl.trim());
            setMockupUrl("");
          },
          currentStatus === "approved" || currentStatus === "mockup_pending"
            ? "Mockup sent for customer approval."
            : "Mockup updated.",
        );
    },
    onCreateReplacement: () => {
      if (
        !(currentStatus === "issue_raised" || allowedStatuses.includes("issue_raised")) ||
        !replacementReason.trim()
      )
        return;
      void run(async () => {
        const result = (await createOrderReplacement(id, replacementReason.trim())) as {
          replacement?: { _id?: string };
        };
        setReplacementOrderId(result.replacement?._id ?? "");
        setReplacementReason("");
      }, "Replacement order created.");
    },
  };
}
