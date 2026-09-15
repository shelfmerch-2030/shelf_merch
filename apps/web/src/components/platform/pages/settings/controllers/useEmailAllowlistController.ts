import { useEffect, useState } from "react";
import { isBuiltInPlatformEmail, updateSetting } from "../model";

function asEmailList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((e) => String(e ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export type EmailAllowlistVm = {
  emails: string[];
  draft: string;
  busy: boolean;
  err: string;
  canWrite: boolean;
  onDraft: (value: string) => void;
  onAdd: () => void;
  onRemove: (email: string) => void;
  isProtectedEmail: (email: string) => boolean;
};

/** Manages the platform `auth.emailAllowlist` setting (only these emails may auth). */
export function useEmailAllowlistController(
  initial: unknown,
  canWrite: boolean,
  onSaved: () => void,
): EmailAllowlistVm {
  const [emails, setEmails] = useState(() => asEmailList(initial));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setEmails(asEmailList(initial));
  }, [initial]);

  async function persist(next: string[]) {
    setBusy(true);
    setErr("");
    try {
      const saved = await updateSetting("auth.emailAllowlist", next);
      setEmails(asEmailList((saved as { value?: unknown })?.value ?? next));
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update allowlist");
    } finally {
      setBusy(false);
    }
  }

  async function onAdd() {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr("Enter a valid email address");
      return;
    }
    if (emails.includes(email)) {
      setErr("That email is already allowlisted");
      return;
    }
    setDraft("");
    await persist([...emails, email]);
  }

  async function onRemove(email: string) {
    if (isBuiltInPlatformEmail(email)) return;
    await persist(emails.filter((e) => e !== email));
  }

  return {
    emails,
    draft,
    busy,
    err,
    canWrite,
    onDraft: setDraft,
    onAdd,
    onRemove,
    isProtectedEmail: isBuiltInPlatformEmail,
  };
}
