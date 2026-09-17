import { useEffect, useState } from "react";
import {
  addOrderNote,
  assignOrderVendor,
  createOrderReplacement,
  createProductionTask,
  fetchPlatformVendors,
  setOrderStatus,
  uploadOrderMockup,
} from "../model";

export type OrderFulfillmentActionsVm = {
  currentStatus: string;
  canStartProduction: boolean;
  status: string;
  statusNote: string;
  internalNote: string;
  vendors: { _id: string; name: string }[];
  vendorId: string;
  productionAssignee: string;
  mockupUrl: string;
  replacementReason: string;
  busy: boolean;
  err: string;
  okNote: string;
  onStatus: (status: string) => void;
  onStatusNote: (note: string) => void;
  onInternalNote: (note: string) => void;
  onVendorId: (id: string) => void;
  onProductionAssignee: (name: string) => void;
  onMockupUrl: (url: string) => void;
  onReplacementReason: (reason: string) => void;
  onSaveStatus: () => void;
  onAssignVendor: () => void;
  onStartProduction: () => void;
  onAddNote: () => void;
  onAttachMockup: () => void;
  onCreateReplacement: () => void;
};

function hasActiveProductionTask(order: Record<string, unknown>) {
  const task = order.productionTask as { status?: string } | null | undefined;
  if (!task) return false;
  const status = String(task.status ?? "");
  return status !== "completed" && status !== "issue";
}

/** Controller for the order fulfilment actions panel: status/vendor/note/mockup/replacement. */
export function useOrderFulfillmentActionsController(
  order: Record<string, unknown>,
  onChanged: () => void,
): OrderFulfillmentActionsVm {
  const id = String(order._id);
  const currentStatus = String(order.status ?? "created");
  const canStartProduction = currentStatus === "mockup_approved" && !hasActiveProductionTask(order);
  const [status, setStatus] = useState(currentStatus);
  const [statusNote, setStatusNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [vendors, setVendors] = useState<{ _id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [productionAssignee, setProductionAssignee] = useState("");
  const [mockupUrl, setMockupUrl] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okNote, setOkNote] = useState("");

  useEffect(() => {
    fetchPlatformVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
  }, []);

  useEffect(() => {
    setStatus(String(order.status ?? "created"));
  }, [order.status]);

  useEffect(() => {
    if (!vendorId) return;
    const match = vendors.find((v) => v._id === vendorId);
    if (match?.name) setProductionAssignee(match.name);
  }, [vendorId, vendors]);

  async function run(fn: () => Promise<unknown>, ok: string) {
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
      setBusy(false);
    }
  }

  return {
    currentStatus,
    canStartProduction,
    status,
    statusNote,
    internalNote,
    vendors,
    vendorId,
    productionAssignee,
    mockupUrl,
    replacementReason,
    busy,
    err,
    okNote,
    onStatus: setStatus,
    onStatusNote: setStatusNote,
    onInternalNote: setInternalNote,
    onVendorId: setVendorId,
    onProductionAssignee: setProductionAssignee,
    onMockupUrl: setMockupUrl,
    onReplacementReason: setReplacementReason,
    onSaveStatus: () =>
      run(() => setOrderStatus(id, status, statusNote || undefined), "Status updated."),
    onAssignVendor: () => run(() => assignOrderVendor(id, vendorId), "Vendor assigned."),
    onStartProduction: () =>
      run(
        () => createProductionTask(id, productionAssignee.trim() || undefined),
        "Production task created. Open Production to manage it.",
      ),
    onAddNote: () => run(() => addOrderNote(id, internalNote.trim()), "Note added."),
    onAttachMockup: () => run(() => uploadOrderMockup(id, mockupUrl.trim()), "Mockup attached."),
    onCreateReplacement: () =>
      run(() => createOrderReplacement(id, replacementReason.trim()), "Replacement created."),
  };
}
