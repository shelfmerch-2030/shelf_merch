import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Tile } from "../data";
import {
  disconnectZoho,
  fetchZohoStatus,
  startZohoConnect,
  syncZohoEmployees,
  type ZohoConnectionStatus,
  type ZohoIntegrationPublic,
} from "@/services/zoho-api";
import {
  createMergeLinkToken,
  exchangeMergePublicToken,
  fetchMergeConnections,
  disconnectMergeConnection,
  isMergeHrisIntegration,
  syncMergeConnection,
  mergeSyncErrorMessage,
  type MergeConnectionPublic,
  type MergeHrisIntegration,
} from "@/services/merge-api";
import { canAccessTenantArea } from "@/services/tenant-access";
import { getStoredUser } from "@/services/auth-store";
import { ApiError } from "@/services/api";
import { MERGE_EMPLOYEES_QUERY_KEY } from "../hris-employees/useHrisEmployeesController";

export type IntegrationsVm = {
  selected: Tile | null;
  onSelect: (tile: Tile) => void;
  onBack: () => void;
  onInstall: (tile: Tile) => void;
  onSupport: () => void;
  onViewPlans: () => void;
  mergeLinking: boolean;
  mergeExchanging: boolean;
  mergeLinkToken: string | null;
  mergeLinkProvider: MergeHrisIntegration | null;
  onMergeLinkSuccess: (publicToken: string) => void;
  onMergeLinkExit: () => void;
  mergeSyncingId: string | null;
  mergeDisconnectingId: string | null;
  mergeConnectionsByProvider: Record<string, MergeConnectionPublic>;
  onMergeSync: (connectionId: string) => void;
  onMergeDisconnect: (connectionId: string) => void;
  zoho: {
    status: ZohoConnectionStatus;
    configured: boolean;
    integration: ZohoIntegrationPublic | null;
    loading: boolean;
    syncing: boolean;
    connecting: boolean;
    disconnecting: boolean;
    canManage: boolean;
    onConnect: () => void;
    onSync: () => void;
    onDisconnect: () => void;
  };
};

const ZOHO_QUERY_KEY = ["integrations", "zoho", "status"] as const;
const MERGE_QUERY_KEY = ["integrations", "merge", "connections"] as const;

/** Controller for the integrations screen: tile selection + Zoho / Merge actions. */
export function useIntegrationsController(): IntegrationsVm {
  const [selected, setSelected] = useState<Tile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [mergeLinking, setMergeLinking] = useState(false);
  const [mergeExchanging, setMergeExchanging] = useState(false);
  const [mergeLinkToken, setMergeLinkToken] = useState<string | null>(null);
  const [mergeLinkProvider, setMergeLinkProvider] = useState<MergeHrisIntegration | null>(null);
  const pendingMergeIntegration = useRef<MergeHrisIntegration | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const canManage = canAccessTenantArea(user?.role, "integrations", "write");

  const statusQuery = useQuery({
    queryKey: ZOHO_QUERY_KEY,
    queryFn: fetchZohoStatus,
    staleTime: 30_000,
  });

  const mergeConnectionsQuery = useQuery({
    queryKey: MERGE_QUERY_KEY,
    queryFn: fetchMergeConnections,
    staleTime: 30_000,
  });

  const mergeConnectionsByProvider = useMemo(() => {
    const map: Record<string, MergeConnectionPublic> = {};
    for (const conn of mergeConnectionsQuery.data ?? []) {
      if (conn.status === "connected" || conn.status === "needs_attention") {
        map[conn.provider] = conn;
      }
    }
    return map;
  }, [mergeConnectionsQuery.data]);

  useEffect(() => {
    const zoho = searchParams.get("zoho");
    if (!zoho) return;
    if (zoho === "connected") {
      toast.success("Zoho People connected");
      void queryClient.invalidateQueries({ queryKey: ZOHO_QUERY_KEY });
    } else if (zoho === "error") {
      const reason = searchParams.get("reason");
      toast.error(
        reason === "denied"
          ? "Zoho People permission was denied"
          : "Could not connect Zoho People — try again",
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete("zoho");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);

  const onMergeLinkSuccess = useCallback(
    async (publicToken: string) => {
      const integration = pendingMergeIntegration.current;
      setMergeLinkToken(null);
      setMergeLinkProvider(null);
      setMergeLinking(false);

      setMergeExchanging(true);
      try {
        const connection = await exchangeMergePublicToken({
          publicToken,
          ...(integration ? { integration } : {}),
        });
        toast.success(
          `${connection.integrationName || connection.provider} connected successfully`,
        );
        void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
        setSelected(null);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not complete Merge connection");
      } finally {
        setMergeExchanging(false);
        pendingMergeIntegration.current = null;
      }
    },
    [queryClient],
  );

  const onMergeLinkExit = useCallback(() => {
    setMergeLinkToken(null);
    setMergeLinkProvider(null);
    setMergeLinking(false);
    if (!mergeExchanging) {
      pendingMergeIntegration.current = null;
    }
  }, [mergeExchanging]);

  const syncMutation = useMutation({
    mutationFn: syncZohoEmployees,
    onSuccess: (summary) => {
      toast.success(
        `Synced employees — fetched ${summary.totalFetched}, created ${summary.created}, updated ${summary.updated}, skipped ${summary.skipped}, failed ${summary.failed}`,
      );
      void queryClient.invalidateQueries({ queryKey: ZOHO_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Employee sync failed");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectZoho,
    onSuccess: () => {
      toast.success("Zoho People disconnected");
      void queryClient.invalidateQueries({ queryKey: ZOHO_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Disconnect failed");
    },
  });

  const mergeSyncMutation = useMutation({
    mutationFn: syncMergeConnection,
    onSuccess: (result) => {
      const s = result.sync;
      toast.success(
        `Synced HRIS — employees +${s.employees.created}/${s.employees.updated}, departments +${s.departments.created}/${s.departments.updated}`,
      );
      void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: MERGE_EMPLOYEES_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(mergeSyncErrorMessage(err));
      void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
    },
  });

  const mergeDisconnectMutation = useMutation({
    mutationFn: disconnectMergeConnection,
    onSuccess: (connection) => {
      toast.success(
        `${connection.integrationName || connection.provider} disconnected`,
      );
      void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
      // Keep imported employees visible in the directory after disconnect.
      void queryClient.invalidateQueries({ queryKey: MERGE_EMPLOYEES_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Disconnect failed");
    },
  });

  const onConnect = useCallback(async () => {
    if (!canManage) {
      toast.error("Only company administrators can connect Zoho People");
      return;
    }
    setConnecting(true);
    try {
      await startZohoConnect();
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof ApiError ? err.message : "Could not start Zoho connection");
    }
  }, [canManage]);

  const startMergeLink = useCallback(
    async (integration?: MergeHrisIntegration) => {
      if (!canManage) {
        toast.error("Only company administrators can connect HRIS providers");
        return;
      }
      if (integration === "gusto") {
        toast.message("Gusto requires additional Merge setup before it can be connected");
        return;
      }
      if (mergeLinking || mergeExchanging) return;

      // Clear any prior session so iframe/token cannot go stale across provider switches.
      setMergeLinkToken(null);
      setMergeLinkProvider(integration ?? null);
      pendingMergeIntegration.current = integration ?? null;
      setMergeLinking(true);
      try {
        const token = await createMergeLinkToken(
          integration ? { integration } : undefined,
        );
        setMergeLinkToken(token);
      } catch (err) {
        setMergeLinking(false);
        setMergeLinkProvider(null);
        pendingMergeIntegration.current = null;
        toast.error(err instanceof ApiError ? err.message : "Could not start Merge Link");
      }
    },
    [canManage, mergeLinking, mergeExchanging],
  );

  const onInstall = useCallback(
    (tile: Tile) => {
      if (tile.id === "zoho-people") {
        void onConnect();
        return;
      }
      if (tile.requiresSetup || tile.id === "gusto") {
        toast.message(`${tile.name} requires setup before connecting`);
        return;
      }
      if (isMergeHrisIntegration(tile.id)) {
        const existing = mergeConnectionsByProvider[tile.id];
        if (existing?.status === "connected") {
          toast.message(`${tile.name} is already connected`);
          return;
        }
        // needs_attention → Reconnect via Merge Link; otherwise first-time connect.
        void startMergeLink(tile.id);
        return;
      }
      toast(`${tile.name} setup started`);
    },
    [onConnect, startMergeLink, mergeConnectionsByProvider],
  );

  const status = statusQuery.data?.status ?? "not_connected";

  return {
    selected,
    onSelect: setSelected,
    onBack: () => setSelected(null),
    onInstall,
    onSupport: () => toast("Support message opened"),
    onViewPlans: () => toast("Plan details opened"),
    mergeLinking,
    mergeExchanging,
    mergeLinkToken,
    mergeLinkProvider,
    onMergeLinkSuccess,
    onMergeLinkExit,
    mergeSyncingId: mergeSyncMutation.isPending
      ? (mergeSyncMutation.variables as string | undefined) || null
      : null,
    mergeDisconnectingId: mergeDisconnectMutation.isPending
      ? (mergeDisconnectMutation.variables as string | undefined) || null
      : null,
    mergeConnectionsByProvider,
    onMergeSync: (connectionId: string) => {
      if (mergeSyncMutation.isPending || mergeDisconnectMutation.isPending) return;
      mergeSyncMutation.mutate(connectionId);
    },
    onMergeDisconnect: (connectionId: string) => {
      if (mergeDisconnectMutation.isPending || mergeSyncMutation.isPending) return;
      mergeDisconnectMutation.mutate(connectionId);
    },
    zoho: {
      status,
      configured: statusQuery.data?.configured ?? false,
      integration: statusQuery.data?.integration ?? null,
      loading: statusQuery.isLoading,
      syncing: syncMutation.isPending,
      connecting,
      disconnecting: disconnectMutation.isPending,
      canManage,
      onConnect,
      onSync: () => syncMutation.mutate(),
      onDisconnect: () => disconnectMutation.mutate(),
    },
  };
}
