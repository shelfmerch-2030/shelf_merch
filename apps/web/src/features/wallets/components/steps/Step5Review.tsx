import { inr } from "@/components/platform/platform-ui";
import {
  fmtDate,
  allocationFromPool,
  isAllocateEditFlow,
  remainingWalletBalanceForWizard,
  selectedDepartments,
  wizardTargetAllocation,
} from "../../types";
import { Donut } from "../Donut";
import type { StepProps } from "./StepProps";

export function Step5Review({ state, dispatch, account }: StepProps & { account: string }) {
  const o = state.wallet;
  const total = o.amount;
  const depts = selectedDepartments(state.departments);
  const isEdit = isAllocateEditFlow(state.flow, state.mode);
  const fromPool = allocationFromPool(state.departments);
  const rem = remainingWalletBalanceForWizard(total, state.departments, {
    flow: state.flow,
    mode: state.mode,
    unallocatedAtStart: state.unallocatedAtStart,
  });

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18 }}>Review allocation</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Confirm departments, budgets and managers before finishing.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <div className="card stat">
          <div className="k">{isEdit ? "Unallocated wallet" : "Total budget"}</div>
          <div className="v num">{inr(isEdit ? (state.unallocatedAtStart ?? total) : total)}</div>
        </div>
        <div className="card stat">
          <div className="k">{isEdit ? "Adding from wallet" : "Allocated"}</div>
          <div className="v num">
            {inr(isEdit ? fromPool : depts.reduce((s, d) => s + wizardTargetAllocation(d), 0))}
          </div>
        </div>
        <div className="card stat">
          <div className="k">Remaining</div>
          <div className="v num" style={{ color: rem < 0 ? "var(--danger)" : "var(--brand-d)" }}>
            {inr(rem)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>Wallet</b>
            </div>
            <ReviewRow label="Organization" value={account} />
            <ReviewRow label="Wallet" value={o.name} />
            <ReviewRow label="Total budget" value={inr(total)} accent last={false} />
            <ReviewRow label="Validity" value={`${fmtDate(o.start)} → ${fmtDate(o.end)}`} last />
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <b style={{ fontSize: 14 }}>Departments &amp; managers</b>
              <span
                className="lnk"
                role="button"
                tabIndex={0}
                onClick={() => dispatch({ type: "goto", step: 2 })}
              >
                Edit
              </span>
            </div>
            {depts.map((d) => (
              <div key={d.id} className="rev-dept">
                <span className="sw" style={{ background: d.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                  <div className="mut3" style={{ fontSize: 11.5 }}>
                    {d.mgr.name
                      ? `${d.mgr.name}${d.mgr.email ? ` · ${d.mgr.email}` : ""}`
                      : "No manager assigned"}
                    {d.mgr.inviteStatus === "active"
                      ? " · Active account — extra budget only, no new password"
                      : d.mgr.email
                        ? d.mgr.invite !== false
                          ? " · Invitation will be sent"
                          : " · Assigned without invite"
                        : ""}
                  </div>
                </div>
                <span className="num" style={{ fontWeight: 700, fontSize: 13 }}>
                  {inr(wizardTargetAllocation(d))}
                </span>
                <span className="pct-pill">
                  {total ? Math.round((wizardTargetAllocation(d) / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <aside className="card" style={{ padding: 20 }}>
          <div
            className="mut3"
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 6,
            }}
          >
            Budget distribution
          </div>
          <Donut
            segments={depts.map((d) => ({ color: d.color, allocated: wizardTargetAllocation(d) }))}
            centerValue={depts.length}
            centerLabel="Departments"
            centerFontSize={26}
          />
          <div style={{ marginTop: 6 }}>
            {depts.map((d) => (
              <div
                key={d.id}
                className="row"
                style={{ justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}
              >
                <span className="row" style={{ gap: 7, alignItems: "center" }}>
                  <span
                    className="lc"
                    style={{ width: 10, height: 10, borderRadius: 3, background: d.color }}
                  />
                  {d.name}
                </span>
                <b>{total ? Math.round((wizardTargetAllocation(d) / total) * 100) : 0}%</b>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

function ReviewRow({
  label,
  value,
  accent,
  last,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        padding: "7px 0",
        borderBottom: last ? "none" : "1px solid var(--line)",
      }}
    >
      <span className="muted" style={{ fontSize: 13 }}>
        {label}
      </span>
      <span
        style={{
          fontWeight: accent ? 700 : 600,
          fontSize: 13,
          color: accent ? "var(--brand-d)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
