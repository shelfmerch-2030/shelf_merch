import { FileText, Image } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchSentSwagArtwork, type CopilotMessageAttachment } from "./api";

const labels = {
  swag_artwork: "Swag artwork",
  purchase_order: "Purchase order",
  artwork: "Store logo",
  banner: "Store banner",
  file: "Attachment",
};
function SentLogo({ file, conversationId }: { file: CopilotMessageAttachment; conversationId?: string | null }) {
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    let url: string | undefined;
    void fetchSentSwagArtwork(conversationId, file.id, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    }).catch(() => { if (!controller.signal.aborted) setPreview(null); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [conversationId, file.id]);
  return <figure className="sm-copilot-sent-logo">
    {preview ? <img src={preview} alt="Uploaded company logo" onError={() => setPreview(null)} />
      : <span role="status">{preview === null ? 'Logo preview unavailable' : 'Loading logo preview…'}</span>}
  </figure>;
}
export function CopilotUserMessage({
  content,
  attachments = [],
  conversationId,
}: {
  content: string;
  attachments?: CopilotMessageAttachment[];
  conversationId?: string | null;
}) {
  // Strip only the generated transport suffix when attachment metadata is present.
  // Keep the original content and ticket references unchanged in state/API requests.
  const marker = "\n\n[Attachments]\n";
  const suffixIndex = attachments.length ? content.lastIndexOf(marker) : -1;
  const generatedSuffix = suffixIndex >= 0 && /^- (?:Purchase order|Store-logo artwork|Store banner artwork|Swag artwork|Reference product image|File) ["(]/.test(content.slice(suffixIndex + marker.length));
  const text = generatedSuffix ? content.slice(0, suffixIndex) : content;
  if (!attachments.length) return <>{text}</>;
  const hasText = Boolean(text.trim()) && text !== `Attached ${attachments.length} file(s)`;
  return (
    <>
      {hasText && <div className="sm-copilot-user-text">{text}</div>}
      <ul className="sm-copilot-message-files" aria-label="Message attachments">
        {attachments.map((file, index) => {
          if (file.kind === 'swag_artwork') return <li className="sm-copilot-message-logo" key={`${conversationId}:${file.id}`}><SentLogo file={file} conversationId={conversationId} /></li>;
          const isImage = file.mimeType?.startsWith('image/');
          const Icon = isImage ? Image : FileText;
          return <li key={`${file.id}-${index}`}>
            <Icon size={17} aria-hidden="true" />
            <span>{file.kind === 'file' && isImage ? 'Image attachment' : labels[file.kind] || 'Attachment'}</span>
          </li>;
        })}
      </ul>
    </>
  );
}
