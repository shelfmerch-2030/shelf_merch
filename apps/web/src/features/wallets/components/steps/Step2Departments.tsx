import { useState, type ComponentType } from "react";
import {
  BarChart3,
  Code2,
  Coins,
  Headphones,
  LayoutGrid,
  Megaphone,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/components/platform/platform-ui";
import {
  deptPaletteColor,
  isDeptSelected,
  ORG_SUGG,
  selectedDepartments,
  type WizardDept,
} from "../../types";
import { DepartmentModal } from "../DepartmentModal";
import type { StepProps } from "./StepProps";

type DeptSuggestMeta = {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  tone: string;
};

const DEPT_SUGGEST_META: Record<(typeof ORG_SUGG)[number], DeptSuggestMeta> = {
  Marketing: { Icon: Megaphone, tone: "violet" },
  Sales: { Icon: BarChart3, tone: "sky" },
  HR: { Icon: Users, tone: "emerald" },
  Admin: { Icon: Settings, tone: "orange" },
  "Customer Success": { Icon: Headphones, tone: "purple" },
  Engineering: { Icon: Code2, tone: "blue" },
  Finance: { Icon: Coins, tone: "amber" },
  Operations: { Icon: LayoutGrid, tone: "rose" },
};

export function Step2Departments({ state, dispatch }: StepProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WizardDept | null>(null);
  const isEdit = state.flow === "allocate";

  const used = state.departments.map((d) => d.name.toLowerCase());
  const selectedCount = selectedDepartments(state.departments).length;

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(d: WizardDept) {
    setEditing(d);
    setModalOpen(true);
  }
  function handleDelete(d: WizardDept) {
    if (state.departments.length <= 1) {
      toast.error("Keep at least one department");
      return;
    }
    dispatch({ type: "deleteDept", id: d.id });
  }
  function handleToggleSelect(d: WizardDept) {
    dispatch({ type: "toggleDeptSelect", id: d.id });
  }
  function handleSave(values: { name: string; desc: string; users: number }) {
    if (editing) {
      dispatch({ type: "updateDept", id: editing.id, ...values });
    } else {
      dispatch({ type: "addDept", ...values });
    }
  }

  return (
    <div className="dept-picker">
      <section className="dept-picker-card">
        <header className="dept-picker-head">
          <div className="dept-picker-head__icon" aria-hidden="true">
            <Users size={22} strokeWidth={2} />
          </div>
          <div className="dept-picker-head__copy">
            <h3>{isEdit ? "Select departments" : "Create departments"}</h3>
            <p>
              {isEdit
                ? "Choose cost centers for this allocation round."
                : "Add teams that will run campaigns and order swag."}
            </p>
          </div>
          <span className="dept-picker-head__badge">
            {state.departments.length} department{state.departments.length === 1 ? "" : "s"}
          </span>
        </header>

        <div className="dept-picker-suggest">
          <span className="dept-picker-suggest__label">Suggestions</span>
          <div className="dept-picker-suggest__grid">
            {ORG_SUGG.map((s) => {
              const taken = used.includes(s.toLowerCase());
              const { Icon, tone } = DEPT_SUGGEST_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  className={`dept-picker-suggest__card${taken ? " is-added" : ""}`}
                  disabled={taken}
                  onClick={() => {
                    dispatch({ type: "quickAddDept", name: s });
                    toast.success(`${s} added`);
                  }}
                >
                  <span className={`dept-picker-suggest__icon dept-picker-suggest__icon--${tone}`} aria-hidden>
                    <Icon size={15} strokeWidth={2.1} />
                  </span>
                  <span className="dept-picker-suggest__name">{s}</span>
                  <span className={`dept-picker-suggest__radio${taken ? " is-on" : ""}`} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="dept-picker-shell">
        <div className="dept-picker-toolbar">
          <span className="dept-picker-count">
            <b>{selectedCount}</b> of {state.departments.length} selected
          </span>
          <button type="button" className="btn btn-soft btn-sm" onClick={openAdd}>
            <Plus size={15} />
            Add department
          </button>
        </div>

        <div className="dept-picker-table-wrap">
          <table className="dept-picker-table">
            <thead>
              <tr>
                <th className="dept-picker-th-check" aria-label="Select" />
                <th className="dept-picker-th-name">Department</th>
                <th className="dept-picker-th-users">Users</th>
                {isEdit ? <th className="dept-picker-th-num">Current budget</th> : null}
                <th className="dept-picker-th-actions" aria-label="Actions" />
                <th className="dept-picker-th-spacer" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {state.departments.map((d, i) => {
                const selected = isDeptSelected(d);
                const color = deptPaletteColor(i);
                const currentBudget = isEdit ? (d.seedAllocated ?? 0) : d.allocated;
                return (
                  <tr
                    key={d.id}
                    className={`dept-picker-row${selected ? " is-selected" : ""}`}
                    onClick={() => handleToggleSelect(d)}
                  >
                    <td className="dept-picker-td-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="dept-picker-check"
                        checked={selected}
                        aria-label={`Select ${d.name}`}
                        onChange={() => handleToggleSelect(d)}
                      />
                    </td>
                    <td className="dept-picker-td-name">
                      <div className="dept-picker-name">
                        <span
                          className="dept-dot dept-dot--lg"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <div className="dept-picker-name__text">
                          <span className="dept-picker-title">{d.name}</span>
                          {d.desc ? <span className="dept-picker-sub">{d.desc}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td className="dept-picker-td-users dept-picker-td-muted">{d.users}</td>
                    {isEdit ? (
                      <td
                        className={`dept-picker-td-num num${currentBudget > 0 ? "" : " dept-picker-td-muted"}`}
                      >
                        {currentBudget > 0 ? inr(currentBudget) : "Not yet assigned"}
                      </td>
                    ) : null}
                    <td className="dept-picker-td-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="contacts-row-action"
                        aria-label={`Edit ${d.name}`}
                        onClick={() => openEdit(d)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="contacts-row-action"
                        aria-label={`Remove ${d.name}`}
                        onClick={() => handleDelete(d)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                    <td className="dept-picker-td-spacer" aria-hidden />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedCount === 0 ? (
          <p className="dept-picker-hint muted">Select at least one department to continue.</p>
        ) : null}
      </div>

      <DepartmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        dept={editing ?? undefined}
        onSave={handleSave}
      />
    </div>
  );
}
