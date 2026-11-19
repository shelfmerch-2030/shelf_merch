import { useCallback, useEffect, useRef, useState } from "react";
import { configureSwagState, getSwagState, prepareSwagReview, type SwagPatch, type SwagState } from "./swagApi";

export function useSwagConversation(id: string | null, enabled: boolean) {
  const [state, setState] = useState<SwagState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef({ id, enabled }); current.current = { id, enabled };
  const value = useRef(state); value.current = state;
  const action = useRef(false);
  const refresh = useCallback(async (target = current.current.id) => {
    if (!target || !current.current.enabled) return;
    try {
      const result = await getSwagState(target);
      if (result.state?.canRefreshSavedDesign && current.current.id === target && !action.current) {
        // Metadata-only adoption of a backend-verified, unchanged collection
        // identity/name/product manifest. Never saves or publishes business data.
        action.current = true;
        try { result.state = (await configureSwagState(target, result.state.revision, { refreshSavedDesign: true })).state; }
        finally { action.current = false; }
      }
      if (current.current.id === target && current.current.enabled) setState(previous => previous?.conversationId === target && result.state
        && previous.revision > result.state.revision ? previous : result.state);
    } catch (err) {
      if (current.current.id === target) setError(err instanceof Error ? err.message : "Could not refresh the design");
    }
  }, []);
  useEffect(() => { setState(null); setError(null); void refresh(id); }, [id, enabled, refresh]);
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  async function run<T>(fn: (target: string, revision: number) => Promise<T>, expectedRevision?: number): Promise<T | undefined> {
    const target = id; // A callback belongs to the conversation that rendered it.
    const revision = expectedRevision ?? state?.revision;
    if (!target || current.current.id !== target || !current.current.enabled || value.current?.conversationId !== target || revision === undefined || action.current) return;
    action.current = true; setBusy(true); setError(null);
    try {
      const result = await fn(target, revision);
      return current.current.id === target ? result : undefined;
    } catch (err) {
      if (current.current.id === target) {
        setError(err instanceof Error ? err.message : "Could not update the design. Check its current state before trying again.");
        await refresh(target); // Read only after a stale/network failure; never replay a mutation.
      }
    } finally { action.current = false; setBusy(false); }
  }
  async function change(patch: SwagPatch) {
    const result = await run((target, revision) => configureSwagState(target, revision, patch));
    if (result) { value.current = result.state; setState(result.state); }
    return result?.state;
  }
  const prepare = (mode: "save" | "publish" | "apply", expectedRevision?: number) => run((target, revision) => prepareSwagReview(target, revision, mode), expectedRevision);
  return { state: enabled && state?.conversationId === id ? state : null, busy, error, refresh, change, prepare };
}
