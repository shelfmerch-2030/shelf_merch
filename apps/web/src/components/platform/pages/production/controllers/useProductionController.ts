import { useState } from "react";
import { useSearchParams } from "react-router";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import { fetchProductionTask, useProductionBoard, useProductionTasks } from "../model";
import { useLoad } from "../../../useLoad";

export type ProductionVm = {
  board: ReturnType<typeof useProductionBoard>;
  tasks: ReturnType<typeof useProductionTasks>;
  canWrite: boolean;
  qcFilter: string;
  onQcFilter: (value: string) => void;
  taskLinkError: string;
  managing: Record<string, unknown> | null;
  onManage: (row: Record<string, unknown>) => void;
  onCloseManage: () => void;
  onProductionChanged: () => void;
};

/** Controller for the platform production page. */
export function useProductionController(): ProductionVm {
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const taskId = searchParams.get("taskId");
  const linked = useLoad(
    () => (taskId ? fetchProductionTask(taskId) : Promise.resolve(null)),
    [taskId],
  );
  const managing = selected ?? (taskId ? linked.data : null);
  const [qcFilter, setQcFilter] = useState("");
  const board = useProductionBoard(reloadKey);
  const tasks = useProductionTasks(reloadKey, qcFilter);
  const canWrite = canAccessArea(getStoredUser()?.role, "production", "write");

  return {
    board,
    tasks,
    canWrite,
    qcFilter,
    onQcFilter: setQcFilter,
    taskLinkError: linked.error,
    managing,
    onManage: setSelected,
    onCloseManage: () => {
      setSelected(null);
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("taskId");
          return next;
        },
        { replace: true },
      );
    },
    onProductionChanged: () => setReloadKey((k) => k + 1),
  };
}
