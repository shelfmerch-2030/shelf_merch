import { PlatformError, PlatformModal } from "../../../platform-ui";
import { PLATFORM_ROLES, roleLabel } from "../model";
import type { TeamManageVm } from "../controllers/useTeamManageController";

/** Team member manage modal: role change and activate/deactivate. */
export function TeamManageModalView({
  row,
  role,
  isActive,
  busy,
  err,
  note,
  onClose,
  onRole,
  onSaveRole,
  onDeactivate,
  onReactivate,
}: TeamManageVm) {
  const protectedBuiltIn = Boolean(row.protected);

  return (
    <PlatformModal title={row.name} subtitle={row.email} onClose={onClose}>
      {err && <PlatformError message={err} />}
      {protectedBuiltIn && (
        <div className="card" style={{ padding: 10, marginBottom: 12, fontSize: 13 }}>
          Built-in platform login; this account stays active and allowlisted.
        </div>
      )}
      {note && (
        <div
          className="card"
          style={{ padding: 10, marginBottom: 12, color: "var(--brand)", fontSize: 13 }}
        >
          {note}
        </div>
      )}
      <div className="field">
        <label className="lbl">Role</label>
        <select className="inp" value={role} onChange={(e) => onRole(e.target.value)}>
          {PLATFORM_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn btn-soft btn-sm"
        disabled={busy || role === row.role}
        onClick={onSaveRole}
      >
        Save role
      </button>
      <div className="divider" style={{ margin: "18px 0" }} />
      {isActive ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--danger)" }}
          disabled={busy || protectedBuiltIn}
          onClick={onDeactivate}
        >
          Deactivate user
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-soft btn-sm"
          disabled={busy}
          onClick={onReactivate}
        >
          Reactivate user
        </button>
      )}
    </PlatformModal>
  );
}
