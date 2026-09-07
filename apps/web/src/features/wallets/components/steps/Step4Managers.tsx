import { inr } from "@/components/platform/platform-ui";
import { ORG_ROLES, selectedDepartments, wizardTargetAllocation } from "../../types";
import type { StepProps } from "./StepProps";

function managerAction(inviteStatus: string | undefined, hasEmail: boolean) {
  if (inviteStatus === "active") {
    return {
      statusLabel: "Active",
      statusClass: "tag-live",
      title: "Budget will be allocated",
      detail:
        "This manager already has an active account. Additional budget will be added to their wallet and they will be notified by email. Their existing password stays valid.",
      badge: "Active",
    } as const;
  }
  if (hasEmail) {
    return {
      statusLabel: "Pending",
      statusClass: "tag-ready",
      title: "Invitation will be sent",
      detail:
        "They’ll create a password, activate their account, and then see this budget in their wallet.",
      badge: "Invite",
    } as const;
  }
  return {
    statusLabel: "Unassigned",
    statusClass: "tag-draft",
    title: "Add an email to continue",
    detail: "Enter the manager’s work email so ShelfMerch can invite them or allocate budget.",
    badge: "Needed",
  } as const;
}

export function Step4Managers({ state, dispatch }: StepProps) {
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Assign department managers</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          ShelfMerch chooses the right action automatically — invitation for new managers, budget
          notification for active accounts.
        </p>
      </div>

      {selectedDepartments(state.departments).map((d) => {
        const hasEmail = Boolean(d.mgr.email?.trim());
        const action = managerAction(d.mgr.inviteStatus, hasEmail);
        const active = d.mgr.inviteStatus === "active";

        return (
          <div key={d.id} className="mgr-card">
            <div className="mgr-head">
              <div
                className="dc-swatch"
                style={{ background: d.color, width: 30, height: 30, fontSize: 13 }}
              >
                {d.name.charAt(0)}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</div>
              <div className="mb">
                Budget <b>{inr(wizardTargetAllocation(d))}</b>
              </div>
              <span className={`tag ${action.statusClass}`} style={{ marginLeft: 8 }}>
                {action.statusLabel}
              </span>
            </div>
            <div className="mgr-body" style={{ display: "block", padding: 18 }}>
              <div className="row" style={{ gap: 12, marginBottom: 14 }}>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <label className="lbl" htmlFor={`mgr-name-${d.id}`}>
                    Manager name
                  </label>
                  <input
                    id={`mgr-name-${d.id}`}
                    className="inp"
                    value={d.mgr.name}
                    placeholder="Full name"
                    onChange={(e) =>
                      dispatch({ type: "mgrField", id: d.id, field: "name", value: e.target.value })
                    }
                  />
                </div>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <label className="lbl" htmlFor={`mgr-role-${d.id}`}>
                    Role
                  </label>
                  <select
                    id={`mgr-role-${d.id}`}
                    className="inp"
                    value={
                      ORG_ROLES.includes(d.mgr.role as (typeof ORG_ROLES)[number]) ? d.mgr.role : ""
                    }
                    onChange={(e) =>
                      dispatch({ type: "mgrField", id: d.id, field: "role", value: e.target.value })
                    }
                  >
                    {!ORG_ROLES.includes(d.mgr.role as (typeof ORG_ROLES)[number]) && (
                      <option value="">{d.mgr.role || "Select role"}</option>
                    )}
                    {ORG_ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <label className="lbl" htmlFor={`mgr-email-${d.id}`}>
                    Email
                  </label>
                  <input
                    id={`mgr-email-${d.id}`}
                    className="inp"
                    type="email"
                    value={d.mgr.email}
                    placeholder="name@company.net"
                    disabled={active}
                    onChange={(e) =>
                      dispatch({ type: "mgrField", id: d.id, field: "email", value: e.target.value })
                    }
                  />
                </div>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <label className="lbl" htmlFor={`mgr-mobile-${d.id}`}>
                    Mobile
                  </label>
                  <input
                    id={`mgr-mobile-${d.id}`}
                    className="inp"
                    value={d.mgr.mobile}
                    placeholder="+91 ..."
                    onChange={(e) =>
                      dispatch({
                        type: "mgrField",
                        id: d.id,
                        field: "mobile",
                        value: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                padding: "14px 18px",
                borderTop: "1px solid var(--line)",
                background: "var(--surface-2)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{action.title}</div>
                <div className="mut3" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
                  {action.detail}
                </div>
              </div>
              <span className={`tag ${action.statusClass}`} style={{ flexShrink: 0 }}>
                {action.badge}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
