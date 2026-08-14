import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  mergeLinkHostUrl,
  parseMergeLinkHostMessage,
} from "./mergeLinkHostMessages";

type Props = {
  linkToken: string;
  /** Used with linkToken to remount iframe on provider switches. */
  provider?: string | null;
  onSuccess: (publicToken: string) => void;
  onExit: () => void;
};

/**
 * Stadium-style in-app Merge Link: dark ShelfMerch backdrop + isolated iframe.
 * Outer Dialog content is visually transparent so only Merge's own auth card shows.
 */
export function MergeLinkSession({ linkToken, provider, onSuccess, onExit }: Props) {
  const onSuccessRef = useRef(onSuccess);
  const onExitRef = useRef(onExit);
  onSuccessRef.current = onSuccess;
  onExitRef.current = onExit;

  const [open, setOpen] = useState(true);
  const [iframeReady, setIframeReady] = useState(false);
  const settledRef = useRef(false);

  const iframeSrc =
    typeof window !== "undefined" ? mergeLinkHostUrl(window.location.origin, linkToken) : "";

  useEffect(() => {
    settledRef.current = false;
    setIframeReady(false);
    setOpen(true);

    const onMessage = (event: MessageEvent) => {
      const parsed = parseMergeLinkHostMessage(event, window.location.origin);
      if (!parsed) return;

      if (parsed.type === "ready") {
        setIframeReady(true);
        return;
      }
      if (parsed.type === "success") {
        if (settledRef.current) return;
        settledRef.current = true;
        setOpen(false);
        onSuccessRef.current(parsed.publicToken);
        return;
      }
      if (parsed.type === "error") {
        if (settledRef.current) return;
        settledRef.current = true;
        if (parsed.message) toast.error(parsed.message);
        setOpen(false);
        onExitRef.current();
        return;
      }
      if (parsed.type === "exit") {
        if (settledRef.current) return;
        settledRef.current = true;
        setOpen(false);
        onExitRef.current();
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [linkToken, provider]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    setOpen(false);
    if (!settledRef.current) {
      settledRef.current = true;
      onExitRef.current();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        {/* Stadium-matched light overlay; do not use shared Dialog bg-black/80. */}
        <DialogOverlay className="merge-link-modal-overlay bg-black/25" />
        {/*
          Compose Content without the shared DialogContent close (X) button.
          Visual chrome is stripped so Merge's own modal floats on the light overlay.
        */}
        <DialogPrimitive.Content
          className="merge-link-modal"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Connect HRIS provider</DialogTitle>
          <DialogDescription className="sr-only">
            Complete authorization with your HRIS provider through Merge Link. Press Escape to
            cancel.
          </DialogDescription>

          <div className="merge-link-modal__frame">
            {!iframeReady ? (
              <div className="merge-link-modal__loading" aria-live="polite">
                Loading secure connection…
              </div>
            ) : null}
            <iframe
              key={`${provider ?? "hris"}:${linkToken}`}
              title="Merge Link"
              src={iframeSrc}
              className="merge-link-modal__iframe"
              allow="clipboard-write"
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
