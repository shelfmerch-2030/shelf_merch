import { useImportContactsController } from "./controllers/useImportContactsController";
import { ImportContactsPanelView } from "./views/ImportContactsPanelView";

/** Thin binding for the CSV import panel widget. */
export function ImportContactsPanel({
  onDone,
  onImportSuccess,
}: {
  onDone: () => void;
  onImportSuccess?: (count: number) => void;
}) {
  const vm = useImportContactsController(onDone, onImportSuccess);
  return <ImportContactsPanelView {...vm} />;
}
