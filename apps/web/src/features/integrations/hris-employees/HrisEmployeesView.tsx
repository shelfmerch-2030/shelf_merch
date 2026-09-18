import { Link } from "react-router";
import { ArrowLeft, ChevronDown, HelpCircle, Search, Unplug, Users } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import type { MergeHrisEmployeePublic } from "@/services/merge-api";
import type { HrisEmployeesVm } from "./useHrisEmployeesController";

function emptyCell(value?: string | null) {
  const v = (value ?? "").trim();
  return v ? v : "—";
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z]{2,3}$/.test(part)) return part;
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function formatLocationLabel(locationName?: string | null, country?: string | null) {
  const name = (locationName || "").trim();
  const c = (country || "").trim();
  if (name) return titleCaseWords(name);
  if (!c) return "";
  if (c.toUpperCase() === "IN" || c.toUpperCase() === "IND") return "India";
  if (c.toUpperCase() === "AU") return "Australia";
  if (c.toUpperCase() === "US" || c.toUpperCase() === "USA") return "United States";
  if (c.length <= 3) return c.toUpperCase();
  return titleCaseWords(c);
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
    { bg: "#e8eefc", fg: "#1e3a8a" },
    { bg: "#f3e8ff", fg: "#6b21a8" },
    { bg: "#e7f8ef", fg: "#166534" },
    { bg: "#fff1e7", fg: "#9a3412" },
    { bg: "#fce7f3", fg: "#9d174d" },
    { bg: "#ecfeff", fg: "#0e7490" },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * 17) % tones.length;
  return tones[hash];
}

function statusMeta(status?: string | null) {
  const raw = (status || "").trim().toUpperCase();
  if (raw === "ACTIVE") return { label: "Active", tone: "active" };
  if (raw === "SUSPENDED") return { label: "Suspended", tone: "inactive" };
  if (raw === "INACTIVE") return { label: "Inactive", tone: "inactive" };
  if (raw === "PENDING") return { label: "Pending", tone: "pending" };
  if (!raw) return { label: "Unknown", tone: "unknown" };
  return {
    label: raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: "unknown",
  };
}

function formatDirSyncAt(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    "google-workspace": "Google Workspace",
  };
  return map[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tidyName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** HRIS people directory — MergeHrisEmployee list; also mirrored into Workspace Contacts on sync. */
export function HrisEmployeesView(vm: HrisEmployeesVm) {
  const hasConnection = vm.connections.some(
    (c) => c.status === "connected" || c.status === "needs_attention",
  );
  const filtered = vm.employees.length;

  return (
    <div className="hris-dir-page">
      <Link to="/app/integrations" className="hris-dir-back">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to integrations
      </Link>

      <div className="hris-dir-top">
        <div className="hris-dir-top-copy">
          <h1>Employee directory</h1>
          <p>Synced people from connected directory providers. Also added to Workspace Contacts.</p>
        </div>
        <div className="hris-dir-stats" aria-label="Directory summary">
          <span>
            <b>People</b> {vm.totalCount}
          </span>
          <span>
            <b>Active</b> {vm.activeCount}
          </span>
          <span>
            <b>Providers</b> {vm.connectedProviderCount}
          </span>
          <button
            type="button"
            className="hris-dir-stats-help"
            title="These records come from Merge directory sync and are also mirrored into Workspace Contacts. They do not create ShelfMerch logins."
            aria-label="About Employee directory"
          >
            <HelpCircle size={15} />
          </button>
        </div>
      </div>

      {!hasConnection && !vm.hasDisconnectedDirectory && !vm.loading ? (
        <div className="hris-dir-banner" role="status">
          <Users size={16} aria-hidden="true" />
          <p>
            No active directory connection.{" "}
            <Link to="/app/integrations">Connect a provider</Link> and run Sync now.
          </p>
        </div>
      ) : null}

      {vm.hasDisconnectedDirectory && !vm.loading ? (
        <div className="hris-dir-banner hris-dir-banner--disconnected" role="status">
          <Unplug size={16} aria-hidden="true" />
          <p>
            Disconnected
            {vm.disconnectedLastSyncAt
              ? ` — last synced ${formatDirSyncAt(vm.disconnectedLastSyncAt)}`
              : ""}
            . People from the last snapshot are still listed.
          </p>
        </div>
      ) : null}

      <div className="hris-dir-shell">
        <div className="hris-dir-toolbar">
          <label className="search hris-dir-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              placeholder="Search name, email, title, location…"
              value={vm.search}
              onChange={(e) => vm.onSearch(e.target.value)}
            />
          </label>
          {vm.providerOptions.length > 0 ? (
            <div className="hris-dir-filter-wrap">
              <select
                className="hris-dir-filter"
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
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          ) : null}
        </div>

        {vm.loading ? (
          <div className="hris-dir-loading">
            <LoadingState message="Loading directory people…" fullScreen={false} />
          </div>
        ) : null}

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
                  <th>Address</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Provider</th>
                </tr>
              </thead>
              <tbody>
                {vm.employees.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="hris-dir-empty">
                        <h3>No people to show</h3>
                        <p>
                          {hasConnection
                            ? "Try clearing search filters, or sync a connected provider."
                            : "Connect an HRIS provider to import employees."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  vm.employees.map((e, idx) => {
                    const name = tidyName(e.displayName || `${e.firstName} ${e.lastName}`);
                    const status = statusMeta(e.effectiveEmploymentStatus || e.employmentStatus);
                    const location = emptyCell(formatLocationLabel(e.locationName, e.country));
                    const address = emptyCell(e.address);
                    const tone = avatarTone(e.id || name);
                    return (
                      <tr key={e.id} className={idx % 2 === 1 ? "zebra" : undefined}>
                        <td>
                          <div className="hris-dir-person">
                            <span
                              className="hris-dir-avatar"
                              style={{ background: tone.bg, color: tone.fg }}
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
                        <td className="hris-dir-td-muted">{emptyCell(e.workEmail)}</td>
                        <td className="hris-dir-td-muted">{address}</td>
                        <td className="hris-dir-td-muted">{location}</td>
                        <td>
                          <span className={`hris-dir-status hris-dir-status--${status.tone}`}>
                            {status.label}
                          </span>
                        </td>
                        <td>
                          <span className="hris-dir-provider-cell">
                            <span className="hris-dir-provider">{providerLabel(e.provider)}</span>
                            {e.connectionStatus === "disconnected" ? (
                              <span className="hris-dir-status hris-dir-status--disconnected">
                                Disconnected
                              </span>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {!vm.loading && !vm.error && filtered > 0 ? (
          <div className="hris-dir-footer">
            <span>
              Showing {filtered} {filtered === 1 ? "result" : "results"}
              {vm.providerFilter !== "all" ? ` · ${providerLabel(vm.providerFilter)}` : ""}
            </span>
            <Link to="/app/integrations" className="hris-dir-footer-link">
              Manage integrations
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
