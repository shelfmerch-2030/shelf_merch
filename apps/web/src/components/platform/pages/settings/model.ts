import { fetchPlatformSettings } from "@/services/platform-api";
import { useLoad } from "../../useLoad";

export { isBuiltInPlatformEmail, updateSetting } from "@/services/platform-api";
export {
  fetchDemoLoginPassword,
  generateDemoLoginPassword,
  revokeDemoLoginPassword,
  type DemoLoginPasswordStatus,
} from "@/services/platform-api";

/** Platform-wide settings key-value map; bump `reloadKey` to refetch after a mutation. */
export function usePlatformSettings(reloadKey: number) {
  return useLoad(() => fetchPlatformSettings(), [reloadKey]);
}
