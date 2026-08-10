import { PlatformKit } from './platformKit.model.js';

/**
 * Parse tenant Kit.designNotes for Shopify / platform curated clones.
 * Returns null when notes are absent, invalid JSON, or not curated.
 */
export function parseCuratedKitMeta(designNotes) {
  try {
    if (!designNotes) return null;
    const parsed = JSON.parse(designNotes);
    if (parsed && parsed.curated) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function isCuratedKitMeta(meta) {
  return Boolean(meta && meta.curated);
}

/**
 * Live platform approxValueInr (GST-inclusive) when originalId is present;
 * otherwise fall back to frozen designNotes / tenant kitPrice.
 */
export async function resolveCuratedApproxValueInr(kit, meta) {
  const fromMeta = Math.round(Number(meta?.approxValueInr) || 0);
  const fromKit = Math.round(Number(kit?.kitPrice) || 0);
  const originalId = meta?.originalId;
  if (originalId) {
    const platformKit = await PlatformKit.findById(originalId).select('approxValueInr').lean();
    const live = Math.round(Number(platformKit?.approxValueInr) || 0);
    if (live > 0) return live;
  }
  if (fromMeta > 0) return fromMeta;
  return fromKit;
}
