import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clearSession } from "@/services/auth-store";
import { subscribeSessionExpired } from "@/services/sessionExpired";

function loginAgain() {
  clearSession();
  window.location.assign("/login");
}

/** Blocks the current page until the user chooses to sign in again. */
export function SessionExpiredModal() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeSessionExpired(setOpen), []);

  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    root?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    buttonRef.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="session-expired-scrim">
      <div
        className="session-expired-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-desc"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.preventDefault();
        }}
      >
        <h2 id="session-expired-title" className="session-expired-title">
          Your session has expired
        </h2>
        <p id="session-expired-desc" className="session-expired-desc">
          For security reasons, your session has ended. Please sign in again to continue.
        </p>
        <button ref={buttonRef} type="button" className="auth-simple-submit" onClick={loginAgain}>
          Login Again
        </button>
      </div>
    </div>,
    document.body,
  );
}
