import { type ReactNode } from "react";
import {
  DataTable,
  MetricGrid,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { SalesVm } from "../controllers/useSalesController";
import type { DemoLeadRow } from "../model";

function formatDate(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-IN");
}

function latestLeadDate(leads: DemoLeadRow[]) {
  if (!leads.length) return "-";
  return formatDate(leads[0]?.createdAt);
}

/** Marketing lead desk: list demo requests and send allowlisted signup invites. */
export function SalesView({
  leads,
  canWrite,
  invitingLeadId,
  draftEmail,
  draftName,
  draftCompany,
  draftBusy,
  draftErr,
  onDraftEmail,
  onDraftName,
  onDraftCompany,
  onInviteLead,
  onInviteDraft,
}: SalesVm) {
  const items = leads.data?.items ?? [];
  const total = leads.data?.total ?? items.length;
  const uniqueCompanies = new Set(items.map((lead) => lead.companyName).filter(Boolean)).size;
  const withRequirement = items.filter((lead) => Boolean(lead.requirement)).length;
  const invited = items.filter((lead) => Boolean(lead.signupInviteSentAt)).length;

  const columns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "fullName", label: "Name" },
    { key: "companyName", label: "Company" },
    {
      key: "workEmail",
      label: "Work email",
      render: (r) => {
        const email = String(r.workEmail ?? "");
        return email ? (
          <a className="lnk" href={`mailto:${email}`}>
            {email}
          </a>
        ) : (
          "-"
        );
      },
    },
    {
      key: "mobileNumber",
      label: "Mobile",
      render: (r) => {
        const mobile = String(r.mobileNumber ?? "");
        return mobile ? (
          <a className="lnk" href={`tel:${mobile}`}>
            {mobile}
          </a>
        ) : (
          "-"
        );
      },
    },
    {
      key: "requirement",
      label: "Requirement",
      render: (r) => String(r.requirement ?? "") || "Not specified",
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusTag status={String(r.status ?? "new")} />,
    },
    {
      key: "signupInviteSentAt",
      label: "Signup invite",
      render: (r) => {
        const sentAt = r.signupInviteSentAt;
        if (!sentAt) return <span className="muted">Not sent</span>;
        const count = Number(r.signupInviteCount ?? 1);
        return (
          <span>
            {formatDate(sentAt)}
            {count > 1 ? <span className="muted"> · ×{count}</span> : null}
          </span>
        );
      },
    },
    {
      key: "createdAt",
      label: "Received",
      render: (r) => formatDate(r.createdAt),
    },
  ];

  if (canWrite) {
    columns.push({
      key: "actions",
      label: "Actions",
      render: (r) => {
        const lead = r as unknown as DemoLeadRow;
        const busy = invitingLeadId === lead._id;
        const resent = Boolean(lead.signupInviteSentAt);
        return (
          <button
            type="button"
            className="btn btn-brand btn-sm"
            disabled={Boolean(invitingLeadId)}
            onClick={() => onInviteLead(lead)}
          >
            {busy ? "Sending…" : resent ? "Resend signup" : "Whitelist & invite"}
          </button>
        );
      },
    });
  }

  return (
    <>
      <PlatformPageHeader
        title="Sales"
        subtitle="Demo leads from the public request-demo page. Whitelist emails and send signup links so clients can create accounts."
      />
      {leads.loading ? <PlatformLoading message="Loading sales leads..." /> : null}
      {leads.error ? <PlatformError message={leads.error} /> : null}

      {canWrite ? (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Invite signup access</h3>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
            Adds the email to the login allowlist and emails a Create account button linking to
            signup.
          </p>
          {draftErr ? <PlatformError message={draftErr} /> : null}
          <div
            className="row"
            style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <div className="field" style={{ flex: "1 1 180px", margin: 0, minWidth: 160 }}>
              <label className="lbl" htmlFor="sales-invite-email">
                Email
              </label>
              <input
                id="sales-invite-email"
                className="inp"
                type="email"
                placeholder="client@company.com"
                value={draftEmail}
                disabled={draftBusy}
                onChange={(e) => onDraftEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onInviteDraft();
                  }
                }}
              />
            </div>
            <div className="field" style={{ flex: "1 1 140px", margin: 0, minWidth: 120 }}>
              <label className="lbl" htmlFor="sales-invite-name">
                Name
              </label>
              <input
                id="sales-invite-name"
                className="inp"
                type="text"
                placeholder="Optional"
                value={draftName}
                disabled={draftBusy}
                onChange={(e) => onDraftName(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: "1 1 140px", margin: 0, minWidth: 120 }}>
              <label className="lbl" htmlFor="sales-invite-company">
                Company
              </label>
              <input
                id="sales-invite-company"
                className="inp"
                type="text"
                placeholder="Optional"
                value={draftCompany}
                disabled={draftBusy}
                onChange={(e) => onDraftCompany(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-brand btn-sm"
              disabled={draftBusy}
              onClick={onInviteDraft}
            >
              {draftBusy ? "Sending…" : "Whitelist & send signup"}
            </button>
          </div>
        </div>
      ) : null}

      {leads.data ? (
        <>
          <MetricGrid
            items={[
              ["Total leads", total],
              ["Companies", uniqueCompanies],
              ["With requirement", withRequirement],
              ["Signup invited", invited],
              ["Latest lead", latestLeadDate(items)],
            ]}
          />
          <div style={{ marginTop: 24 }}>
            <DataTable
              empty="No demo leads yet."
              rows={items as unknown as Record<string, unknown>[]}
              columns={columns}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
