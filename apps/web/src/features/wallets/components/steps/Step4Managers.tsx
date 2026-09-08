import { inr } from "@/components/platform/platform-ui";
import { ORG_ROLES, selectedDepartments, wizardTargetAllocation } from "../../types";
import type { StepProps } from "./StepProps";

function managerFooter(inviteStatus: string | undefined, hasEmail: boolean) {
  if (inviteStatus === "active") {
    return {
      title: "Budget will be allocated",
      detail:
        "This manager already has an active account. Extra budget is added to their wallet. They keep the same password and do not set a new one.",
      badge: "Active",
      badgeClass: "tag-live",
      showInviteToggle: false,
    } as const;
  }
  if (hasEmail) {
    return {
      title: "Send invitation",
      detail: "Email the manager an invite to activate their account",
      badge: "Invite",
      badgeClass: "tag-ready",
      showInviteToggle: true,
    } as const;
  }
  return {
    title: "Add an email to continue",
    detail: "Enter the manager’s work email to invite them or allocate budget.",
    badge: "Needed",
    badgeClass: "tag-draft",
    showInviteToggle: false,
  } as const;
}

export function Step4Managers({ state, dispatch }: StepProps) {
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Assign department managers</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          New managers get an invitation. Active managers keep their login — only additional budget
          is added.
        </p>
      </div>

      {selectedDepartments(state.departments).map((d) => {
        const hasEmail = Boolean(d.mgr.email?.trim());
        const active = d.mgr.inviteStatus === "active";
        const footer = managerFooter(d.mgr.inviteStatus, hasEmail);
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
            <span className={`tag ${footer.badgeClass}`} style={{ marginLeft: 8 }}>
              {footer.badge}
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
                <input
                  id={`mgr-role-${d.id}`}
                  className="inp"
                  list={`mgr-role-options-${d.id}`}
                  value={d.mgr.role}
                  placeholder="Select or type a role"
                  autoComplete="off"
                  onChange={(e) =>
                    dispatch({ type: "mgrField", id: d.id, field: "role", value: e.target.value })
                  }
                />
                <datalist id={`mgr-role-options-${d.id}`}>
                  {ORG_ROLES.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
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
                    dispatch({ type: "mgrField", id: d.id, field: "mobile", value: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              padding: "14px 18px",
              borderTop: "1px solid var(--line)",
              background: "var(--surface-2)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{footer.title}</div>
              <div className="mut3" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
                {footer.detail}
              </div>
            </div>
            {footer.showInviteToggle ? (
              <button
                type="button"
                role="switch"
                aria-checked={d.mgr.invite !== false}
                aria-label={`Send invitation to ${d.name} manager`}
                className={`switch ${d.mgr.invite !== false ? "on" : ""}`}
                onClick={() => dispatch({ type: "toggleInvite", id: d.id })}
              />
            ) : (
              <span className={`tag ${footer.badgeClass}`} style={{ flexShrink: 0 }}>
                {footer.badge}
              </span>
            )}
          </div>
        </div>
        );
      })}
    </>
  );
}
