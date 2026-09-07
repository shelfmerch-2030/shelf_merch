import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { launchPointsCampaignFlow } from "@/services/api-bridge";
import { useInvalidateWorkspace, WORKSPACE_QUERY_KEY } from "@/hooks/useWorkspace";
import {
  deleteCampaignApi,
  fetchCampaignReportApi,
  savePointsCampaignDraftApi,
} from "@/services/mutations-api";
import type { WorkspaceSnapshot } from "@/services/workspace-api";
import type { UiCampaign } from "@/services/mappers";

// Ui types re-exported here so views never import from services/ directly.
export type { UiCampaign, UiContact, UiKit, UiShop, UiWallet } from "@/services/mappers";

export type LaunchPointsCampaignInput = Parameters<typeof launchPointsCampaignFlow>[0];

export function useLaunchPointsCampaign() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: LaunchPointsCampaignInput) => launchPointsCampaignFlow(input),
    onSuccess: () => invalidate(),
  });
}

export function useSavePointsCampaignDraft() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: savePointsCampaignDraftApi,
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCampaignApi,
    onSuccess: async (_data, campaignId) => {
      queryClient.setQueryData<WorkspaceSnapshot>(WORKSPACE_QUERY_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          campaigns: old.campaigns.filter((c) => c.id !== campaignId),
        };
      });
      await queryClient.invalidateQueries({
        queryKey: WORKSPACE_QUERY_KEY,
        refetchType: "active",
      });
    },
  });
}

export function useCampaignRecipients(campaignId: string | null) {
  return useQuery({
    queryKey: ["campaign-recipients", campaignId],
    queryFn: () => fetchCampaignReportApi(campaignId!),
    enabled: Boolean(campaignId),
  });
}

const LIVE_STATUSES = ["live", "launched", "redemption_open"];
export const COMPLETE_STATUSES = ["completed", "redemption_closed", "fulfilled"];
export const INCOMPLETE_STATUSES = ["draft", "recipients_uploaded", "credits_allocated", "approved"];

export function isPointsCampaign(c: UiCampaign) {
  return c.type === "send_points" || c.type === "points";
}

export function isLiveCampaign(c: UiCampaign) {
  return isPointsCampaign(c) && LIVE_STATUSES.includes(c.status);
}

export function isSentKitCampaign(c: UiCampaign) {
  return !isPointsCampaign(c) && LIVE_STATUSES.includes(c.status);
}

/** Incomplete wizard campaigns that can be resumed (points or kit). */
export function isIncompleteCampaign(c: UiCampaign) {
  return INCOMPLETE_STATUSES.includes(c.status);
}

/** Finished campaigns — includes kit sends shown as "Sent". */
export function isCompletedCampaign(c: UiCampaign) {
  return COMPLETE_STATUSES.includes(c.status) || isSentKitCampaign(c);
}
