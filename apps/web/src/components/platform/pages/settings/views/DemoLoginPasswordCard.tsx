import { Copy, KeyRound, RotateCcw, ShieldX } from "lucide-react";
import { PlatformError, StatusTag } from "../../../platform-ui";
import type { DemoLoginPasswordVm } from "../controllers/useDemoLoginPasswordController";

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(vm: DemoLoginPasswordVm) {
  if (vm.loading) return "Loading";
  if (vm.status?.active) return "active";
  if (vm.status?.revokedAt) return "revoked";
  if (vm.status?.expiresAt) return "expired";
  return "not generated";
}

export function DemoLoginPasswordCard(vm: DemoLoginPasswordVm) {
  const passwordValue = vm.generatedPassword || (vm.status?.active ? "****************" : "");
  const disabled = vm.busy || !vm.canWrite;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Demo login password</h3>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Temporary <code>/app</code> password for{" "}
            <code>{vm.status?.email ?? "test@shelfmerch.io"}</code> (Rubix company admin). No{" "}
            <code>/platform</code> access. Expires every {vm.status?.ttlDays ?? 5} days.
          </p>
        </div>
        <StatusTag status={statusLabel(vm)} />
      </div>

      {vm.err && <PlatformError message={vm.err} />}

      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 280px", margin: 0 }}>
          <label className="lbl" htmlFor="demo-login-password">
            Generated password
          </label>
          <input
            id="demo-login-password"
            className="inp"
            type={vm.generatedPassword ? "text" : "password"}
            value={passwordValue}
            placeholder="Generate a password"
            readOnly
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!vm.generatedPassword}
          onClick={vm.onCopy}
          title="Copy password"
        >
          <Copy size={14} />
          Copy
        </button>
        {vm.canWrite && (
          <>
            <button type="button" className="btn btn-brand btn-sm" disabled={disabled} onClick={vm.onGenerate}>
              {vm.status?.active ? <RotateCcw size={14} /> : <KeyRound size={14} />}
              {vm.busy ? "Working..." : vm.status?.active ? "Rotate" : "Generate"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled || !vm.status?.active}
              onClick={vm.onRevoke}
            >
              <ShieldX size={14} />
              Revoke
            </button>
          </>
        )}
      </div>

      <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Generated: {formatDate(vm.status?.generatedAt)}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          Expires: {formatDate(vm.status?.expiresAt)}
        </span>
        {vm.status?.revokedAt && (
          <span className="muted" style={{ fontSize: 12 }}>
            Revoked: {formatDate(vm.status.revokedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
