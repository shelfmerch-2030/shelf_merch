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
  onTrackShipment: (order: UiOrder) => void;
  invoiceBusy: { orderId: string; mode: "view" | "download" } | null;
};

function invoiceMediaUrl(url?: string) {
  const raw = url?.trim();
  if (!raw) return "";
  return resolveMediaUrl(raw);
}

type InvoiceResolve =
  | { ok: true; url: string }
  | { ok: false; reason: "pending" | "error" };

async function resolveInvoiceUrl(order: UiOrder): Promise<InvoiceResolve> {
  // Always hit generate so older PDFs pick up layout/pricing fixes.
  try {
    const invoice = await apiFetch<{ pdfUrl?: string }>(
      `/order-invoices/by-order/${order.id}/generate`,
      { method: "POST" },
    );
    const url = invoiceMediaUrl(invoice.pdfUrl);
    if (url) {
      order.invoicePdfUrl = invoice.pdfUrl || url;
      return { ok: true, url };
    }
    return { ok: false, reason: "pending" };
  } catch {
    const cached = invoiceMediaUrl(order.invoicePdfUrl);
    if (cached) return { ok: true, url: cached };
    return { ok: false, reason: "error" };
  }
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

  const [invoiceBusy, setInvoiceBusy] = useState<{ orderId: string; mode: "view" | "download" } | null>(null);

  async function onViewInvoice(order: UiOrder) {
    if (invoiceBusy) return;
    setInvoiceBusy({ orderId: order.id, mode: "view" });
    try {
      const result = await resolveInvoiceUrl(order);
      if (!result.ok) {
        toast[result.reason === "pending" ? "message" : "error"](
          result.reason === "pending" ? "Invoice is still being generated" : "Could not open invoice",
        );
        return;
      }
      openInvoice(result.url);
    } catch {
      toast.error("Could not open invoice");
    } finally {
      setInvoiceBusy(null);
    }
  }

  async function onDownloadInvoice(order: UiOrder) {
    if (invoiceBusy) return;
    setInvoiceBusy({ orderId: order.id, mode: "download" });
    try {
      const result = await resolveInvoiceUrl(order);
      if (!result.ok) {
        toast[result.reason === "pending" ? "message" : "error"](
          result.reason === "pending" ? "Invoice is still being generated" : "Could not open invoice",
        );
        return;
      }
      downloadInvoice(result.url, `${order.invoiceNumber || order.orderNumber}.pdf`);
    } catch {
      toast.error("Could not open invoice");
    } finally {
      setInvoiceBusy(null);
    }
  }

  function onTrackShipment(order: UiOrder) {
    const track = order.track?.trim();
    if (!track) {
      toast.error("Could not open tracking");
      return;
    }
    // Tracking number alone cannot open carrier tracking without a URL.
    toast.error("Could not open tracking");
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
    onTrackShipment,
    invoiceBusy,
  };
}
