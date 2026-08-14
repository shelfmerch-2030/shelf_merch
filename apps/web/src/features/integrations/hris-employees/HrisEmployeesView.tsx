import { Link } from "react-router";
import { ArrowLeft, Search } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import type { MergeHrisEmployeePublic } from "@/services/merge-api";
import type { HrisEmployeesVm } from "./useHrisEmployeesController";

function emptyCell(value?: string | null) {
  const v = (value ?? "").trim();
  return v ? v : "—";
}

function initials(employee: MergeHrisEmployeePublic) {
  const first = (employee.firstName || "").trim();
  const last = (employee.lastName || "").trim();
  if (first || last) {
    return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase() || "?";
  }
  const name = (employee.displayName || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function avatarTone(seed: string) {
  const tones = [
    { bg: "#dbeafe", border: "#93c5fd" },
    { bg: "#fef3c7", border: "#fcd34d" },
    { bg: "#dcfce7", border: "#86efac" },
    { bg: "#fce7f3", border: "#f9a8d4" },
    { bg: "#e0e7ff", border: "#a5b4fc" },
    { bg: "#ffedd5", border: "#fdba74" },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * 17) % tones.length;
  return tones[hash];
}

function statusMeta(status?: string | null) {
  const raw = (status || "").trim().toUpperCase();
  if (raw === "ACTIVE") return { label: "Active", tone: "active" };
  if (raw === "INACTIVE") return { label: "Inactive", tone: "inactive" };
  if (raw === "PENDING") return { label: "Pending", tone: "pending" };
  if (!raw) return { label: "Unknown", tone: "unknown" };
  return {
    label: raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: "unknown",
  };
}

function providerLabel(slug: string) {
  const map: Record<string, string> = {
    deel: "Deel",
    workday: "Workday",
    bamboohr: "BambooHR",
    gusto: "Gusto",
    keka: "Keka",
    "ukg-pro": "UKG Pro",
    hibob: "HiBob",
  };
  return map[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** HRIS people directory — MergeHrisEmployee only; never Workspace Contacts. */
export function HrisEmployeesView(vm: HrisEmployeesVm) {
  const hasConnection = vm.connections.some(
    (c) => c.status === "connected" || c.status === "needs_attention",
  );

  return (
    <div className="hris-dir-page">
      <div className="hris-dir-top">
        <Link to="/app/integrations" className="bonus-integ-back">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to integrations</span>
        </Link>
        <div className="hris-dir-title-row">
          <h1>Directory</h1>
          {!vm.loading ? (
            <span className="hris-dir-count">
              Total {vm.employees.length} {vm.employees.length === 1 ? "item" : "items"}
            </span>
          ) : null}
        </div>
        <p className="hris-dir-subtitle">
          People imported from your connected HRIS via Merge. These are not Workspace Contacts and
          do not create ShelfMerch logins.
        </p>
      </div>

      {!hasConnection && !vm.loading ? (
        <p className="hris-dir-subtitle">
          No active HRIS connection.{" "}
          <Link to="/app/integrations">Connect a provider</Link> and run Sync now.
        </p>
      ) : null}

      <div className="hris-dir-toolbar">
        <label className="hris-dir-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search name, email, title…"
            value={vm.search}
            onChange={(e) => vm.onSearch(e.target.value)}
          />
        </label>
        {vm.providerOptions.length > 0 ? (
          <select
            className="hris-dir-select"
            value={vm.providerFilter}
            onChange={(e) => vm.onProviderFilter(e.target.value)}
            aria-label="Filter by provider"
          >
            <option value="all">All providers</option>
            {vm.providerOptions.map((p) => (
              <option key={p} value={p}>
                {providerLabel(p)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {vm.loading ? <LoadingState message="Loading HRIS employees…" fullScreen={false} /> : null}
      {vm.error ? (
        <p className="hris-dir-error" role="alert">
          {vm.error}
        </p>
      ) : null}

      {!vm.loading && !vm.error ? (
        <div className="hris-dir-table-wrap">
          <table className="hris-dir-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Work email</th>
                <th>Department</th>
                <th>Location</th>
                <th>Status</th>
                <th>Provider</th>
              </tr>
            </thead>
            <tbody>
              {vm.employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="hris-dir-empty">
                    {hasConnection
                      ? "No HRIS employees yet. Open a connected provider and choose Sync now."
                      : "Connect an HRIS provider to import employees."}
                  </td>
                </tr>
              ) : (
                vm.employees.map((e) => {
                  const name = e.displayName || `${e.firstName} ${e.lastName}`.trim();
                  const status = statusMeta(e.employmentStatus);
                  const location = emptyCell(e.locationName || e.country);
                  const tone = avatarTone(e.id || name);
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="hris-dir-person">
                          <span
                            className="hris-dir-avatar"
                            style={{ background: tone.bg, borderColor: tone.border }}
                            aria-hidden="true"
                          >
                            {initials(e)}
                          </span>
                          <span className="hris-dir-person-copy">
                            <span className="hris-dir-person-name">{emptyCell(name)}</span>
                            <span className="hris-dir-person-title">{emptyCell(e.jobTitle)}</span>
                          </span>
                        </div>
                      </td>
                      <td>{emptyCell(e.workEmail)}</td>
                      <td>{emptyCell(e.departmentName)}</td>
                      <td>{location}</td>
                      <td>
                        <span className={`hris-dir-status hris-dir-status--${status.tone}`}>
                          <span className="hris-dir-status-dot" aria-hidden="true" />
                          {status.label}
                        </span>
                      </td>
                      <td className="hris-dir-provider">{emptyCell(e.provider)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
