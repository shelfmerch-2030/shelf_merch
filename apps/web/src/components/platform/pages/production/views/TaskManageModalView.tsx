import { Link } from "react-router";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { QC_CHECKS, qcLabel } from "@/services/production-qc";
import { PlatformError, PlatformModal, StatusTag } from "../../../platform-ui";
import type { TaskManageVm } from "../controllers/useTaskManageController";
import { QcInspectionHistory } from "./QcInspectionHistory";

export function TaskManageModalView(vm: TaskManageVm) {
  const stage =
    vm.currentStatus === "qc_pending"
      ? 1
      : vm.currentStatus === "packing"
        ? 2
        : ["ready_to_ship", "completed"].includes(vm.currentStatus)
          ? 3
          : 0;
  const completed = vm.currentStatus === "completed";
  const unavailable = !["in_production", "qc_pending", "packed", "shipped", "delivered"].includes(
    String(vm.row.orderStatus),
  );
  const canEditStage = stage === 0 && vm.nextStatuses.length > 0 && !vm.readOnly && !unavailable;
  return (
    <PlatformModal
      title={"Task " + vm.taskId.slice(-6)}
      subtitle={"Order " + String(vm.row.orderNumber || vm.row.orderId)}
      onClose={vm.onClose}
      closeDisabled={vm.busy}
      size={vm.canInspect ? "lg" : "md"}
      scrollBody
    >
      {vm.err && (
        <div role="alert">
          <PlatformError message={vm.err} />
        </div>
      )}
      {vm.okNote && (
        <p role="status" style={{ color: "var(--brand)" }}>
          {vm.okNote}
        </p>
      )}
      <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <StatusTag status={vm.currentStatus} />
        <span style={{ fontSize: 13 }}>{qcLabel(vm.row.qcStatus)}</span>
      </div>
      <Link to={"/platform/orders/" + String(vm.row.orderId)} style={{ fontSize: 13 }}>
        Review order, artwork and approved mockup
      </Link>
      <ol
        aria-label="Production task progress"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
          listStyle: "none",
          padding: 0,
          margin: "20px 0",
        }}
      >
        {["Production", "QC", "Packing", "Shipping"].map((label, index) => (
          <li
            key={label}
            aria-current={!completed && index === stage ? "step" : undefined}
            style={{
              padding: "8px 4px",
              textAlign: "center",
              fontSize: 11,
              borderRadius: 8,
              background: index <= stage ? "var(--brand-50, #edf6ef)" : "var(--surface-2, #f5f6f5)",
              color: index <= stage ? "var(--brand)" : "var(--ink-3)",
              fontWeight: index === stage ? 700 : 400,
            }}
          >
            {label}
            <span className="sr-only">
              {completed || index < stage
                ? " complete"
                : index === stage
                  ? " current step"
                  : " pending"}
            </span>
          </li>
        ))}
      </ol>
      {vm.readOnly && (
        <p className="muted">
          Read-only access. Review the task and any recorded inspections below.
        </p>
      )}
      {unavailable && (
        <p className="muted">
          The order is {String(vm.row.orderStatus).replace(/_/g, " ")}. Production changes are
          unavailable.
        </p>
      )}
      {stage === 0 && (
        <section>
          <h3 className="mb-2">
            {vm.currentStatus === "issue"
              ? "Resolve the production issue"
              : vm.row.qcStatus === "rework"
                ? "Rework the products"
                : "Production progress"}
          </h3>
          <p className="muted">
            Update the completed production stage. Once the physical products are finished, move the
            task to QC pending to inspect them before packing.
          </p>
          {canEditStage && (
            <>
              <div className="field">
                <label className="lbl" htmlFor="task-status">
                  Advance status
                </label>
                <select
                  id="task-status"
                  className="inp"
                  value={vm.status}
                  disabled={vm.busy}
                  onChange={(e) => vm.onStatus(e.target.value)}
                >
                  {[vm.currentStatus, ...vm.nextStatuses].map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <label className="lbl" htmlFor="task-note">
                Status note (optional)
              </label>
              <input
                id="task-note"
                className="inp"
                value={vm.note}
                disabled={vm.busy}
                onChange={(e) => vm.onNote(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-brand btn-sm"
                style={{ marginTop: 12 }}
                disabled={vm.busy || vm.status === vm.currentStatus}
                onClick={vm.onSaveStatus}
              >
                {vm.status === "qc_pending" ? "Send for physical QC" : "Save status"}
              </button>
            </>
          )}
        </section>
      )}
      {stage === 1 && !vm.canInspect && (
        <p className="muted">
          Physical inspection is pending. Authorized production staff can record QC while the order
          is in production.
        </p>
      )}
      {vm.canInspect && (
        <section aria-labelledby="physical-qc-heading">
          <h3 id="physical-qc-heading">Physical quality check</h3>
          <fieldset disabled={vm.busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="lbl">Inspect physical products against the approved order</legend>
            <p className="muted">
              Check every ordered unit before passing. Expected quantity: {vm.expectedQuantity}.
            </p>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              {QC_CHECKS.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <input
                    type="checkbox"
                    checked={vm.qcChecks[key]}
                    onChange={(e) => vm.onQcCheck(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div className="field" style={{ flex: "1 1 160px" }}>
                <label className="lbl" htmlFor="qc-inspected">
                  Units inspected
                </label>
                <input
                  id="qc-inspected"
                  className="inp"
                  type="number"
                  min={1}
                  max={vm.expectedQuantity}
                  step={1}
                  value={vm.inspectedQuantity}
                  onChange={(e) => vm.onInspectedQuantity(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "1 1 160px" }}>
                <label className="lbl" htmlFor="qc-failed">
                  Units failed
                </label>
                <input
                  id="qc-failed"
                  className="inp"
                  type="number"
                  min={0}
                  max={vm.expectedQuantity}
                  step={1}
                  value={vm.failedQuantity}
                  onChange={(e) => vm.onFailedQuantity(e.target.value)}
                />
              </div>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: "12px 0", display: "flex", gap: 16 }}>
              <legend className="lbl">Inspection decision</legend>
              <label>
                <input
                  type="radio"
                  name="qc-decision"
                  checked={vm.qcPassed === true}
                  onChange={() => vm.onQcPassed(true)}
                />{" "}
                Pass
              </label>
              <label>
                <input
                  type="radio"
                  name="qc-decision"
                  checked={vm.qcPassed === false}
                  onChange={() => vm.onQcPassed(false)}
                />{" "}
                Fail / rework
              </label>
            </fieldset>
            {vm.qcPassed === true && (
              <p className="muted">
                Pass fills the expected inspected quantity when blank. Confirm the counts match your
                physical inspection; any values you entered are kept.
              </p>
            )}
            {vm.qcPassed === false && (
              <div className="field">
                <label className="lbl" htmlFor="qc-reason">
                  Failure reason (required)
                </label>
                <textarea
                  id="qc-reason"
                  className="inp"
                  maxLength={2000}
                  value={vm.qcReason}
                  onChange={(e) => vm.onQcReason(e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label className="lbl" htmlFor="qc-notes">
                Inspection notes
              </label>
              <textarea
                id="qc-notes"
                className="inp"
                maxLength={4000}
                value={vm.qcNotes}
                onChange={(e) => vm.onQcNotes(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="qc-photo">
                QC photos (at least one required)
              </label>
              <input
                id="qc-photo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={vm.photoUrls.length >= 20}
                onChange={(e) => {
                  vm.onUploadPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <p className="muted">
                Photos save immediately. PNG, JPEG, WebP or GIF; up to 5 MB each, 20 per inspection.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {vm.photoUrls.map((url, index) => (
                <a key={url} href={resolveMediaUrl(url)} target="_blank" rel="noreferrer">
                  <img
                    src={resolveMediaUrl(url)}
                    alt={"Current inspection evidence " + (index + 1)}
                    style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8 }}
                  />
                </a>
              ))}
            </div>
            <p className="muted">
              Passing requires every checklist item, all units inspected, zero failed units and
              photo evidence. Failure requires a reason, failed unit count and photo evidence.
            </p>
            <button
              type="button"
              className="btn btn-brand mt-4"
              disabled={!vm.canRecordQc}
              aria-describedby="qc-requirements"
              onClick={vm.onRecordQc}
            >
              Record QC
            </button>
            <div
              id="qc-requirements"
              role="status"
              aria-live="polite"
              style={{ marginTop: 12, fontSize: 13 }}
            >
              {vm.busy ? (
                <p>Saving, please wait...</p>
              ) : vm.qcRequirements.length > 0 ? (
                <>
                  <strong>Before recording QC:</strong>
                  <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
                    {vm.qcRequirements.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>All requirements are complete. You can record QC.</p>
              )}
            </div>
          </fieldset>
        </section>
      )}
      {stage === 2 && (
        <section>
          <h3 className="mb-2">Complete packing</h3>
          <p className="muted">
            {vm.row.qcResult === "passed"
              ? "Physical QC has passed. Pack the checked products, verify the contents and shipping label, then confirm packing is complete."
              : "A recorded QC pass is required before packing can be completed. Review this task's QC records."}
          </p>
          {!vm.readOnly &&
            !unavailable &&
            vm.row.qcResult === "passed" &&
            vm.nextStatuses.includes("ready_to_ship") && (
              <button
                type="button"
                className="btn btn-brand mt-4"
                disabled={vm.busy}
                onClick={() => vm.onAdvanceStatus("ready_to_ship")}
              >
                Complete packing
              </button>
            )}
        </section>
      )}
      {stage === 3 && (
        <section>
          <h3 className="mb-2">
            {completed ? "Production task completed" : vm.awb ? "Shipment booked" : "Ready to ship"}
          </h3>
          {vm.awb ? (
            <p>
              AWB <span className="num">{vm.awb}</span>
              {vm.trackingUrl && (
                <>
                  {" "}
                  |{" "}
                  <a href={vm.trackingUrl} target="_blank" rel="noreferrer">
                    Track shipment
                  </a>
                </>
              )}
            </p>
          ) : (
            <p className="muted">
              QC and packing are complete. Request courier pickup for the packed order.
            </p>
          )}
          {!vm.awb && vm.canRequestShipment && (
            <button
              type="button"
              className="btn btn-brand mt-4"
              disabled={vm.busy}
              onClick={vm.onRequestShipment}
            >
              Request Delhivery shipment
            </button>
          )}
          {!completed &&
            vm.awb &&
            vm.nextStatuses.includes("completed") &&
            !vm.readOnly &&
            !unavailable && (
              <>
                <p className="muted">
                  The shipment is booked. You can now close this production task.
                </p>
                <button
                  type="button"
                  className="btn btn-brand mt-4"
                  disabled={vm.busy}
                  onClick={() => vm.onAdvanceStatus("completed")}
                >
                  Complete task
                </button>
              </>
            )}
        </section>
      )}
      {vm.inspections.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Inspection history ({vm.inspections.length})
          </summary>
          <div style={{ marginTop: 12 }}>
            <QcInspectionHistory inspections={vm.inspections} />
          </div>
        </details>
      )}
      {stage !== 0 && !vm.readOnly && !unavailable && vm.nextStatuses.includes("issue") && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer" }}>Report a production issue</summary>
          <label className="lbl" htmlFor="task-issue-note" style={{ marginTop: 12 }}>
            Issue note
          </label>
          <input
            id="task-issue-note"
            className="inp"
            value={vm.note}
            disabled={vm.busy}
            onChange={(e) => vm.onNote(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-soft btn-sm"
            style={{ marginTop: 12 }}
            disabled={vm.busy}
            onClick={() => vm.onAdvanceStatus("issue")}
          >
            Put task on hold
          </button>
        </details>
      )}
    </PlatformModal>
  );
}
