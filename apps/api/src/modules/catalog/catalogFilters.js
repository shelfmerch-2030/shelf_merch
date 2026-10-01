/** Legacy rows without `enabled` are treated as enabled. */
export function isVariantEnabled(variant) {
  return variant?.enabled !== false;
}

/** Variants visible to tenants / storefront / redemption clients. */
export function filterEnabledVariants(variants) {
  return (variants || []).filter(isVariantEnabled);
}

/** Shallow-copy a product (lean or document) with only enabled variants. */
export function withEnabledVariants(product) {
  if (!product) return product;
  const obj = product.toObject ? product.toObject() : { ...product };
  return { ...obj, variants: filterEnabledVariants(obj.variants) };
}

/** Mongo filter for platform catalog/inventory source tabs. */
export function sourceProviderFilter(source) {
  if (source === 'shopify') return { 'source.provider': 'shopify' };
  if (source === 'native') return { 'source.provider': { $nin: ['shopify', 'seed'] } };
  return {};
}

/** Hide demo seed catalog rows from the platform control plane. */
export function excludeSeedProductsFilter() {
  return { 'source.provider': { $ne: 'seed' } };
}

/** Tenant catalog: active platform products tenants can brand (incl. legacy rows without source). */
export function tenantCatalogFilter() {
  return {
    $or: [
      { 'source.provider': { $in: ['manual', 'shopify', 'seed'] } },
      { source: { $exists: false } },
      { 'source.provider': { $exists: false } },
    ],
  };
}

/**
 * Nested subcategory aliases that used to be top-level categories.
 * Parent browse queries should still return legacy rows under the old name.
 */
const CATEGORY_INCLUDES = {
  Accessories: [
    'Accessories',
    'Key Chains',
    'Bags',
    'Drinkware',
    'Office Supplies',
    'Technology',
    'Card Holders',
  ],
  // Direct filters and older links still match products stored under these names.
  'Office Supplies': ['Office Supplies', 'Card Holders'],
};

/** Mongo category filter; expands parents to include nested legacy category names. */
export function categoryFilter(category) {
  if (!category) return {};
  const values = CATEGORY_INCLUDES[category] || [category];
  return values.length === 1 ? { category: values[0] } : { category: { $in: values } };
}

export function productSourceLabel(source) {
  return source?.provider === 'shopify' ? 'shopify' : 'native';
}

/** Case-insensitive match on name, SKU, or brand. */
export function productSearchFilter(search) {
  const q = String(search ?? '').trim();
  if (!q) return {};
  const regex = { $regex: q, $options: 'i' };
  return { $or: [{ name: regex }, { sku: regex }, { brand: regex }] };
}
