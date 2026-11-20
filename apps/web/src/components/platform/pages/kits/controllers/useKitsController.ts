import { useState } from "react";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import { fetchPlatformKits, moveKitToCatalog } from "@/services/platform-api";
import { usePlatformKitsList } from "../model";
import { downloadKitsCsv } from "../kitsCsv";

export type KitsVm = ReturnType<typeof usePlatformKitsList> & {
  canWrite: boolean;
  movingId: string | null;
  moveError: string;
  onAddToCatalog: (kitId: string) => Promise<void>;
  exporting: boolean;
  exportError: string;
  onExport: () => Promise<void>;
};

/** Controller for the platform kits list. */
export function useKitsController(): KitsVm {
  const [reloadKey, setReloadKey] = useState(0);
  const load = usePlatformKitsList(reloadKey);
  const canWrite = canAccessArea(getStoredUser()?.role, "kits", "write");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function onAddToCatalog(kitId: string) {
    setMoveError("");
    setMovingId(kitId);
    try {
      await moveKitToCatalog(kitId);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Failed to move kit to catalog");
    } finally {
      setMovingId(null);
    }
  }

  async function onExport() {
    if (load.loading || load.error || !load.data || exporting) return;
    setExportError("");
    setExporting(true);
    try {
      const kits = await fetchPlatformKits({ status: "all" });
      downloadKitsCsv(kits);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Failed to export kits");
    } finally {
      setExporting(false);
    }
  }

  return {
    ...load,
    canWrite,
    movingId,
    moveError,
    onAddToCatalog,
    exporting,
    exportError,
    onExport,
  };
}
