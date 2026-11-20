import { type ReactNode } from "react";
import { Link } from "react-router";
import { QC_FILTERS, qcLabel } from "@/services/production-qc";
import {
  DataTable,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { ProductionVm } from "../controllers/useProductionController";
import { TaskManageModal } from "./TaskManageModal";

/** Task board and orders in production. */
export function ProductionView({
  board,
  tasks,
  canWrite,
  qcFilter,
  onQcFilter,
  taskLinkError,
  managing,
  onManage,
  onCloseManage,
  onProductionChanged,
}: ProductionVm) {
  const data = board.data;

  const taskColumns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "_id", label: "Task", render: (r) => String(r._id).slice(-6) },
    {
      key: "orderId",
      label: "Order",
      render: (r) => (
        <Link to={`/platform/orders/${String(r.orderId)}`}>
          {String(r.orderNumber || String(r.orderId ?? "").slice(-6))}
        </Link>
      ),
    },
    { key: "assignedTo", label: "Assignee", render: (r) => String(r.assignedTo || "N/A") },
    { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
    {
      key: "qcStatus",
      label: "QC",
      render: (r) => <span title={String(r.qcFailReason || "")}>{qcLabel(r.qcStatus)}</span>,
    },
    {
      key: "shipment",
      label: "Shipment",
      render: (r) => {
        const s = r.shipment as { courier?: string; awb?: string } | null | undefined;
        return s?.awb ? `${s.courier || "Courier"} · ${s.awb}` : "Not requested";
      },
    },
  ];

  if (canWrite) {
    taskColumns.push({
      key: "manage",
      label: "",
      render: (r) => (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onManage(r)}>
          Manage
        </button>
      ),
    });
  }

  return (
    <>
      <PlatformPageHeader title="Production" subtitle="Task board and orders in production." />
      {board.loading && <PlatformLoading />}
      {board.error && <PlatformError message={board.error} />}
      {taskLinkError && <PlatformError message={taskLinkError} />}
      {data && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="h1" style={{ fontSize: 16, marginBottom: 12 }}>
              Tasks by status
            </div>
            {Object.entries(data.taskBuckets).map(([status, bucket]) => (
              <div
                key={status}
                className="row"
                style={{ justifyContent: "space-between", marginBottom: 8 }}
              >
                <StatusTag status={status} />
                <span className="num">{bucket.count}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="h1" style={{ fontSize: 16, marginBottom: 12 }}>
              Orders in production
            </div>
            {Object.entries(data.orderBuckets).map(([status, bucket]) =>
              bucket.count > 0 ? (
                <div
                  key={status}
                  className="row"
                  style={{ justifyContent: "space-between", marginBottom: 8 }}
                >
                  <StatusTag status={status} />
                  <span className="num">{bucket.count}</span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      <h3 style={{ margin: "24px 0 12px" }}>Production tasks</h3>
      <div className="field" style={{ maxWidth: 300 }}>
        <label className="lbl" htmlFor="production-qc-filter">
          QC status
        </label>
        <select
          id="production-qc-filter"
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
      {tasks.loading && <PlatformLoading />}
      {tasks.error && <PlatformError message={tasks.error} />}
      {tasks.data && (
        <DataTable empty="No production tasks." rows={tasks.data.items} columns={taskColumns} />
      )}
      {managing && (
        <TaskManageModal
          key={String(managing._id)}
          row={managing}
          onClose={onCloseManage}
          onChanged={onProductionChanged}
          readOnly={!canWrite}
        />
      )}
    </>
  );
}
