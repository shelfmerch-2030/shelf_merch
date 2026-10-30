import { z } from 'zod';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { tenantCatalogFilter } from '../catalog/catalogFilters.js';
import { listPublicCategories } from '../catalog/platformCatalog.service.js';
import { toCatalogSearchItem } from './catalogSearch.js';

const PRODUCT_ID = /^[a-fA-F0-9]{24}$/;

export const CATALOG_GET_PRODUCT_DESCRIPTION = [
  'Look up one ShelfMerch catalog product by id.',
  'sellingPriceInr is the GST-inclusive price in rupees: the product base price, or a variant price override when one is set.',
  'Only active products a tenant can order are returned. Disabled variants are omitted.',
  'images lists marketing photos, with the primary image first.',
  'Cost, margin, supplier, vendor, source identifiers, customization costs, and production-mask assets are not returned.',
].join(' ');

export const catalogGetProductInputSchema = z.object({
  productId: z
    .string()
    .trim()
    .regex(PRODUCT_ID, 'productId must be a catalog product id')
    .describe('Catalog product id from catalog_search.'),
});

const catalogVariantSchema = z.object({
  sku: z.string(),
  color: z.string(),
  size: z.string(),
  sellingPriceInr: z.number().int(),
  stock: z.number(),
});

export const catalogGetProductOutputSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.string(),
  subcategory: z.string(),
  childCategory: z.string(),
  sellingPriceInr: z.number().int(),
  gstRate: z.number(),
  moq: z.number(),
  primaryImageUrl: z.string(),
  images: z.array(z.string()),
  variants: z.array(catalogVariantSchema),
});

const DETAIL_FIELDS =
  'sku name brand category subcategory childCategory basePriceInr gstRate moq primaryImageUrl imageUrls variants';

/** Same visibility rules as catalog search, narrowed to one id. */
export function catalogProductMongoFilter(productId) {
  return {
    $and: [
      { _id: productId },
      { status: 'active' },
      { 'source.kindOverride': { $ne: 'kit' } },
      tenantCatalogFilter(),
    ],
  };
}

/** Search projection plus the marketing gallery. Production assets are not selected. */
export function toCatalogProductDetail(product) {
  const item = toCatalogSearchItem(product);
  const images = [];
  const seen = new Set();
  const push = (url) => {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!value || seen.has(value)) return;
    seen.add(value);
    images.push(value);
  };
  push(item.primaryImageUrl);
  for (const url of product.imageUrls ?? []) push(url);
  return { ...item, images };
}

export async function getCatalogProduct(productId) {
  const row = await CatalogProduct.findOne(catalogProductMongoFilter(productId))
    .select(DETAIL_FIELDS)
    .lean();
  if (!row) return null;
  return toCatalogProductDetail(row);
}

export function catalogProductText(product) {
  const variants = product.variants
    .map((variant) => `${variant.sku || variant.size || variant.color || 'variant'} ₹${variant.sellingPriceInr}`)
    .join(', ');
  const variantNote = variants ? ` variants: ${variants}` : '';
  return [
    'Catalog product. Price is GST-inclusive rupees.',
    `${product.name} [${product.sku}] ₹${product.sellingPriceInr} incl. GST (${product.gstRate}%) ${product.category}${variantNote}`,
  ].join('\n');
}

export const CATALOG_LIST_CATEGORIES_DESCRIPTION = [
  'List the active ShelfMerch catalog category hierarchy.',
  'Archived categories are omitted. The tree is Parent, then category, then sub-category.',
].join(' ');

export const catalogListCategoriesInputSchema = z.object({});

export const catalogCategoryNodeSchema = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    sortOrder: z.number().int(),
    description: z.string(),
    children: z.array(catalogCategoryNodeSchema),
  }),
);

export const catalogListCategoriesOutputSchema = z.object({
  categories: z.array(catalogCategoryNodeSchema),
});

function toCatalogCategory(node) {
  return {
    id: String(node._id),
    name: node.name ?? '',
    slug: node.slug ?? '',
    sortOrder: Number(node.sortOrder ?? 0),
    description: node.description || '',
    children: (node.children ?? []).map(toCatalogCategory),
  };
}

export async function listCatalogCategories() {
  const tree = await listPublicCategories();
  return { categories: tree.map(toCatalogCategory) };
}

export function catalogCategoriesText(output) {
  const lines = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}${node.name}`);
      walk(node.children ?? [], depth + 1);
    }
  };
  walk(output.categories, 0);
  const header = 'Active catalog categories.';
  if (!lines.length) return `${header}\nNo categories.`;
  return [header, ...lines].join('\n');
}
