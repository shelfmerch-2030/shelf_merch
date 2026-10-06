import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, CircleDollarSign, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/components/platform/platform-ui";
import { PageHeader } from "@/components/tenant/PageHeader";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import {
  fmtDate,
  deptPaletteColor,
  remainingWalletBalance,
  totalAllocatedAmount,
  committedDepartments,
  type OrgSnapshot,
} from "../types";
import { Donut } from "./Donut";
import { WalletHistory } from "./WalletHistory";
import { EmptyBudgetState } from "./budget/EmptyBudgetState";
import { RequestTopupDialog } from "./budget/RequestTopupDialog";
import { WalletDetailsDialog } from "./WalletDetailsDialog";

function ManagerInviteBadge({ status }: { status: "unassigned" | "pending" | "active" }) {
  if (status === "active") {
    return (
      <span className="tag tag-live">
        <span className="dot" />
        Active
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="tag tag-warn">
        <span className="dot" />
        Invite pending
      </span>
    );
  }
  return <span className="tag tag-draft">Not assigned</span>;
}

/** Company-admin landing: organization budget overview + departments table. */
export function OrgDashboard({
  account,
  org,
  hasBudget,
  onSetup,
  onAllocate,
  openTopupOnMount,
}: {
  account: string;
  org: OrgSnapshot;
  hasBudget: boolean;
  onSetup: () => void;
  onAllocate: (step?: number) => void;
  openTopupOnMount?: boolean;
}) {
  const { canWrite } = useTenantAccess();
  const canManageBudget = canWrite("wallets");
  const [topupOpen, setTopupOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const walletId = org.wallet.id;
  const walletContactInitial = useMemo(
    () => ({
      address: org.wallet.address || "",
      pinCode: org.wallet.pinCode || "",
      mobileNumber: org.wallet.mobileNumber || "",
      gstin: org.wallet.gstin || "",
    }),
    [org.wallet.address, org.wallet.gstin, org.wallet.mobileNumber, org.wallet.pinCode],
  );

  useEffect(() => {
    if (openTopupOnMount && walletId) {
      setTopupOpen(true);
    }
  }, [openTopupOnMount, walletId]);

  if (!org.active && !hasBudget) {
    return (
      <>
        <PageHeader
          title="Budget"
          subtitle="Set up and manage your organization's merchandise budget."
        />
        <EmptyBudgetState onSetup={onSetup} disabled={!canManageBudget} />
      </>
    );
  }

  const o = org.wallet;
  const fundingPending = o.fundingApproval === "pending";
  const total = o.amount;
  const depts = committedDepartments(org.departments);
  const alloc = totalAllocatedAmount(depts);
  const rem = o.unallocated ?? remainingWalletBalance(total, org.departments);
  const budgetLive = o.status === "active";
  const managersActive = depts.filter((d) => d.mgr.inviteStatus === "active").length;
  const managersPending = depts.filter((d) => d.mgr.inviteStatus === "pending").length;
  // Allocate whenever credited balance exists — pending top-ups must not block it.
  const canAllocate = Boolean(walletId) && total > 0;
  const needsAllocation = canAllocate && !budgetLive;

  function handleAllocateClick() {
    if (total <= 0) {
      toast.message("No budget balance yet", {
        description: "Add or wait for funded balance before allocating across departments.",
      });
      return;
    }
    onAllocate(2);
  }

  return (
    <>
      <PageHeader
        title="Budget"
        subtitle={`${o.name} · Organization merchandise budget · ${account}`}
        actions={
          canManageBudget ? (
            <div className="row" style={{ gap: 8 }}>
              {walletId ? (
                <button type="button" className="btn btn-ghost" onClick={() => setDetailsOpen(true)}>
                  <Pencil size={16} /> Wallet details
                </button>
              ) : null}
              {walletId && !fundingPending ? (
                <button type="button" className="btn btn-brand" onClick={() => setTopupOpen(true)}>
                  <Plus size={16} /> Request top-up
                </button>
              ) : null}
              {o.fundingFileUrl ? (
                <a
                  href={o.fundingFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost"
                >
                  <ArrowDownToLine size={16} /> Download agreement
                </a>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {fundingPending && (
        <div className="banner" style={{ marginBottom: 18 }}>
          <CircleDollarSign size={16} aria-hidden="true" />
          <div>
            <b>Funding request submitted for review.</b>{" "}
            {o.requestedAmount ? (
              <>
                {inr(o.requestedAmount)} will be added to your organization budget once ShelfMerch
                approves your {o.docType || "document"} {o.docNumber ? `(${o.docNumber})` : ""}.
                {/* {total > 0 ? (
                  <>
                    {" "}
                    You can still <b>Allocate budget</b> from your current balance.
                  </>
                ) : null} */}
              </>
            ) : (
              <>Your funding request is awaiting ShelfMerch approval.</>
            )}
          </div>
        </div>
      )}

      {needsAllocation && canManageBudget && (
        <div className="banner" style={{ marginBottom: 18 }}>
          <CircleDollarSign size={16} aria-hidden="true" />
          <div>
            <b>Budget funded — allocation not finished.</b> Split your balance across departments
            and assign managers.{" "}
            <span className="lnk" role="button" tabIndex={0} onClick={handleAllocateClick}>
              Allocate budget
            </span>
          </div>
        </div>
      )}

      <div className="card wallet-balance-strip" style={{ padding: 0, marginBottom: 18 }}>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 22px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div>
            <div
              className="mut3"
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".04em",
              }}
            >
              Budget balance
            </div>
            <div className="wallet-name-title">{o.name}</div>
          </div>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            {budgetLive ? (
              <span className="tag tag-live">
                <span className="dot" />
                Active
              </span>
            ) : fundingPending ? (
              <span className="tag tag-warn">Awaiting approval</span>
            ) : (
              <span className="tag tag-draft">Setup in progress</span>
            )}
            {canAllocate && canManageBudget && (
              <button type="button" className="wallet-allocate-link" onClick={handleAllocateClick}>
                Allocate budget
              </button>
            )}
          </div>
        </div>
        <div className="row" style={{ alignItems: "stretch" }}>
          <div className="stat" style={{ flex: 1, padding: "18px 22px" }}>
            <div className="k">Budget balance</div>
            <div className="v num" style={{ fontSize: 26 }}>
              {inr(total)}
            </div>
            <div className="mut3" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
              Total organization budget from funding
            </div>
          </div>
          <div style={{ width: 1, background: "var(--line)" }} />
          <div className="stat" style={{ flex: 1, padding: "18px 22px" }}>
            <div className="k">Allocated to departments</div>
            <div className="v num" style={{ fontSize: 26 }}>
              {inr(alloc)}
            </div>
            <div className="mut3" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
              Earmarked for department budgets
            </div>
          </div>
          <div style={{ width: 1, background: "var(--line)" }} />
          <div className="stat" style={{ flex: 1, padding: "18px 22px" }}>
            <div className="k">Available to spend</div>
            <div className="v num" style={{ fontSize: 26, color: "var(--brand-d)" }}>
              {inr(rem)}
            </div>
            <div className="mut3" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
              Unallocated — pay from budget at checkout
            </div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12.5, padding: "10px 22px 14px" }}>
          <span>
            {inr(alloc)} allocated + {inr(rem)} available = {inr(total)} total balance
          </span>
          <span style={{ margin: "0 8px" }}>·</span>
          <span>
            Valid {fmtDate(o.start)} → {fmtDate(o.end)}
            {fundingPending ? (
              <>
                {" "}
                · {inr(o.requestedAmount || 0)} online payment pending approval
              </>
            ) : total > 0 ? (
              <>
                {" "}
                · Funded via{" "}
                {o.funding === "upload" ? `${o.docType} ${o.docNumber}` : "online payment"}
              </>
            ) : null}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18, marginBottom: 18 }}>
        <div className="card" style={{ padding: 22 }}>
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
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <Donut
              segments={depts.map((d, i) => ({
                color: deptPaletteColor(i),
                allocated: d.allocated,
              }))}
              centerValue={depts.length}
              centerLabel="Depts"
            />
            <div style={{ flex: 1 }}>
              {depts.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>
                  No departments yet.{" "}
                  {canAllocate && canManageBudget ? (
                    <span className="lnk" role="button" tabIndex={0} onClick={handleAllocateClick}>
                      Allocate budget
                    </span>
                  ) : null}{" "}
                  to add departments.
                </p>
              ) : (
                depts.map((d, i) => (
                  <div
                    key={d.id}
                    className="row"
                    style={{ justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}
                  >
                    <span className="row" style={{ gap: 6, alignItems: "center" }}>
                      <span
                        className="lc"
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 3,
                          background: deptPaletteColor(i),
                        }}
                      />
                      {d.name}
                    </span>
                    <b>{total ? Math.round((d.allocated / total) * 100) : 0}%</b>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div className="stat" style={{ padding: 0, marginBottom: 14 }}>
            <div className="k">Allocated to departments</div>
            <div className="v num">{inr(alloc)}</div>
          </div>
          <div className="stat" style={{ padding: 0 }}>
            <div className="k">Managers active</div>
            <div className="v num">
              {managersActive} / {depts.length || "—"}
              {managersPending > 0 ? (
                <span
                  className="mut3"
                  style={{ display: "block", fontSize: 11, fontWeight: 500, marginTop: 2 }}
                >
                  {managersPending} invite{managersPending === 1 ? "" : "s"} pending
                </span>
              ) : null}
            </div>
          </div>
          {canAllocate && canManageBudget && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 16 }}
              onClick={handleAllocateClick}
            >
              {depts.length ? "Edit allocation" : "Allocate budget"}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ fontSize: 17, marginBottom: 14 }}>Budget allocated</h3>
        {depts.length === 0 ? (
          <p className="muted" style={{ fontSize: 13.5 }}>
            No departments configured yet.
            {canAllocate ? " Use Allocate budget to set up departments and managers." : ""}
          </p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Department</th>
                <th>Manager</th>
                <th>Role</th>
                <th>Budget</th>
                <th>% of total</th>
                <th>Invite</th>
              </tr>
            </thead>
            <tbody>
              {depts.map((d, i) => (
                <tr key={d.id}>
                  <td>
                    <div className="row" style={{ gap: 9, alignItems: "center" }}>
                      <span
                        className="lc"
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: 3,
                          background: deptPaletteColor(i),
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>{d.name}</span>
                    </div>
                  </td>
                  <td>
                    {d.mgr.name || d.mgr.email ? (
                      <>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {d.mgr.name || d.mgr.email.split("@")[0]}
                        </div>
                        {d.mgr.email ? (
                          <div className="mut3" style={{ fontSize: 11 }}>
                            {d.mgr.email}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {d.mgr.role || "—"}
                  </td>
                  <td className="num">{inr(d.allocated)}</td>
                  <td className="num">{total ? Math.round((d.allocated / total) * 100) : 0}%</td>
                  <td>
                    <ManagerInviteBadge status={d.mgr.inviteStatus ?? "unassigned"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {walletId ? <WalletHistory walletId={walletId} /> : null}

      {walletId ? (
        <RequestTopupDialog
          open={topupOpen}
          onOpenChange={setTopupOpen}
          walletId={walletId}
          walletName={o.name || "Organization budget"}
        />
      ) : null}

      {walletId ? (
        <WalletDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          walletId={walletId}
          initial={walletContactInitial}
        />
      ) : null}
    </>
  );
}
