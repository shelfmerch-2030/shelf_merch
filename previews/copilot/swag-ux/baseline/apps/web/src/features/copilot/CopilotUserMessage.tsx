import { FileText, Image } from "lucide-react";
import type { CopilotMessageAttachment } from "./api";
import { formatAttachmentSize } from "./attachments";

const labels = {
  swag_artwork: "Swag artwork",
  purchase_order: "Purchase order",
  artwork: "Store logo",
  banner: "Store banner",
  file: "Attachment",
};
export function CopilotUserMessage({
  content,
  attachments = [],
}: {
  content: string;
  attachments?: CopilotMessageAttachment[];
}) {
  // Strip only the generated transport suffix when attachment metadata is present.
  // Keep the original content and ticket references unchanged in state/API requests.
  const marker = "\n\n[Attachments]\n";
  const suffixIndex = attachments.length ? content.lastIndexOf(marker) : -1;
  const generatedSuffix = suffixIndex >= 0 && /^- (?:Purchase order|Store-logo artwork|Store banner artwork|Swag artwork|Reference product image|File) ["(]/.test(content.slice(suffixIndex + marker.length));
  const text = generatedSuffix ? content.slice(0, suffixIndex) : content;
  return (
    <>
      {text}
      {attachments.length ? (
        <ul className="sm-copilot-message-files" aria-label="Message attachments">
          {attachments.map((file, index) => (
            <li key={`${file.id}-${index}`}>
            {(file.mimeType || "").startsWith("image/") ? (
                <Image size={17} aria-hidden="true" />
              ) : (
                <FileText size={17} aria-hidden="true" />
              )}
              <span>
                <strong>{file.originalName || "Attached file"}</strong>
                <small>
                {[labels[file.kind] || "Attachment", formatAttachmentSize(file.sizeBytes)].filter(Boolean).join(" · ")}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
