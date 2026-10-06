import { useRef, useState } from "react";
import { Cloud, FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { WalletUploadFile } from "../types";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const CLOUD_SOURCES = [
  { id: "drive" as const, label: "Google Drive", icon: Cloud, soon: true },
  { id: "cloud" as const, label: "Other cloud", icon: Cloud, soon: true },
];

function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExt(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase() || "DOC";
  return ext.length <= 4 ? ext : "DOC";
}

function isAllowedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx")) return true;
  return (
    file.type === "application/pdf" ||
    file.type === "application/msword" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function validateAndBuild(file: File, source: WalletUploadFile["source"]): WalletUploadFile | null {
  if (!isAllowedFile(file)) {
    toast.error("Use PDF or DOCX only");
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast.error("Maximum file size is 25 MB");
    return null;
  }
  return { name: file.name, size: file.size, source, file };
}

type DocumentUploadZoneProps = {
  file: WalletUploadFile | null;
  onFileChange: (file: WalletUploadFile | null) => void;
  /** Compact layout for add-funds modal — hides cloud sources, taller dropzone */
  variant?: "default" | "modal";
};

export function DocumentUploadZone({
  file,
  onFileChange,
  variant = "default",
}: DocumentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const applyFile = (picked: File, source: WalletUploadFile["source"]) => {
    const next = validateAndBuild(picked, source);
    if (!next) return;
    onFileChange(next);
    toast.success("Document submitted");
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (picked) applyFile(picked, "device");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) applyFile(picked, "device");
  };

  const onSourcePick = (soon?: boolean) => {
    if (soon) {
      toast.message("Cloud upload coming soon", {
        description: "Upload from this device",
      });
      return;
    }
    inputRef.current?.click();
  };

  const isModal = variant === "modal";
  const panelClass = `wallet-doc-panel${isModal ? " wallet-doc-panel--modal" : ""}${file ? " wallet-doc-panel--filled" : ""}`;

  if (file) {
    const sizeLabel = file.size ? formatFileSize(file.size) : null;
    const sourceLabel = file.source === "device" ? "From this device" : "From cloud";

    return (
      <div className={panelClass}>
        <div className="wallet-doc-file">
          <div className="wallet-doc-file-icon" aria-hidden>
            <FileText size={18} strokeWidth={2} />
            <span className="wallet-doc-file-ext">{fileExt(file.name)}</span>
          </div>
          <div className="wallet-doc-file-meta">
            <div className="wallet-doc-file-name">{file.name}</div>
            <div className="wallet-doc-file-sub">
              {[sizeLabel, sourceLabel].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            type="button"
            className="wallet-doc-file-remove"
            aria-label="Remove document"
            onClick={() => onFileChange(null)}
          >
            <X size={15} />
          </button>
        </div>
        <div className="wallet-doc-file-foot">
          <span className="wallet-doc-file-status">
            <span className="wallet-doc-file-status-dot" />
            Ready for review
          </span>
          <button
            type="button"
            className="wallet-doc-replace"
            onClick={() => inputRef.current?.click()}
          >
            Replace file
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="wallet-doc-file-inp"
          accept={ACCEPT}
          onChange={onInputChange}
          tabIndex={-1}
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <input
        ref={inputRef}
        type="file"
        className="wallet-doc-file-inp"
        accept={ACCEPT}
        onChange={onInputChange}
        tabIndex={-1}
        aria-hidden
      />

      <div
        className={`wallet-doc-dropzone${dragOver ? " wallet-doc-dropzone--drag" : ""}${isModal ? " wallet-doc-dropzone--modal" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => isModal && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (isModal && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <div className="wallet-doc-dropzone-icon" aria-hidden>
          <Upload size={20} strokeWidth={2} />
        </div>
        <div className="wallet-doc-dropzone-body">
          <div className="wallet-doc-dropzone-copy">
            <div className="wallet-doc-dropzone-title">
              {isModal ? "Drag and drop your file here" : "Drag & drop your document"}
            </div>
            <div className="wallet-doc-dropzone-hint">
              {isModal ? "or click browse below" : "PDF or DOCX · up to 25 MB"}
            </div>
          </div>
          <button
            type="button"
            className="wallet-doc-browse"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Browse files
          </button>
        </div>
      </div>

      {!isModal && (
        <div className="wallet-doc-sources">
          <span className="wallet-doc-sources-label">Or from cloud</span>
          <div className="wallet-doc-sources-chips">
            {CLOUD_SOURCES.map((src) => {
              const Icon = src.icon;
              return (
                <button
                  key={src.id}
                  type="button"
                  className="wallet-doc-chip wallet-doc-chip--soon"
                  onClick={() => onSourcePick(true)}
                >
                  <Icon size={14} strokeWidth={2} aria-hidden />
                  <span>{src.label}</span>
                  <span className="wallet-doc-soon-badge">Soon</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
