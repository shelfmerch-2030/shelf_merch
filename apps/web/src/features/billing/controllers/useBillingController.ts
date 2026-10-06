import { toast } from "sonner";

export type BillingVm = {
  onRequestAccess: () => void;
};

/** Controller for the billing placeholder screen. */
export function useBillingController(): BillingVm {
  return {
    onRequestAccess: () => toast.success("Early access requested"),
  };
}
