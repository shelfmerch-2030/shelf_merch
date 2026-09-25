type Listener = (open: boolean) => void;

let open = false;
const listeners = new Set<Listener>();

export function isSessionExpiredModalOpen() {
  return open;
}

/** Opens the blocking session modal. Repeated calls stay on the same modal. */
export function openSessionExpiredModal() {
  if (open) return;
  open = true;
  for (const listener of listeners) listener(true);
}

export function subscribeSessionExpired(listener: Listener) {
  listeners.add(listener);
  listener(open);
  return () => {
    listeners.delete(listener);
  };
}

export function resetSessionExpiredState() {
  open = false;
  for (const listener of listeners) listener(false);
}
