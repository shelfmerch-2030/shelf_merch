import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { apiFetch } from "@/services/api";
import type { UiOrder } from "../model";

export type OrdersVm = {
  isLoading: boolean;
  errorMessage: string | null;
  hasOrders: boolean;
  query: string;
  filtered: UiOrder[];
  selected: UiOrder | null;
  onQuery: (query: string) => void;
  onSelect: (order: UiOrder) => void;
  onDialogOpenChange: (open: boolean) => void;
  onViewInvoice: (order: UiOrder) => void;
  onDownloadInvoice: (order: UiOrder) => void;
  onTrackShipment: () => void;
};

function invoiceMediaUrl(url?: string) {
  const raw = url?.trim();
  if (!raw) return "";
  return resolveMediaUrl(raw);
}

async function resolveInvoiceUrl(order: UiOrder): Promise<string> {
  // Always hit generate so older PDFs pick up layout/pricing fixes.
  try {
    const invoice = await apiFetch<{ pdfUrl?: string }>(
      `/order-invoices/by-order/${order.id}/generate`,
      { method: "POST" },
    );
    const url = invoiceMediaUrl(invoice.pdfUrl);
    if (url) {
      order.invoicePdfUrl = invoice.pdfUrl || url;
      return url;
    }
  } catch {
    // Fall through to cached URL if generate fails.
  }
  return invoiceMediaUrl(order.invoicePdfUrl);
}

function openInvoice(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function downloadInvoice(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Controller for the orders screen: workspace slice, search filter, detail dialog. */
export function useOrdersController(): OrdersVm {
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UiOrder | null>(null);

  const orders = workspace?.orders ?? [];
  const openOrderKey = searchParams.get("order")?.trim() || "";

  useEffect(() => {
    if (!openOrderKey || !orders.length) return;
    const match = orders.find(
      (o) => o.id === openOrderKey || o.orderNumber === openOrderKey,
    );
    if (match) setSelected(match);
  }, [openOrderKey, orders]);

  const filtered = useMemo(() => {
    const list = workspace?.orders ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) => o.name.toLowerCase().includes(q) || o.orderNumber.toLowerCase().includes(q),
    );
  }, [workspace?.orders, query]);

  async function onViewInvoice(order: UiOrder) {
    const toastId = toast.loading("Opening invoice…");
    const url = await resolveInvoiceUrl(order);
    toast.dismiss(toastId);
    if (!url) {
      toast.message("Invoice is being generated", {
        description: "Try again in a moment if this order was just placed.",
      });
      return;
    }
    openInvoice(url);
  }

  async function onDownloadInvoice(order: UiOrder) {
    const toastId = toast.loading("Preparing invoice…");
    const url = await resolveInvoiceUrl(order);
    toast.dismiss(toastId);
    if (!url) {
      toast.message("Invoice is being generated", {
        description: "Try again in a moment if this order was just placed.",
      });
      return;
    }
    downloadInvoice(url, `${order.invoiceNumber || order.orderNumber}.pdf`);
  }

  return {
    isLoading: isLoading && !workspace,
    errorMessage:
      isError || !workspace
        ? error instanceof Error
          ? error.message
          : "Could not load orders"
        : null,
    hasOrders: (workspace?.orders ?? []).length > 0,
    query,
    filtered,
    selected,
    onQuery: setQuery,
    onSelect: setSelected,
    onDialogOpenChange: (open) => {
      if (!open) {
        setSelected(null);
        if (openOrderKey) {
          const next = new URLSearchParams(searchParams);
          next.delete("order");
          setSearchParams(next, { replace: true });
        }
      }
    },
    onViewInvoice: (order) => {
      void onViewInvoice(order);
    },
    onDownloadInvoice: (order) => {
      void onDownloadInvoice(order);
    },
    onTrackShipment: () => toast("Opening carrier tracking…"),
  };
}
