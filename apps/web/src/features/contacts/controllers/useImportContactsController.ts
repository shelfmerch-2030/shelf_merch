import { useState } from "react";
import { toast } from "sonner";
import { useImportContacts } from "../model";
import type { ContactImportStatus } from "../model";

const MAX_BYTES = 5 * 1024 * 1024;

const TEMPLATE =
  "First Name,Last Name,Email,Phone,Role,Department,Employee Code,Address,City,State,PIN Code,Country\n";

export type ImportContactsVm = {
  file: File | null;
  status: ContactImportStatus | null;
  busy: boolean;
  finished: boolean;
  onPickFile: (file: File | null) => void;
  onClearFile: () => void;
  onRunImport: () => void;
  onDownloadTemplate: () => void;
  onDone: () => void;
};

/** Controller for the CSV import panel: file selection, import flow, status. */
export function useImportContactsController(
  onDone: () => void,
  onImportSuccess?: (count: number) => void,
): ImportContactsVm {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ContactImportStatus | null>(null);
  const importContacts = useImportContacts();
  const busy = importContacts.isPending;
  const finished = status?.status === "done" || status?.status === "failed";

  function onPickFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error("File must be 5 MB or smaller");
      return;
    }
    setFile(f);
    setStatus(null);
  }

  async function onRunImport() {
    if (!file) return;
    try {
      const result = await importContacts.mutateAsync({ file, onStatus: setStatus });
      setStatus(result);
      if (result.status === "done") {
        toast.success(`Imported ${result.validCount} contact${result.validCount === 1 ? "" : "s"}`);
        if (result.validCount > 0) onImportSuccess?.(result.validCount);
      } else {
        toast.error("Import failed — check the errors below");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  function onDownloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "shelf-merch-contacts-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    file,
    status,
    busy,
    finished,
    onPickFile,
    onClearFile: () => {
      setFile(null);
      setStatus(null);
    },
    onRunImport,
    onDownloadTemplate,
    onDone,
  };
}
