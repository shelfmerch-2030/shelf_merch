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

/** Marketing lead desk for public demo requests. */
export function SalesView({ leads }: SalesVm) {
  const items = leads.data?.items ?? [];
  const total = leads.data?.total ?? items.length;
  const uniqueCompanies = new Set(items.map((lead) => lead.companyName).filter(Boolean)).size;
  const withRequirement = items.filter((lead) => Boolean(lead.requirement)).length;

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
      key: "createdAt",
      label: "Received",
      render: (r) => formatDate(r.createdAt),
    },
  ];

  return (
    <>
      <PlatformPageHeader
        title="Sales"
        subtitle="Interested-client demo leads captured from the public request-demo page."
      />
      {leads.loading ? <PlatformLoading message="Loading sales leads..." /> : null}
      {leads.error ? <PlatformError message={leads.error} /> : null}
      {leads.data ? (
        <>
          <MetricGrid
            items={[
              ["Total leads", total],
              ["Companies", uniqueCompanies],
              ["With requirement", withRequirement],
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
