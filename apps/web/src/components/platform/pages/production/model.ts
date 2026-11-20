import { fetchProductionBoard, fetchProductionTasks } from "@/services/platform-api";
import { useLoad } from "../../useLoad";

export {
  PRODUCTION_TASK_STATUSES,
  recordTaskQc,
  requestDelhiveryShipment,
  setTaskStatus,
  uploadTaskQcPhoto,
  fetchProductionTask,
} from "@/services/platform-api";

/** Production board snapshot (task and order buckets). */
export function useProductionBoard(reloadKey: number) {
  return useLoad(() => fetchProductionBoard(), [reloadKey]);
}

/** Production task list; bump `reloadKey` to refetch after a mutation. */
export function useProductionTasks(reloadKey: number, qcStatus: string) {
  return useLoad(
    () => fetchProductionTasks({ limit: 100, qcStatus: qcStatus || undefined }),
    [reloadKey, qcStatus],
  );
}
