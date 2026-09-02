import type { UiProduct } from "@/services/mappers";
import {
  listPrintAreas,
  primaryAreaKey,
  printAreaKey,
} from "@/features/swag/mockup-bake";

/** Create-a-kit only: detect polo / polo-style tees. */
export function isKitPoloProduct(p: UiProduct | undefined): boolean {
  if (!p) return false;
  const hay = `${p.nm || ""} ${p.category || ""} ${p.subcategory || ""}`.toLowerCase();
  return /\bpolo\b/.test(hay);
}

/** Find a print area whose catalog key/label is "left" (e.g. left chest). */
export function findKitLeftPrintArea(p: UiProduct | undefined) {
  const areas = listPrintAreas(p);
  if (!areas.length) return null;
  const index = areas.findIndex((a) => {
    const token = `${a?.key || ""} ${a?.label || ""}`.toLowerCase();
    return /\bleft\b/.test(token);
  });
  if (index < 0) return null;
  return { area: areas[index], index, key: printAreaKey(p, areas[index], index) };
}

/**
 * Create-a-kit primary placeholder: polos prefer the "left" print area when present.
 * All other products keep the shared catalog primary.
 */
export function kitPreferredPrintAreaKey(p: UiProduct): string {
  if (isKitPoloProduct(p)) {
    const left = findKitLeftPrintArea(p);
    if (left) return left.key;
  }
  return primaryAreaKey(p);
}
