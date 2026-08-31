/** Normalize platform kit variant rows - legacy string[] or { imageUrl, label }[] */

export function normalizeVariantEntry(entry) {
  if (typeof entry === 'string') {
    const imageUrl = entry.trim();
    return imageUrl ? { imageUrl, label: '' } : null;
  }
  if (entry && typeof entry === 'object' && entry.imageUrl) {
    return {
      imageUrl: String(entry.imageUrl).trim(),
      label: String(entry.label || '').trim(),
    };
  }
  return null;
}

export function normalizeVariantImages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeVariantEntry(entry)).filter(Boolean);
}

export function variantImageUrls(raw) {
  return normalizeVariantImages(raw).map((v) => v.imageUrl).filter(Boolean);
}

export function variantLabelForUrl(raw, imageUrl, fallbackIndex = 0) {
  const variants = normalizeVariantImages(raw);
  const idx = variants.findIndex((v) => v.imageUrl === imageUrl);
  const entry = idx >= 0 ? variants[idx] : null;
  if (entry?.label) return entry.label;
  return `Variant ${(idx >= 0 ? idx : fallbackIndex) + 1}`;
}

export function withNormalizedVariantImages(kit) {
  if (!kit || typeof kit !== 'object') return kit;
  return {
    ...kit,
    variantImages: normalizeVariantImages(kit.variantImages),
  };
}
