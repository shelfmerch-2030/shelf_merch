import { useCallback, useRef, useState } from "react";
import { recordTaskQc, requestDelhiveryShipment, setTaskStatus, uploadTaskQcPhoto } from "../model";
import type { QcChecks, QcCheckKey, QcInspection } from "@/services/production-qc";
const emptyChecks = (): QcChecks => ({
  product: false,
  artwork: false,
  workmanship: false,
  quantity: false,
  contents: false,
});
export type TaskManageVm = ReturnType<typeof useTaskManageController>;

export function useTaskManageController(
  initialRow: Record<string, unknown>,
  onClose: () => void,
  onChanged: () => void,
  readOnly = false,
) {
  const [row, setRow] = useState(initialRow);
  const taskId = String(row._id);
  const currentStatus = String(row.status);
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [qcPassed, setQcPassed] = useState<boolean | null>(null);
  const [qcReason, setQcReason] = useState("");
  const [qcNotes, setQcNotes] = useState("");
  const [qcChecks, setQcChecks] = useState<QcChecks>(emptyChecks);
  const [inspectedQuantity, setInspectedQuantity] = useState("");
  const [failedQuantity, setFailedQuantity] = useState("0");
  const inspections = (row.qcInspections ?? []) as QcInspection[];
  const [photoUrls, setPhotoUrls] = useState<string[]>(() => {
    const used = new Set(inspections.flatMap((inspection) => inspection.photoUrls));
    return ((initialRow.qcPhotos ?? []) as { url: string }[])
      .map((photo) => photo.url)
      .filter((url) => !used.has(url));
  });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [err, setErr] = useState("");
  const [okNote, setOkNote] = useState("");
  const shipment = row.shipment as { awb?: string; trackingUrl?: string } | null;
  const expectedQuantity = Number(row.expectedQuantity ?? 0);
  const canInspect =
    !readOnly &&
    currentStatus === "qc_pending" &&
    ["in_production", "qc_pending"].includes(String(row.orderStatus));
  const canRequestShipment =
    !readOnly &&
    row.qcResult === "passed" &&
    currentStatus === "ready_to_ship" &&
    row.orderStatus === "packed";
  const inspected = Number(inspectedQuantity),
    failed = Number(failedQuantity);
  const inspectedValid =
    inspectedQuantity.trim() !== "" && Number.isInteger(inspected) && inspected > 0;
  const failedValid = failedQuantity.trim() !== "" && Number.isInteger(failed) && failed >= 0;
  const qcRequirements: string[] = [];
  if (qcPassed === null) qcRequirements.push("Choose Pass or Fail / rework.");
  if (!inspectedValid)
    qcRequirements.push("Enter a whole number greater than zero for Units inspected.");
  else if (inspected > expectedQuantity)
    qcRequirements.push(
      `Units inspected cannot exceed the expected quantity (${expectedQuantity}).`,
    );
  else if (qcPassed === true && inspected !== expectedQuantity)
    qcRequirements.push(`Inspect all ${expectedQuantity} ordered units before passing QC.`);
  if (!failedValid) qcRequirements.push("Enter 0 or a positive whole number for Units failed.");
  else if (inspectedValid && failed > inspected)
    qcRequirements.push("Units failed cannot exceed Units inspected.");
  else if (qcPassed === true && failed !== 0)
    qcRequirements.push(
      "Units failed must be 0 for a pass. Choose Fail / rework if any units failed.",
    );
  else if (qcPassed === false && failed === 0)
    qcRequirements.push("Enter at least 1 failed unit for Fail / rework.");
  const unchecked = Object.values(qcChecks).filter((checked) => !checked).length;
  if (qcPassed === true && unchecked > 0)
    qcRequirements.push(`Complete the inspection checklist (${unchecked} remaining).`);
  if (qcPassed === false && !qcReason.trim()) qcRequirements.push("Enter the failure reason.");
  if (photoUrls.length === 0) qcRequirements.push("Upload at least one QC photo.");
  const canRecordQc = canInspect && !busy && qcRequirements.length === 0;
  const nextStatuses = readOnly ? [] : ((row.validNextStatuses ?? []) as string[]);
  const close = useCallback(() => {
    if (!inFlight.current) onClose();
  }, [onClose]);
  async function run(fn: () => Promise<void>, ok: string) {
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
  function applyTask(task: Record<string, unknown>) {
    setRow((previous) => ({ ...previous, ...task }));
    setStatus(String(task.status));
    setNote("");
  }
  function saveStatus(next: string) {
    if (readOnly || !nextStatuses.includes(next)) return;
    return run(
      async () => {
        applyTask(await setTaskStatus(taskId, next, note.trim() || undefined));
      },
      next === "ready_to_ship" ? "Packing completed. Order is ready to ship." : "Status updated.",
    );
  }
  return {
    row,
    taskId,
    status,
    currentStatus,
    nextStatuses,
    note,
    qcPassed,
    qcReason,
    qcNotes,
    qcChecks,
    inspectedQuantity,
    failedQuantity,
    expectedQuantity,
    photoUrls,
    inspections,
    busy,
    err,
    okNote,
    canInspect,
    canRecordQc,
    qcRequirements,
    canRequestShipment,
    readOnly,
    awb: shipment?.awb ?? "",
    trackingUrl: shipment?.trackingUrl ?? "",
    onClose: close,
    onStatus: setStatus,
    onNote: setNote,
    onQcPassed: (passed: boolean) => {
      setQcPassed(passed);
      if (passed && expectedQuantity > 0) {
        setInspectedQuantity((previous) => (previous.trim() ? previous : String(expectedQuantity)));
        setFailedQuantity((previous) => (previous.trim() ? previous : "0"));
      }
    },
    onQcReason: setQcReason,
    onQcNotes: setQcNotes,
    onInspectedQuantity: setInspectedQuantity,
    onFailedQuantity: setFailedQuantity,
    onQcCheck: (key: QcCheckKey, checked: boolean) =>
      setQcChecks((previous) => ({ ...previous, [key]: checked })),
    onSaveStatus: () => saveStatus(status),
    onAdvanceStatus: saveStatus,
    onRecordQc: () => {
      if (!canRecordQc || qcPassed === null) return;
      void run(
        async () => {
          applyTask(
            await recordTaskQc(taskId, {
              passed: qcPassed,
              reason: qcPassed ? "" : qcReason.trim(),
              notes: qcNotes.trim(),
              checks: qcChecks,
              inspectedQuantity: inspected,
              failedQuantity: failed,
              photoUrls,
            }),
          );
          setQcPassed(null);
          setQcReason("");
          setQcNotes("");
          setQcChecks(emptyChecks());
          setInspectedQuantity("");
          setFailedQuantity("0");
          setPhotoUrls([]);
        },
        qcPassed
          ? "QC passed. Complete packing before requesting shipment."
          : "QC failed. Rework the products, then submit them for inspection again.",
      );
    },
    onUploadPhoto: (file: File | undefined) => {
      if (!file || !canInspect) return;
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      ) {
        setErr("Choose a PNG, JPEG, WebP or GIF image up to 5 MB.");
        return;
      }
      if (photoUrls.length >= 20) {
        setErr("Use at most 20 photos per inspection.");
        return;
      }
      void run(async () => {
        const { url } = await uploadTaskQcPhoto(taskId, file);
        setPhotoUrls((previous) => [...previous, url]);
      }, "QC photo saved.");
    },
    onRequestShipment: () => {
      if (!canRequestShipment) return;
      void run(async () => {
        const created = await requestDelhiveryShipment(taskId);
        setRow((previous) => ({
          ...previous,
          shipment: created,
          validNextStatuses: ["completed", "issue"],
        }));
      }, "Shipment requested on Delhivery. It now appears on the Delhivery dashboard.");
    },
  };
}
