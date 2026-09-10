import { useState } from "react";
import {
  fetchPlatformDemoLeads,
  inviteDemoLeadSignup,
  inviteSignupByEmail,
} from "@/services/platform-api";
import { useLoad } from "../../useLoad";

export {
  type DemoLeadRow,
  inviteDemoLeadSignup,
  inviteSignupByEmail,
} from "@/services/platform-api";

/** Saved demo enquiries from the public request-demo page. */
export function useDemoLeads(reloadKey = 0) {
  return useLoad(() => fetchPlatformDemoLeads(250), [reloadKey]);
}
