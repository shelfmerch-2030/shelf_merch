import { filterEnabledVariants } from '../catalog/catalogFilters.js';

/** Groups that never need a recipient size (fixed SKU / one-size items). */
export const NO_SIZE_GROUPS = new Set([
  'bottle',
  'mug',
  'tumbler',
  'drinkware',
  'pen',
  'notebook',
  'pack',
  'bag',
  'cap',
  'hat',
  'keychain',
  'sticker',
  'tech',
  'charger',
  'speaker',
]);

export const APPAREL_GROUPS = new Set([
  'tee',
  'hoodie',
  'polo',
  'shirt',
  'sweatshirt',
  'jacket',
  'pant',
  'pants',
  'shorts',
  'apron',
  'tank',
  'crew',
]);

const GROUP_BY_CATEGORY = {
  Apparel: 'tee',
  Drinkware: 'bottle',
  Bags: 'bag',
  Technology: 'power',
  Office: 'note',
  'Health & Wellness': 'pillow',
  'Food & Beverages': 'bottle',
};

const DRINKWARE_NAME = /\bbottle\b|\bmug\b|\btumbler\b|\bflask\b|\bdrinkware\b/i;

function distinctVariantValues(variants, key) {
  return [...new Set(filterEnabledVariants(variants).map((v) => v[key]).filter(Boolean))];
}

/** Prefer catalog group/category over kit ref — refs can be stale or wrong. */
export function effectiveProductGroup(product, ref = {}) {
  const fromProduct = String(product.group || '').toLowerCase().trim();
  if (fromProduct) return fromProduct;
  const fromCategory = GROUP_BY_CATEGORY[product.category];
  if (fromCategory) return fromCategory.toLowerCase();
  return String(ref.group || '').toLowerCase().trim();
}

export function isDrinkwareProduct(product, ref = {}) {
  const group = effectiveProductGroup(product, ref);
  const category = String(product.category || '').toLowerCase();
  const name = String(ref.name || product.name || '');

  if (NO_SIZE_GROUPS.has(group) && !['pack', 'bag'].includes(group)) return true;
  if (/drink|bottle|mug|tumbler|beverage/.test(category)) return true;
  if (DRINKWARE_NAME.test(name)) return true;
  return false;
}

function isApparelProduct(product, ref = {}) {
  if (isDrinkwareProduct(product, ref)) return false;
  const group = effectiveProductGroup(product, ref);
  const category = String(product.category || '').toLowerCase();
  return APPAREL_GROUPS.has(group) || category === 'apparel';
}


function firstUrl(...candidates) {
  for (const url of candidates) {
    if (url && String(url).trim()) return String(url).trim();
  }
  return '';
}

/** Resolve size/colour pickers for kit redemption — group-aware, not variants-only. */
export function resolveKitItemOptions(product, ref = {}) {
  const rawSizes = distinctVariantValues(product.variants, 'size');
  const rawColors = distinctVariantValues(product.variants, 'color');

  // Drinkware / fixed-SKU accessories: never ask for size, but colour must stay selectable.
  if (isDrinkwareProduct(product, ref)) {
    return {
      sizes: [],
      colors: rawColors,
      requiresSize: false,
      requiresColor: rawColors.length > 0,
    };
  }

  if (isApparelProduct(product, ref)) {
    return {
      sizes: rawSizes,
      colors: rawColors,
      requiresSize: rawSizes.length > 0,
      requiresColor: rawColors.length > 0,
    };
  }

  return {
    sizes: rawSizes,
    colors: rawColors,
    requiresSize: rawSizes.length > 0,
    requiresColor: rawColors.length > 0,
  };
}

/** Best product image for kit cards — drinkware uses photos, apparel uses mask cutouts. */
export function kitProductImageUrl(product, ref = {}) {
  const urls = product.imageUrls || [];
  if (isDrinkwareProduct(product, ref)) {
    return firstUrl(product.primaryImageUrl, urls[0], urls[1], product.maskImageUrl, product.baseImageUrl);
  }
  return firstUrl(product.maskImageUrl, product.primaryImageUrl, urls[0], product.baseImageUrl);
}

export function kitItemRequiresSize(product, ref = {}) {
  return resolveKitItemOptions(product, ref).requiresSize;
}

export function kitItemRequiresColor(product, ref = {}) {
  return resolveKitItemOptions(product, ref).requiresColor;
}
