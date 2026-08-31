export type KitVariantImage = {
  imageUrl: string;
  label?: string;
};

export function normalizeVariantImages(raw: unknown): KitVariantImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): KitVariantImage | null => {
      if (typeof entry === "string") {
        const imageUrl = entry.trim();
        return imageUrl ? { imageUrl, label: "" } : null;
      }
      if (entry && typeof entry === "object" && "imageUrl" in entry) {
        const row = entry as { imageUrl?: string; label?: string };
        const imageUrl = String(row.imageUrl || "").trim();
        if (!imageUrl) return null;
        return { imageUrl, label: String(row.label || "").trim() };
      }
      return null;
    })
    .filter((v): v is KitVariantImage => v !== null);
}

export function variantImageUrls(raw: unknown): string[] {
  return normalizeVariantImages(raw).map((v) => v.imageUrl).filter(Boolean);
}

export function variantLabelForUrl(
  raw: unknown,
  imageUrl: string,
  fallbackIndex = 0,
): string {
  const variants = normalizeVariantImages(raw);
  const idx = variants.findIndex((v) => v.imageUrl === imageUrl);
  const entry = idx >= 0 ? variants[idx] : null;
  if (entry?.label) return entry.label;
  return `Variant ${(idx >= 0 ? idx : fallbackIndex) + 1}`;
}

export function variantLabel(variant: KitVariantImage, index: number): string {
  return variant.label?.trim() || `Variant ${index + 1}`;
}
