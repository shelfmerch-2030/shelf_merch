import { useEffect, useState } from "react";
import {
  fetchDemoLoginPassword,
  generateDemoLoginPassword,
  revokeDemoLoginPassword,
  type DemoLoginPasswordStatus,
} from "../model";

export type DemoLoginPasswordVm = {
  status: DemoLoginPasswordStatus | null;
  generatedPassword: string;
  loading: boolean;
  busy: boolean;
  err: string;
  canWrite: boolean;
  onGenerate: () => void;
  onRevoke: () => void;
  onCopy: () => void;
};

export function useDemoLoginPasswordController(canWrite: boolean): DemoLoginPasswordVm {
  const [status, setStatus] = useState<DemoLoginPasswordStatus | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    fetchDemoLoginPassword()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load demo password");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onGenerate() {
    setBusy(true);
    setErr("");
    try {
      const result = await generateDemoLoginPassword();
      setStatus(result);
      setGeneratedPassword(result.password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not generate password");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    setBusy(true);
    setErr("");
    try {
      const result = await revokeDemoLoginPassword();
      setStatus(result);
      setGeneratedPassword("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not revoke password");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard?.writeText(generatedPassword);
    } catch {
      setErr("Could not copy password");
    }
  }

  return {
    status,
    generatedPassword,
    loading,
    busy,
    err,
    canWrite,
    onGenerate,
    onRevoke,
    onCopy,
  };
}
