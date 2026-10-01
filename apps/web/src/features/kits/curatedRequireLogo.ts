/**
 * Whether Send Kit must collect a brand logo for a curated (pre-designed) kit.
 *
 * Priority:
 * 1. Live platform kit `rules.requireLogo` when that boolean is present
 * 2. Snapshot on tenant clone (`designNotes.requireLogo`)
 * 3. Default true (legacy kits / missing flag) — matches historical behavior
 *
 * Customised (non-curated) kits never use this gate.
 */
export function curatedKitRequiresLogo(
  meta: { curated?: boolean; requireLogo?: boolean } | null | undefined,
  platformRules?: { requireLogo?: boolean } | null,
): boolean {
  if (!meta?.curated) return false;

  if (platformRules && typeof platformRules.requireLogo === "boolean") {
    return platformRules.requireLogo;
  }

  if (typeof meta.requireLogo === "boolean") {
    return meta.requireLogo;
  }

  return true;
}
