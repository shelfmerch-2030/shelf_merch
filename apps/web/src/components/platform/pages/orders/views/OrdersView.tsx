import { type ReactNode } from "react";
import { Link } from "react-router";
import { QC_FILTERS, qcLabel } from "@/services/production-qc";
import {
  DataTable,
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { OrdersVm } from "../controllers/useOrdersController";

const columns: {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => ReactNode;
}[] = [
  {
    key: "orderNumber",
    label: "Order #",
    render: (r) => (
      <Link
        to={`/platform/orders/${String(r._id)}`}
        style={{
          color: "var(--brand)",
          fontWeight: "var(--font-weight-semibold)",
          textDecoration: "none",
        }}
      >
        {String(r.orderNumber ?? "N/A")}
      </Link>
    ),
  },
  { key: "tenantName", label: "Tenant" },
  {
    key: "source",
    label: "Source",
    render: (r) => {
      const source = String(r.source ?? "campaign");
      if (source === "api") {
        return <span className={`tag ${r.testMode ? "tag-draft" : "tag-proc"}`}>{r.testMode ? "API · test" : "API"}</span>;
      }
      return <span className="tag">{source === "external" ? "Store sync" : "Campaign"}</span>;
    },
  },
  { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
  {
    key: "qcStatus",
    label: "QC",
    render: (r) => <span className="tag">{qcLabel(r.qcStatus)}</span>,
  },
  {
    key: "total",
    label: "Total",
    render: (r) => {
      const b = r.amountBreakdown as { total?: number } | undefined;
      return inr(Number(b?.total ?? 0));
    },
  },
  {
    key: "createdAt",
    label: "Created",
    render: (r) => new Date(String(r.createdAt)).toLocaleDateString("en-IN"),
  },
  {
    key: "open",
    label: "",
    render: (r) => (
      <Link to={`/platform/orders/${String(r._id)}`} className="btn btn-ghost btn-sm">
        Open
      </Link>
    ),
  },
];

/** Cross-tenant orders table. */
export function OrdersView({ data, error, loading, qcFilter, onQcFilter, includeTest, onIncludeTest }: OrdersVm) {
  return (
    <>
      <PlatformPageHeader title="Orders" subtitle="Cross-tenant order pipeline." />
      <div className="field" style={{ maxWidth: 300 }}>
        <label className="lbl" htmlFor="orders-qc-filter">
          QC status
        </label>
        <select
          id="orders-qc-filter"
          className="inp"
          value={qcFilter}
          onChange={(e) => onQcFilter(e.target.value)}
        >
          {QC_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <label className="row" style={{ gap: 6, alignItems: "center", marginBottom: 12 }}>
        <input type="checkbox" checked={includeTest} onChange={(e) => onIncludeTest(e.target.checked)} />
        Show test (sandbox API) orders
      </label>
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && <DataTable empty="No orders yet." rows={data.items} columns={columns} />}
    </>
  );
}
