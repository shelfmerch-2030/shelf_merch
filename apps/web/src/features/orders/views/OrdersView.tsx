import { Receipt, Search } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/tenant/PageHeader";
import { inr } from "@/components/platform/platform-ui";
import type { OrdersVm } from "../controllers/useOrdersController";
import { OrderDetailDialogView } from "./OrderDetailDialogView";
import { OrderStatusTag } from "./OrderStatusTag";

const SUBTITLE = "Track every swag, kit and points order across your workspace.";

/** Orders screen: search + history table + detail dialog. */
export function OrdersView(vm: OrdersVm) {
  if (vm.isLoading) {
    return <LoadingState message="Loading orders…" fullScreen={false} />;
  }
  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Orders" subtitle={SUBTITLE} />

      {!vm.hasOrders ? (
        <div className="card empty">
          <div className="ic" aria-hidden="true">
            <Receipt size={34} color="var(--ink-3)" />
          </div>
          <h3>No orders yet</h3>
          <p>Orders appear here when recipients redeem gifts or you send kits at scale.</p>
        </div>
      ) : (
        <div className="card data-list-card orders-list">
          <div className="data-list-title">Order history</div>

          <div className="data-list-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search orders"
              placeholder="Search by order name or ID…"
              value={vm.query}
              onChange={(e) => vm.onQuery(e.target.value)}
            />
          </div>

          {vm.filtered.length === 0 ? (
            <div className="data-list-empty">
              <h4>No matching orders</h4>
              <p className="muted" style={{ fontSize: 13 }}>
                Try a different order name or ID.
              </p>
            </div>
          ) : (
            <table className="tbl data-list-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order details</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Invoice</th>
                  <th>Order details</th>
                </tr>
              </thead>
              <tbody>
                {vm.filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="data-list-row"
                    onClick={() => vm.onSelect(o)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open order ${o.orderNumber}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        vm.onSelect(o);
                      }
                    }}
                  >
                    <td className="muted data-list-cell">{o.date}</td>
                    <td className="data-list-cell">
                      <div className="data-list-primary">{o.orderNumber}</div>
                      {o.name && o.name !== o.orderNumber ? (
                        <div className="data-list-secondary">{o.name}</div>
                      ) : null}
                    </td>
                    <td className="data-list-cell">
                      <OrderStatusTag status={o.status} />
                    </td>
                    <td className="num data-list-cell data-list-amount">{inr(o.amount)}</td>
                    <td className="data-list-cell">
                      <span className="row" style={{ gap: 10 }}>
                        <button
                          type="button"
                          className="lnk"
                          onClick={(e) => {
                            e.stopPropagation();
                            vm.onViewInvoice(o);
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="lnk"
                          onClick={(e) => {
                            e.stopPropagation();
                            vm.onDownloadInvoice(o);
                          }}
                        >
                          Download
                        </button>
                      </span>
                    </td>
                    <td className="data-list-cell">
                      <span className="lnk">{o.track ? "Tracking" : "View"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <OrderDetailDialogView
        order={vm.selected}
        onOpenChange={vm.onDialogOpenChange}
        onViewInvoice={() => vm.selected && vm.onViewInvoice(vm.selected)}
        onDownloadInvoice={() => vm.selected && vm.onDownloadInvoice(vm.selected)}
        onTrackShipment={vm.onTrackShipment}
      />
    </>
  );
}
