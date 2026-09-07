import {
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpDown,
  Ban,
  ChevronDown,
  CircleHelp,
  Plus,
  Search,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/LoadingState";
import { ContactFormDialog } from "../ContactFormDialog";
import { ROLES } from "../types";
import type { UiContact } from "../model";
import {
  type ContactsVm,
  type SortDir,
  type SortKey,
} from "../controllers/useContactsController";
import "../contacts-page.css";

const FOOTER_LINKS = [
  "Terms of use",
  "Cookie preferences",
  "Accessibility support",
  "Explore features",
  "Help center",
  "Contact us",
];

const FILTER_OPTIONS: [string, string][] = [
  ["all", "All roles"],
  ["Owner", "Owner"],
  ["Admin", "Admin"],
  ["Sender", "Sender"],
  ["Member", "Member"],
  ["Non-Member", "Non-Member"],
];

const SORT_OPTIONS: [SortDir, string][] = [
  ["asc", "A–Z"],
  ["desc", "Z–A"],
];

function permissionLabel(role: string) {
  if (role === "Owner") return "Owner";
  if (role === "Admin") return "Admin";
  if (role === "Sender") return "Sender";
  if (role === "Member") return "Member";
  return "Non-Member";
}

function roleTone(role: string) {
  if (role === "Owner") return "owner";
  if (role === "Admin") return "admin";
  if (role === "Sender") return "sender";
  return "member";
}

function avatarTone(seed: string) {
  const tones = [
    { bg: "#dbeafe", fg: "#111827" },
    { bg: "#fef3c7", fg: "#111827" },
    { bg: "#e0e7ff", fg: "#111827" },
    { bg: "#dcfce7", fg: "#111827" },
    { bg: "#fce7f3", fg: "#111827" },
    { bg: "#e0f2fe", fg: "#111827" },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * 17) % tones.length;
  return tones[hash];
}

function initials(contact: UiContact) {
  const name = (contact.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  }
  return (contact.email[0] ?? "?").toUpperCase();
}

function emptyCell(value?: string) {
  const v = (value ?? "").trim();
  return v ? v : "—";
}

function SortHead({
  label,
  col,
  className,
  sortKey,
  sortDir,
  onToggleSort,
}: {
  label: string;
  col?: SortKey;
  className?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
}) {
  const active = col && sortKey === col;
  return (
    <th className={className}>
      {col ? (
        <button
          type="button"
          className="ct-th-sort"
          onClick={() => onToggleSort(col)}
          aria-label={`Sort by ${label} ${active && sortDir === "asc" ? "descending" : "ascending"}`}
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUpAZ size={12} className="on" aria-hidden="true" />
            ) : (
              <ArrowDownAZ size={12} className="on" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown size={12} aria-hidden="true" />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

/** Contacts screen: role summary, search/filter toolbar, and contacts table. */
export function ContactsView(vm: ContactsVm) {
  const hasActiveFilters =
    Boolean(vm.query) || vm.roleFilter !== "all" || vm.departmentFilter !== "all";

  return (
    <>
      <div className="contacts-page">
        <header className="ct-hero">
          <h1>All Contacts</h1>
          <div className="ct-hero__actions">
            <div className="ct-stats" aria-label="Contact role summary">
              <div className="ct-stats__item">
                <span className="ct-stats__label">Admins</span>
                <span className="ct-stats__value">{vm.counts.admins}</span>
              </div>
              <div className="ct-stats__item">
                <span className="ct-stats__label">Senders</span>
                <span className="ct-stats__value">{vm.counts.senders}</span>
              </div>
              <div className="ct-stats__item">
                <span className="ct-stats__label">Members</span>
                <span className="ct-stats__value">{vm.counts.members}</span>
              </div>
              <button
                type="button"
                className="ct-stats__help"
                aria-label="About contact roles"
                onClick={() =>
                  toast.message(
                    "Admins manage settings, Senders can send gifts, Members can receive gifts.",
                  )
                }
              >
                <CircleHelp size={16} aria-hidden="true" />
              </button>
            </div>
            {vm.canManageContacts ? (
              <button type="button" className="ct-hero__cta" onClick={() => vm.onAddOpen("manual")}>
                <Plus size={16} aria-hidden="true" />
                Add contacts
              </button>
            ) : null}
          </div>
        </header>

        {vm.isLoading ? (
          <LoadingState message="Loading contacts…" fullScreen={false} variant="list" />
        ) : vm.errorMessage ? (
          <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
            {vm.errorMessage}
          </div>
        ) : (
          <section className="ct-panel">
            <div className="ct-panel__toolbar">
              <label className="ct-search">
                <Search size={15} aria-hidden="true" />
                <input
                  aria-label="Search contacts"
                  placeholder="Search by name or email"
                  value={vm.query}
                  onChange={(e) => vm.onQuery(e.target.value)}
                />
              </label>

              <div className="ct-filter-wrap">
                <button
                  type="button"
                  className="ct-filter-btn"
                  aria-expanded={vm.filterOpen === "sort"}
                  onClick={() =>
                    vm.onFilterOpenChange(vm.filterOpen === "sort" ? null : "sort")
                  }
                >
                  {vm.sortDir === "asc" ? "A–Z" : "Z–A"}
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {vm.filterOpen === "sort" && (
                  <div className="ct-filter-menu" role="menu">
                    {SORT_OPTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="menuitem"
                        className={vm.sortKey === "name" && vm.sortDir === value ? "on" : ""}
                        onClick={() => vm.onSortDir(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="ct-filter-wrap">
                <button
                  type="button"
                  className="ct-filter-btn"
                  aria-expanded={vm.filterOpen === "role"}
                  onClick={() =>
                    vm.onFilterOpenChange(vm.filterOpen === "role" ? null : "role")
                  }
                >
                  {vm.roleFilter === "all" ? "All roles" : vm.roleFilter}
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {vm.filterOpen === "role" && (
                  <div className="ct-filter-menu" role="menu">
                    {FILTER_OPTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="menuitem"
                        className={vm.roleFilter === value ? "on" : ""}
                        onClick={() => vm.onRoleFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {vm.canManageContactRoles ? (
                <div className="ct-filter-wrap">
                  <button
                    type="button"
                    className="ct-filter-btn"
                    aria-expanded={vm.filterOpen === "dept"}
                    onClick={() =>
                      vm.onFilterOpenChange(vm.filterOpen === "dept" ? null : "dept")
                    }
                  >
                    {vm.departmentFilter === "all" ? "All departments" : vm.departmentFilter}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {vm.filterOpen === "dept" && (
                    <div className="ct-filter-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={vm.departmentFilter === "all" ? "on" : ""}
                        onClick={() => vm.onDepartmentFilter("all")}
                      >
                        All departments
                      </button>
                      {vm.departmentOptions.map((dept) => (
                        <button
                          key={dept}
                          type="button"
                          role="menuitem"
                          className={vm.departmentFilter === dept ? "on" : ""}
                          onClick={() => vm.onDepartmentFilter(dept)}
                        >
                          {dept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {vm.filtered.length === 0 ? (
              <div className="ct-empty">
                <h3>{hasActiveFilters ? "No matching contacts" : "No contacts yet"}</h3>
                <p>
                  {hasActiveFilters
                    ? "Try a different search or filter."
                    : "Add people to start sending gifts and points."}
                </p>
              </div>
            ) : (
              <div className="ct-table-wrap">
                <table className="ct-table">
                  <thead>
                    <tr>
                      <th className="ct-th-check">
                        <input
                          type="checkbox"
                          aria-label="Select all contacts"
                          checked={vm.allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = vm.someSelected && !vm.allSelected;
                          }}
                          onChange={vm.onToggleAll}
                        />
                      </th>
                      <SortHead
                        label="Person"
                        col="name"
                        sortKey={vm.sortKey}
                        sortDir={vm.sortDir}
                        onToggleSort={vm.onToggleSort}
                      />
                      <SortHead
                        label="Email"
                        col="email"
                        sortKey={vm.sortKey}
                        sortDir={vm.sortDir}
                        onToggleSort={vm.onToggleSort}
                      />
                      <th>Role</th>
                      <th>Dept</th>
                      <th>Location</th>
                      <th className="ct-th-actions" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {vm.filtered.map((c: UiContact) => {
                      const tone = avatarTone(c.id || c.email || c.name);
                      return (
                        <tr key={c.id}>
                          <td className="ct-td-check">
                            <input
                              type="checkbox"
                              aria-label={`Select ${c.name || c.email}`}
                              checked={vm.selected.has(c.id)}
                              disabled={c.role === "Owner"}
                              onChange={() => vm.onToggleOne(c.id)}
                            />
                          </td>
                          <td>
                            <div className="ct-person">
                              <span
                                className="ct-avatar"
                                style={{ backgroundColor: tone.bg, color: tone.fg }}
                                aria-hidden="true"
                              >
                                {initials(c)}
                              </span>
                              <span className="ct-name">{emptyCell(c.name)}</span>
                            </div>
                          </td>
                          <td>
                            <span className="ct-email" title={c.email}>
                              {c.email}
                            </span>
                          </td>
                          <td>
                            {c.role === "Owner" || !vm.canManageContactRoles ? (
                              <span className={`ct-chip ct-chip--${roleTone(c.role)}`}>
                                {permissionLabel(c.role)}
                              </span>
                            ) : (
                              <select
                                className="ct-role-select"
                                value={c.role}
                                disabled={vm.isRolePending}
                                onChange={(e) => vm.onRoleChange(c, e.target.value)}
                              >
                                {ROLES.filter((r) => r !== "Owner").map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="ct-muted">{emptyCell(c.department)}</td>
                          <td className="ct-muted">{emptyCell(c.loc)}</td>
                          <td className="ct-td-actions">
                            {vm.canManageContacts ? (
                              <>
                                <button
                                  type="button"
                                  className="ct-row-action"
                                  aria-label={`Restrict ${c.name || c.email}`}
                                  disabled={c.role === "Owner"}
                                  onClick={vm.onRestrict}
                                >
                                  <Ban size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="ct-row-action"
                                  aria-label={`Edit ${c.name || c.email}`}
                                  onClick={() => vm.onEdit(c)}
                                >
                                  <SquareArrowOutUpRight size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="ct-row-action ct-row-action--danger"
                                  aria-label={`Delete ${c.name || c.email}`}
                                  disabled={c.role === "Owner" || vm.isDeletePending}
                                  onClick={() => vm.onDelete(c)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <footer className="ct-footer">
          <span>© Powered by Shelf Merch</span>
          <nav aria-label="Footer">
            {FOOTER_LINKS.map((link) => (
              <button key={link} type="button" onClick={() => vm.onFooterLink(link)}>
                {link}
              </button>
            ))}
          </nav>
        </footer>
      </div>

      <ContactFormDialog
        open={vm.adding}
        onOpenChange={vm.onAddOpenChange}
        mode="add"
        canImportContacts
        canManageContactRoles={vm.canManageContactRoles}
        initialTab={vm.addInitialTab}
      />
      <ContactFormDialog
        open={vm.editing !== null}
        onOpenChange={vm.onEditOpenChange}
        mode="edit"
        contact={vm.editing ?? undefined}
        canManageContactRoles={vm.canManageContactRoles}
      />
    </>
  );
}
