import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hydrateWorkspace, isAuthenticated } from "@/services/api-bridge";
import type { WorkspaceSnapshot } from "@/services/workspace-api";

/** Single cache key for the whole tenant workspace snapshot. */
export const WORKSPACE_QUERY_KEY = ["workspace"] as const;

/**
 * The tenant app's single source of truth. `hydrateWorkspace()` fans out to all
 * tenant endpoints and returns one typed snapshot; features select slices from
 * it and invalidate this key after mutations.
 */
export function useWorkspace() {
  return useQuery<WorkspaceSnapshot>({
    queryKey: WORKSPACE_QUERY_KEY,
    queryFn: () => hydrateWorkspace(),
    staleTime: 30_000,
    enabled: isAuthenticated(),
  });
}

/** Imperative refresh of the workspace snapshot — call after a mutation. */
export function useInvalidateWorkspace() {
  const queryClient = useQueryClient();
  return () => queryClient.refetchQueries({ queryKey: WORKSPACE_QUERY_KEY });
}
