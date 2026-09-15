import { useState } from "react";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import { moveKitToCatalog } from "@/services/platform-api";
import { usePlatformKitsList } from "../model";

export type KitsVm = ReturnType<typeof usePlatformKitsList> & {
  canWrite: boolean;
  movingId: string | null;
  moveError: string;
  onAddToCatalog: (kitId: string) => Promise<void>;
};

/** Controller for the platform kits list. */
export function useKitsController(): KitsVm {
  const [reloadKey, setReloadKey] = useState(0);
  const load = usePlatformKitsList(reloadKey);
  const canWrite = canAccessArea(getStoredUser()?.role, "kits", "write");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");

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

  return { ...load, canWrite, movingId, moveError, onAddToCatalog };
}
