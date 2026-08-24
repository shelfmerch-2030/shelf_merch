import { fetchPlatformProducts } from "@/services/platform-api";
import { useLoad } from "../../useLoad";

/** Platform product catalog list (all pages — not capped at the first 100). */
export function usePlatformProducts() {
  return useLoad(() => fetchPlatformProducts(), []);
}
