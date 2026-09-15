import { fetchPlatformKits } from "@/services/platform-api";
import { useLoad } from "../../useLoad";

/** Platform kit list; bump `reloadKey` to refetch after a mutation. */
export function usePlatformKitsList(reloadKey = 0) {
  return useLoad(() => fetchPlatformKits(), [reloadKey]);
}
