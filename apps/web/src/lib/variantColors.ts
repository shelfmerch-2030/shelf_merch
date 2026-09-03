import { isPlaceholderColorHex, resolveColorHex } from "./colorMap";

export type CatalogVariant = {
  size?: string;
  color?: string;
  colorHex?: string;
  material?: string;
  sku?: string;
};

/** Distinct catalog colour names + hex map from variant rows (matches catalog product mapping). */
export function extractVariantColors(
  variants: CatalogVariant[] | undefined,
): { colors: string[]; colorHexByName: Record<string, string> } {
  if (!Array.isArray(variants)) return { colors: [], colorHexByName: {} };
  const seen = new Set<string>();
  const colors: string[] = [];
  const colorHexByName: Record<string, string> = {};
  for (const v of variants) {
    const colorName = (v.color || "").trim();
    const storedHex =
      v.colorHex && !isPlaceholderColorHex(v.colorHex) ? v.colorHex : undefined;
    const label =
      colorName ||
      (storedHex && !isPlaceholderColorHex(storedHex) ? storedHex : "");
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(label);
    const hex = resolveColorHex(colorName || undefined, storedHex);
    if (!isPlaceholderColorHex(hex)) colorHexByName[label] = hex;
  }
  return { colors, colorHexByName };
}

export type ColorSwatch = { name: string; hex: string };

function isWhiteColor(name: string) {
  return name.toLowerCase().trim() === "white";
}

/** Move White to the front when it is a real variant (never injects White). */
export function sortWhiteFirstSwatches(swatches: ColorSwatch[]): ColorSwatch[] {
  const whiteIdx = swatches.findIndex((c) => isWhiteColor(c.name));
  if (whiteIdx <= 0) return swatches;
  const sorted = [...swatches];
  const [white] = sorted.splice(whiteIdx, 1);
  return [white, ...sorted];
}

/** Apply shop/collection preferred-colour curation against real catalog swatches. */
export function curatedColorSwatches(
  swatches: ColorSwatch[],
  preferredColors?: string[],
): ColorSwatch[] {
  const availableNames = swatches.map((c) => c.name);
  if (!availableNames.length) return [];
  const prefs = (preferredColors || []).filter(Boolean);
  const names = prefs.length
    ? prefs.filter((c) => availableNames.includes(c))
    : availableNames;
  const finalNames = names.length ? names : availableNames;
  const byName = new Map(swatches.map((c) => [c.name.toLowerCase(), c]));
  const curated = finalNames.map(
    (name) => byName.get(name.toLowerCase()) ?? { name, hex: resolveColorHex(name) },
  );
  return sortWhiteFirstSwatches(curated);
}

/** Resolve swatches from mapped catalog fields or raw variant rows. */
export function productVariantSwatches(input: {
  colors?: string[];
  colorHexByName?: Record<string, string>;
  variants?: CatalogVariant[];
}): ColorSwatch[] {
  if (input.colors?.length) {
    return input.colors.map((name) => ({
      name,
      hex: input.colorHexByName?.[name] || resolveColorHex(name),
    }));
  }
  const { colors, colorHexByName } = extractVariantColors(input.variants);
  return colors.map((name) => ({
    name,
    hex: colorHexByName[name] || resolveColorHex(name),
  }));
}
