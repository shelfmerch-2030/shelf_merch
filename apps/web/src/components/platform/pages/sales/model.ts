import { fetchPlatformDemoLeads } from "@/services/platform-api";
import { useLoad } from "../../useLoad";

export { type DemoLeadRow } from "@/services/platform-api";

/** Saved demo enquiries from the public request-demo page. */
export function useDemoLeads() {
  return useLoad(() => fetchPlatformDemoLeads(250), []);
}
