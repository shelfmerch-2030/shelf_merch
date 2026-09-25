let started = false;

export function isSessionLogoutStarted() {
  return started;
}

/** True only for the first caller, so parallel failures share one logout. */

export function beginSessionLogout() {
  if (started) return false;
  started = true;
  return true;
}

/** Test-only reset. */

export function resetSessionLogoutState() {
  started = false;
}
