import { useTaskManageController } from "../controllers/useTaskManageController";
import { TaskManageModalView } from "./TaskManageModalView";

/** Thin binding for the production task manage modal widget. */
export function TaskManageModal({
  row,
  onClose,
  onChanged,
  readOnly = false,
}: {
  row: Record<string, unknown>;
  onClose: () => void;
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const vm = useTaskManageController(row, onClose, onChanged, readOnly);
  return <TaskManageModalView {...vm} />;
}
