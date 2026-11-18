import { usePlatformOrders } from "../model";
import { useSearchParams } from "react-router";

export type OrdersVm = ReturnType<typeof useOrdersController>;

/** Controller for the platform orders list. */
export function useOrdersController() {
  const orders = usePlatformOrders();
  const [, setSearchParams] = useSearchParams();
  return {
    ...orders,
    onQcFilter: (value: string) =>
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set("qcStatus", value);
        else next.delete("qcStatus");
        return next;
      }),
  };
}
