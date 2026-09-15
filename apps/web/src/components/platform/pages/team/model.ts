import { fetchPlatformTeam } from "@/services/platform-api";
import { useLoad } from "../../useLoad";

export {
  changeTeamRole,
  deactivateTeamMember,
  isBuiltInPlatformEmail,
  inviteTeamMember,
  PLATFORM_ROLES,
  reactivateTeamMember,
} from "@/services/platform-api";

export type TeamRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  allowlisted?: boolean;
  protected?: boolean;
};

/** Format platform role slug for display. */
export function roleLabel(role: string) {
  return role.replace(/^platform_/, "").replace(/_/g, " ");
}

/** Platform team roster; bump `reloadKey` to refetch after a mutation. */
export function usePlatformTeam(reloadKey: number) {
  return useLoad(() => fetchPlatformTeam(), [reloadKey]);
}
