import { useSearchParams } from "react-router";
import { fetchPlatformOrder, fetchPlatformOrders } from "@/services/platform-api";
import { useLoad } from "../../useLoad";

// Order action fns + types re-exported so controllers/views never reach into services/ directly.
export {
  addOrderNote,
  assignOrderVendor,
  createOrderReplacement,
  createProductionTask,
  fetchPlatformVendors,
  ORDER_STATUSES,
  setOrderStatus,
  uploadOrderMockup,
  type OrderItemProduct,
  type ArtworkPlacement,
  type PrintArea,
  type ProductVariant,
} from "@/services/platform-api";

/** Cross-tenant order list (optional ?tenantId= filter from URL). */
export function usePlatformOrders() {
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get("tenantId") || undefined;
  return useLoad(() => fetchPlatformOrders({ limit: 100, tenantId }), [tenantId]);
}

/** Single platform order; bump `reloadKey` to refetch after a mutation. */
export function usePlatformOrder(orderId: string, reloadKey: number) {
  return useLoad(() => fetchPlatformOrder(orderId), [orderId, reloadKey]);
}
