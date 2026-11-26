import { PlatformError, PlatformModal } from "../../../platform-ui";
import { SHIPMENT_STATUSES } from "../model";
import type { ShipmentManageVm } from "../controllers/useShipmentManageController";

/** Shipment manage modal: tracking events, courier/AWB edits, resend. */
export function ShipmentManageModalView({
  row,
  evStatus,
  location,
  evNote,
  courier,
  awb,
  busy,
  err,
  okNote,
  onClose,
  onEvStatus,
  onLocation,
  onEvNote,
  onCourier,
  onAwb,
  onAddEvent,
  onSaveChanges,
  onResendTracking,
}: ShipmentManageVm) {
  return (
    <PlatformModal
      title={`Shipment ${row.awb ?? ""}`}
      subtitle={String(row.courier ?? "")}
      onClose={onClose}
    >
      {err && <PlatformError message={err} />}
      {okNote && (
        <div
          className="card"
          style={{ padding: 10, marginBottom: 12, color: "var(--brand)", fontSize: 13 }}
        >
          {okNote}
        </div>
      )}

      <label className="lbl">Add tracking event</label>
      <div className="field">
        <select className="inp" value={evStatus} onChange={(e) => onEvStatus(e.target.value)}>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="inp"
          placeholder="Location"
          value={location}
          onChange={(e) => onLocation(e.target.value)}
        />
        <input
          className="inp"
          placeholder="Note"
          value={evNote}
          onChange={(e) => onEvNote(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn btn-soft btn-sm"
        style={{ marginTop: 10 }}
        disabled={busy}
        onClick={onAddEvent}
      >
        Add event
      </button>

      <div className="divider" style={{ margin: "18px 0" }} />
      <label className="lbl">Edit courier / AWB</label>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="inp"
          placeholder="Courier"
          value={courier}
          onChange={(e) => onCourier(e.target.value)}
        />
        <input
          className="inp"
          placeholder="AWB"
          value={awb}
          onChange={(e) => onAwb(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn btn-soft btn-sm"
        style={{ marginTop: 10 }}
        disabled={
          busy || (courier === row.courier && awb === row.awb) || !courier.trim() || !awb.trim()
        }
        onClick={onSaveChanges}
      >
        Save changes
      </button>

      <div className="divider" style={{ margin: "18px 0" }} />
      {row.clientNotifiesCustomer ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Client order — the client notifies its own customer from our <code>order.shipped</code> /{" "}
          <code>order.delivered</code> webhooks. ShelfMerch doesn't email their customers.
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onResendTracking}
        >
          Resend tracking email
        </button>
      )}
    </PlatformModal>
  );
}
