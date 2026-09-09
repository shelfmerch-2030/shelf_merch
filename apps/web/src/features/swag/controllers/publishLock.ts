/** In-flight guard so Publish cannot start a second request before the first finishes. */
export function acquirePublishLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releasePublishLock(lock: { current: boolean }): void {
  lock.current = false;
}