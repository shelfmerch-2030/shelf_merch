import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useContacts, useDeleteContact, useUpdateContact } from "../model";
import type { UiContact } from "../model";
import { contactToForm, ROLES, contactWorkerStatus } from "../types";

export type SortKey = "email" | "name";
export type SortDir = "asc" | "desc";
export type FilterOpen = "role" | "dept" | "sort" | "status" | null;
export type WorkerStatusFilter = "all" | "active" | "invited" | "inactive";

export type RoleCounts = { admins: number; senders: number; members: number };

export type ContactsVm = {
  isLoading: boolean;
  errorMessage: string | null;
  query: string;
  roleFilter: string;
  departmentFilter: string;
  departmentOptions: string[];
  filterOpen: FilterOpen;
  sortKey: SortKey;
  sortDir: SortDir;
  statusFilter: WorkerStatusFilter;
  counts: RoleCounts;
  filtered: UiContact[];
  hasContacts: boolean;
  selected: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  isRolePending: boolean;
  isDeletePending: boolean;
  canManageContacts: boolean;
  canManageContactRoles: boolean;
  adding: boolean;
  addInitialTab: "manual" | "csv";
  editing: UiContact | null;
  onQuery: (query: string) => void;
  onRoleFilter: (role: string) => void;
  onDepartmentFilter: (department: string) => void;
  onStatusFilter: (status: WorkerStatusFilter) => void;
  onSortDir: (dir: SortDir) => void;
  onFilterOpenChange: (open: FilterOpen) => void;
  onToggleSort: (key: SortKey) => void;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onRoleChange: (contact: UiContact, role: string) => void;
  onDelete: (contact: UiContact) => void;
  deleting: UiContact | null;
  onDeleteOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  onAddOpen: (tab?: "manual" | "csv") => void;
  onAddOpenChange: (open: boolean) => void;
  onEdit: (contact: UiContact) => void;
  onEditOpenChange: (open: boolean) => void;
  onRestrict: () => void;
  onFooterLink: (link: string) => void;
  contactsAddedOpen: boolean;
  contactsAddedCount: number;
  onContactsAddedSuccess: (count: number) => void;
  onContactsAddedPrimary: () => void;
  onContactsAddedLater: () => void;
  onConnectIntegration: () => void;
};

function roleCounts(contacts: UiContact[]): RoleCounts {
  let admins = 0;
  let senders = 0;
  let members = 0;
  for (const c of contacts) {
    if (c.role === "Owner" || c.role === "Admin") admins += 1;
    else if (c.role === "Sender") senders += 1;
    else members += 1;
  }
  return { admins, senders, members };
}

function sortContacts(list: UiContact[], key: SortKey, dir: SortDir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = key === "email" ? a.email : a.name;
    const bv = key === "email" ? b.email : b.name;
    return av.localeCompare(bv, undefined, { sensitivity: "base" }) * mul;
  });
}

/** Controller for the contacts screen: list query, table state, role mutation, dialogs. */
export function useContactsController(): ContactsVm {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { canManageContacts, canManageUsers } = useTenantAccess();
  const { data: contacts, isLoading, isError, error } = useContacts(workspace.data?.contacts);
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addInitialTab, setAddInitialTab] = useState<"manual" | "csv">("manual");
  const [editing, setEditing] = useState<UiContact | null>(null);
  const [deleting, setDeleting] = useState<UiContact | null>(null);
  const [filterOpen, setFilterOpen] = useState<FilterOpen>(null);
  const [statusFilter, setStatusFilter] = useState<WorkerStatusFilter>("all");
  const [contactsAddedOpen, setContactsAddedOpen] = useState(false);
  const [contactsAddedCount, setContactsAddedCount] = useState(0);

  const counts = useMemo(() => roleCounts(contacts ?? []), [contacts]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts ?? []) {
      const dept = (c.department || "").trim();
      if (dept) set.add(dept);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = contacts ?? [];
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
      );
    }
    if (roleFilter !== "all") {
      list = list.filter((c) => c.role === roleFilter);
    }
    if (departmentFilter !== "all") {
      list = list.filter(
        (c) => (c.department || "").trim().toLowerCase() === departmentFilter.toLowerCase(),
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((c) => contactWorkerStatus(c).key === statusFilter);
    }
    return sortContacts(list, sortKey, sortDir);
  }, [contacts, query, roleFilter, departmentFilter, statusFilter, sortKey, sortDir]);

  const allSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id) || c.role === "Owner");
  const someSelected = filtered.some((c) => selected.has(c.id));

  function onToggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function onToggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.filter((c) => c.role !== "Owner").map((c) => c.id)));
  }

  function onToggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onRoleChange(contact: UiContact, role: string) {
    if (!canManageUsers()) return;
    if (contact.role === "Owner" || role === contact.role) return;
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        values: { ...contactToForm(contact), role: role as (typeof ROLES)[number] },
      });
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update role");
    }
  }

  function onDelete(contact: UiContact) {
    if (contact.role === "Owner") {
      toast.error("Workspace owner cannot be deleted");
      return;
    }
    setDeleting(contact);
  }

  async function onDeleteConfirm() {
    if (!deleting || deleting.role === "Owner") return;
    const contact = deleting;
    try {
      await deleteContact.mutateAsync(contact.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
      if (editing?.id === contact.id) setEditing(null);
      setDeleting(null);
      toast.success("Contact deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete contact");
    }
  }

  return {
    isLoading: isLoading && !contacts,
    errorMessage: isError
      ? error instanceof Error
        ? error.message
        : "Could not load contacts"
      : null,
    query,
    roleFilter,
    departmentFilter,
    departmentOptions,
    filterOpen,
    sortKey,
    sortDir,
    statusFilter,
    counts,
    filtered,
    hasContacts: (contacts?.length ?? 0) > 0,
    selected,
    allSelected,
    someSelected,
    isRolePending: updateContact.isPending,
    isDeletePending: deleteContact.isPending,
    canManageContacts: canManageContacts(),
    canManageContactRoles: canManageUsers(),
    adding,
    addInitialTab,
    editing,
    deleting,
    onQuery: setQuery,
    onRoleFilter: (role) => {
      setRoleFilter(role);
      setFilterOpen(null);
    },
    onDepartmentFilter: (department) => {
      setDepartmentFilter(department);
      setFilterOpen(null);
    },
    onStatusFilter: (status) => {
      setStatusFilter(status);
      setFilterOpen(null);
    },
    onSortDir: (dir) => {
      setSortKey("name");
      setSortDir(dir);
      setFilterOpen(null);
    },
    onFilterOpenChange: setFilterOpen,
    onToggleSort,
    onToggleAll,
    onToggleOne,
    onRoleChange,
    onDelete,
    onAddOpen: (tab: "manual" | "csv" = "manual") => {
      setAddInitialTab(tab);
      setAdding(true);
    },
    onAddOpenChange: setAdding,
    onEdit: setEditing,
    onEditOpenChange: (open) => {
      if (!open) setEditing(null);
    },
    onDeleteOpenChange: (open) => {
      if (!open) setDeleting(null);
    },
    onDeleteConfirm,
    onRestrict: () => toast.message("Contact restrictions — coming soon"),
    onFooterLink: (link) => toast.message(`${link} — coming soon`),
    contactsAddedOpen,
    contactsAddedCount,
    onContactsAddedSuccess: (count) => {
      setContactsAddedCount(count);
      setContactsAddedOpen(true);
    },
    onContactsAddedPrimary: () => {
      setContactsAddedOpen(false);
      navigate("/app/campaigns");
    },
    onContactsAddedLater: () => {
      setContactsAddedOpen(false);
    },
    onConnectIntegration: () => {
      navigate("/app/integrations");
    },
  };
}
