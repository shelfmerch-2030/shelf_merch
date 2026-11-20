import { Link } from "react-router";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { PlatformError, StatusTag } from "../../../platform-ui";
import { qcLabel } from "@/services/production-qc";
import { FULFILLMENT_STEPS } from "../fulfillmentWorkflow";
import { QcInspectionHistory } from "../../production/views/QcInspectionHistory";
import type { OrderFulfillmentActionsVm } from "../controllers/useOrderFulfillmentActionsController";
import "./order-fulfillment.css";

function MockupForm({ vm, send = false }: { vm: OrderFulfillmentActionsVm; send?: boolean }) {
  return (
    <div className="fulfillment-form">
      <label className="lbl" htmlFor="fulfillment-mockup">
        Mockup image URL
      </label>
      <input
        id="fulfillment-mockup"
        className="inp"
        type="url"
        placeholder="https://example.com/mockup.png"
        value={vm.mockupUrl}
        onChange={(e) => vm.onMockupUrl(e.target.value)}
      />
      <button
        type="button"
        className={send ? "btn btn-brand btn-sm" : "btn btn-soft btn-sm"}
        disabled={vm.busy || !vm.mockupUrl.trim()}
        onClick={vm.onAttachMockup}
      >
        {send ? "Send mockup for approval" : "Update mockup"}
      </button>
    </div>
  );
}

function AssignmentForm({
  vm,
  starting = false,
}: {
  vm: OrderFulfillmentActionsVm;
  starting?: boolean;
}) {
  return (
    <div className="fulfillment-form">
      {vm.vendorError && <p className="muted">{vm.vendorError}</p>}
      <label className="lbl" htmlFor="fulfillment-vendor">
        Production vendor (optional)
      </label>
      <select
        id="fulfillment-vendor"
        className="inp"
        value={vm.vendorId}
        onChange={(e) => vm.onVendorId(e.target.value)}
      >
        <option value="">Select a vendor</option>
        {vm.vendorId && !vm.vendors.some((vendor) => vendor._id === vm.vendorId) && (
          <option value={vm.vendorId}>Current vendor</option>
        )}
        {vm.vendors.map((vendor) => (
          <option key={vendor._id} value={vendor._id}>
            {vendor.name}
          </option>
        ))}
      </select>
      {starting ? (
        <p className="muted">The vendor is saved when you start production.</p>
      ) : (
        <button
          type="button"
          className="btn btn-soft btn-sm"
          disabled={vm.busy || !vm.vendorId}
          onClick={vm.onAssignVendor}
        >
          Save vendor
        </button>
      )}
      {vm.canStartProduction && (
        <>
          <label className="lbl" htmlFor="fulfillment-assignee">
            Production assignee (optional)
          </label>
          <input
            id="fulfillment-assignee"
            className="inp"
            placeholder="Name or team"
            value={vm.productionAssignee}
            onChange={(e) => vm.onProductionAssignee(e.target.value)}
          />
        </>
      )}
    </div>
  );
}

function ReplacementForm({ vm }: { vm: OrderFulfillmentActionsVm }) {
  return (
    <div className="fulfillment-form">
      <label className="lbl" htmlFor="fulfillment-replacement">
        Replacement reason
      </label>
      <textarea
        id="fulfillment-replacement"
        className="inp"
        placeholder="What needs to be replaced and why?"
        value={vm.replacementReason}
        onChange={(e) => vm.onReplacementReason(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-soft btn-sm"
        disabled={vm.busy || !vm.replacementReason.trim()}
        onClick={vm.onCreateReplacement}
      >
        Create replacement order
      </button>
    </div>
  );
}

/** The current step stays prominent; supporting tools remain available on demand. */
export function OrderFulfillmentActionsView(vm: OrderFulfillmentActionsVm) {
  const taskUrl = vm.productionTaskId
    ? "/platform/production?taskId=" + vm.productionTaskId
    : "/platform/production";
  return (
    <section className="card fulfillment-actions" aria-labelledby="fulfillment-heading">
      <div className="fulfillment-heading">
        <h2 id="fulfillment-heading">Fulfillment</h2>
        <StatusTag status={vm.currentStatus} />
      </div>
      {vm.step.index !== null && (
        <ol className="fulfillment-steps" aria-label="Fulfillment progress">
          {FULFILLMENT_STEPS.map((label, index) => {
            const done = vm.step.complete || (vm.step.index !== null && index < vm.step.index);
            const current = !vm.step.complete && index === vm.step.index;
            return (
              <li
                key={label}
                className={done ? "is-done" : current ? "is-current" : ""}
                aria-current={current ? "step" : undefined}
              >
                <span className="fulfillment-step-number" aria-hidden="true">
                  {done ? "\u2713" : index + 1}
                </span>
                <span>
                  {label}
                  <span className="sr-only">
                    {done ? " complete" : current ? " current step" : " pending"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {vm.err && (
        <div role="alert">
          <PlatformError message={vm.err} />
        </div>
      )}
      {vm.okNote && (
        <p role="status" className="fulfillment-success">
          {vm.okNote}
        </p>
      )}
      {vm.replacementOrderId && (
        <Link to={"/platform/orders/" + vm.replacementOrderId}>Open replacement order</Link>
      )}

      <fieldset disabled={vm.busy} className="fulfillment-controls">
        <legend className="sr-only">Fulfillment actions</legend>
        <div className="fulfillment-next">
          <span className="fulfillment-eyebrow">
            {vm.step.complete ? "Completed" : vm.step.index === null ? "Order update" : "Next step"}
          </span>
          <h3>{vm.step.title}</h3>
          <p className="muted">{vm.step.description}</p>
          {vm.step.action === "production" && (
            <>
              <details className="fulfillment-detail">
                <summary>Production assignment (optional)</summary>
                <AssignmentForm vm={vm} starting />
              </details>
              <button
                type="button"
                className="btn btn-brand"
                disabled={vm.busy || !vm.canStartProduction}
                onClick={vm.onStartProduction}
              >
                Start production
              </button>
            </>
          )}
          {vm.step.action === "task" && (
            <>
              <div className="fulfillment-task-summary">
                <span>{qcLabel(vm.qcStatus)}</span>
                {vm.productionTaskId && (
                  <span className="muted">Task: {vm.productionTaskStatus.replace(/_/g, " ")}</span>
                )}
              </div>
              <Link className="btn btn-brand" to={taskUrl}>
                {vm.productionTaskId ? "Open production task" : "Open Production"}
              </Link>
              {vm.currentStatus === "packed" && (
                <Link className="fulfillment-secondary-link" to="/platform/shipments">
                  Manage shipments / add AWB
                </Link>
              )}
            </>
          )}
          {vm.step.action === "advance" && (
            <button
              type="button"
              className="btn btn-brand"
              disabled={
                vm.busy || !vm.step.nextStatus || !vm.allowedStatuses.includes(vm.step.nextStatus)
              }
              onClick={vm.onAdvance}
            >
              {vm.step.buttonLabel}
            </button>
          )}
          {vm.step.action === "replacement" && <ReplacementForm vm={vm} />}
          {vm.shipmentAwb && (
            <div className="fulfillment-shipment">
              <strong>{vm.shipmentCourier}</strong>
              <span>AWB: {vm.shipmentAwb}</span>
              {vm.trackingUrl && (
                <a href={vm.trackingUrl} target="_blank" rel="noreferrer">
                  Track shipment
                </a>
              )}
            </div>
          )}
        </div>

        <details className="fulfillment-detail">
          <summary>Add an internal note</summary>
          <div className="fulfillment-form">
            <label className="lbl" htmlFor="fulfillment-note">
              Internal note
            </label>
            <textarea
              id="fulfillment-note"
              className="inp"
              placeholder="Updates for your team"
              value={vm.internalNote}
              onChange={(e) => vm.onInternalNote(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={vm.busy || !vm.internalNote.trim()}
              onClick={vm.onAddNote}
            >
              Add note
            </button>
          </div>
        </details>
        {vm.qcInspections.length > 0 && (
          <details className="fulfillment-detail">
            <summary>QC inspection history ({vm.qcInspections.length})</summary>
            <QcInspectionHistory inspections={vm.qcInspections} />
          </details>
        )}
        <details className="fulfillment-detail">
          <summary>More actions</summary>
          {vm.step.action !== "production" && (
            <details className="fulfillment-detail">
              <summary>Production assignment</summary>
              <AssignmentForm vm={vm} />
            </details>
          )}
          <details className="fulfillment-detail">
            <summary>Mockup (optional)</summary>
            {vm.currentMockupUrl && (
              <a href={resolveMediaUrl(vm.currentMockupUrl)} target="_blank" rel="noreferrer">
                View current mockup
              </a>
            )}
            <MockupForm
              vm={vm}
              send={["approved", "mockup_pending"].includes(vm.currentStatus)}
            />
          </details>
          {vm.canReplace && vm.step.action !== "replacement" && (
            <details className="fulfillment-detail">
              <summary>Create a replacement</summary>
              <ReplacementForm vm={vm} />
            </details>
          )}
          <details className="fulfillment-detail">
            <summary>Manual status change</summary>
            <div className="fulfillment-form">
              <p className="muted">
                Use for issues, cancellation or a status correction. QC and packing must be
                completed in Production.
              </p>
              <label className="lbl" htmlFor="fulfillment-status">
                Order status
              </label>
              <select
                id="fulfillment-status"
                className="inp"
                value={vm.status}
                onChange={(e) => vm.onStatus(e.target.value)}
              >
                {[vm.currentStatus, ...vm.allowedStatuses].map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <label className="lbl" htmlFor="fulfillment-status-note">
                Status note (optional)
              </label>
              <input
                id="fulfillment-status-note"
                className="inp"
                value={vm.statusNote}
                onChange={(e) => vm.onStatusNote(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-soft btn-sm"
                disabled={
                  vm.busy ||
                  vm.status === vm.currentStatus ||
                  !vm.allowedStatuses.includes(vm.status)
                }
                onClick={vm.onSaveStatus}
              >
                Save status
              </button>
            </div>
          </details>
        </details>
      </fieldset>
    </section>
  );
}
