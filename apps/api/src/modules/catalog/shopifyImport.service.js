import crypto from 'node:crypto';
import { CatalogProduct } from './catalogProduct.model.js';
import { PlatformKit } from '../kits/platformKit.model.js';
import { ApiError } from '../../utils/errors.js';

const SHOPIFY_API_VERSION = '2026-04';
const SHOPIFY_GRAPHQL_API_VERSION = '2026-04';
const MAX_PAGES = 20; // safety cap (~5000 products at limit=250)

/** Strip protocol, trailing slash, and any /admin path → bare host. */
export function normalizeDomain(input) {
  if (!input || typeof input !== 'string') {
    throw new ApiError(422, 'A Shopify store domain is required', 'INVALID_DOMAIN');
  }
  let host = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  // Shop handle only ("acme") is a common paste; Admin API needs the myshopify host.
  if (/^[a-z0-9][a-z0-9-]*$/.test(host)) host = `${host}.myshopify.com`;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
    throw new ApiError(422, `"${input}" is not a valid store domain`, 'INVALID_DOMAIN');
  }
  return host;
}

/** Trim quotes / Bearer prefix so a pasted Admin API token still authenticates. */
export function normalizeAccessToken(input) {
  if (!input || typeof input !== 'string') {
    throw new ApiError(422, 'A Shopify Admin API access token is required', 'TOKEN_REQUIRED');
  }
  const token = input.trim().replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
  if (!token) {
    throw new ApiError(422, 'A Shopify Admin API access token is required', 'TOKEN_REQUIRED');
  }
  if (/^shpss_/i.test(token)) {
    throw new ApiError(
      422,
      'That value is the Shopify client secret, not an access token. Paste the Admin API access token (shpat_…), or exchange client credentials for one first.',
      'TOKEN_REQUIRED',
    );
  }
  return token;
}

function shopifyErrorText(body) {
  const errors = body?.errors;
  if (typeof errors === 'string') return errors;
  if (Array.isArray(errors)) {
    return errors.map((entry) => (typeof entry === 'string' ? entry : entry?.message)).filter(Boolean).join('; ');
  }
  if (errors && typeof errors === 'object') return JSON.stringify(errors);
  return String(body?.error_description || body?.message || '').trim();
}

function throwShopifyAuthError(status, body) {
  const detail = shopifyErrorText(body);
  if (/scope|not approved|permission/i.test(detail)) {
    throw new ApiError(
      401,
      `Shopify token is missing a required Admin API scope (need read_products; read_inventory for HSN). Enable the scopes, reinstall the app, and paste the new Admin API access token. ${detail}`,
      'SHOPIFY_UNAUTHORIZED',
    );
  }
  throw new ApiError(
    401,
    detail
      ? `Shopify rejected this store/token (HTTP ${status}): ${detail}`
      : 'Invalid Shopify access token or domain. Use the *.myshopify.com host and the Admin API access token (shpat_…), not the client secret (shpss_…).',
    'SHOPIFY_UNAUTHORIZED',
  );
}

function gidNum(gid) {
  const match = String(gid || '').match(/(\d+)$/);
  return match ? match[1] : String(gid || '');
}

function graphProductToRest(node) {
  const images = (node.images?.nodes ?? [])
    .map((image) => ({ src: image?.url }))
    .filter((image) => image.src);
  const featured = node.featuredImage?.url || images[0]?.src;
  return {
    id: gidNum(node.id),
    title: node.title,
    handle: node.handle,
    vendor: node.vendor,
    product_type: node.productType,
    tags: Array.isArray(node.tags) ? node.tags.join(', ') : (node.tags || ''),
    status: String(node.status || '').toLowerCase(),
    body_html: node.descriptionHtml || '',
    options: (node.options ?? []).map((option) => ({ name: option.name })),
    image: featured ? { src: featured } : null,
    images,
    variants: (node.variants?.nodes ?? []).map((variant) => {
      const selected = variant.selectedOptions ?? [];
      return {
        sku: variant.sku || '',
        price: variant.price,
        inventory_quantity: variant.inventoryQuantity ?? 0,
        inventory_item_id: gidNum(variant.inventoryItem?.id),
        option1: selected[0]?.value,
        option2: selected[1]?.value,
        option3: selected[2]?.value,
      };
    }),
  };
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<\/td>\s*<td[^>]*>/gi, ': ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripNonContent(html = '') {
  return String(html)
    .replace(/<(?:script|style|template|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|template|svg)>/gi, ' ')
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, ' ');
}

function tabSectionHtml(pageHtml, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startPattern = new RegExp(
    `<div\\b[^>]*data-tab-title=["']${escaped}["'][^>]*>`,
    'i',
  );
  const start = startPattern.exec(pageHtml);
  if (!start) return '';
  const contentStart = start.index + start[0].length;
  const rest = pageHtml.slice(contentStart);
  const nextTab = /<div\b[^>]*data-tab-title=["'][^"']+["'][^>]*>/i.exec(rest);
  return rest.slice(0, nextTab?.index ?? rest.length);
}

function featureRowsFromHtml(sectionHtml) {
  const rows = [];
  for (const match of sectionHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const cells = [...match[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((cell) => stripHtml(stripNonContent(cell[1])))
      .filter(Boolean);
    const value = cells.slice(1).join(' ');
    if (cells.length >= 2 && !/^(?:x[\s,]*)+$/i.test(value)) {
      rows.push(`${cells[0]}: ${value}`);
    }
    else if (cells.length === 1) rows.push(cells[0]);
  }
  return rows.join('\n');
}

/** Read the same product tabs a shopper sees on the public Shopify page. */
export function parseShopifyStorefrontTabs(pageHtml = '') {
  const descriptionHtml = tabSectionHtml(pageHtml, 'Description');
  const featuresHtml = tabSectionHtml(pageHtml, 'Key features')
    || tabSectionHtml(pageHtml, 'Key Features');
  const sizeGuideHtml = tabSectionHtml(pageHtml, 'Size Guide');

  const descriptionMetafield = /<span\b[^>]*class=["'][^"']*metafield-multi_line_text_field[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
    .exec(descriptionHtml)?.[1];

  return {
    description: stripHtml(stripNonContent(descriptionMetafield || descriptionHtml))
      .replace(/\n?(?:Read more|See less)\s*$/i, '')
      .trim(),
    keyFeatures: featureRowsFromHtml(featuresHtml)
      || stripHtml(stripNonContent(featuresHtml)),
    sizeGuide: stripHtml(stripNonContent(sizeGuideHtml))
      .replace(/\n?(?:Read more|See less)\s*$/i, '')
      .trim(),
  };
}

function metafieldText(metafield) {
  const raw = String(metafield?.value ?? '').trim();
  if (!raw) return '';

  if (metafield?.type === 'rich_text_field') {
    try {
      const richText = JSON.parse(raw);
      const text = [];
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.value === 'string') text.push(node.value);
        for (const child of node.children ?? []) visit(child);
        if (['paragraph', 'list-item', 'heading'].includes(node.type)) text.push('\n');
      };
      visit(richText);
      return text.join('').replace(/\n{3,}/g, '\n\n').trim();
    } catch {
      return stripHtml(raw);
    }
  }

  if (metafield?.type?.startsWith('list.')) {
    try {
      const values = JSON.parse(raw);
      if (Array.isArray(values)) return values.map(String).join('\n');
    } catch {
      // Use the normal text cleanup below when the value is not JSON.
    }
  }

  return stripHtml(raw);
}

function normalizedKey(metafield) {
  return String(metafield?.key ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function titleFromKey(key) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

const DESCRIPTION_KEYS = new Set([
  'description',
  'product_description',
  'detailed_description',
  'description_text',
  'product_details',
]);
const SIZE_GUIDE_KEYS = new Set(['size_guide', 'size_chart', 'sizing_guide']);
const DIRECT_FEATURE_KEYS = new Set([
  'key_features',
  'key_feature',
  'product_features',
  'feature_details',
]);
const FEATURE_ROW_KEYS = new Set([
  'features',
  'material',
  'printing_types_supported',
  'printing_type_supported',
  'brand',
  'country_of_manufacturer',
  'country_of_origin',
  'care_instructions',
]);

/** Split Shopify's tab content into the catalog fields used by this app. */
export function mapShopifyContent(bodyHtml, metafields = []) {
  const byKey = new Map(metafields.map((field) => [normalizedKey(field), field]));
  const fields = [...byKey.entries()];
  const valueFor = (keys) => {
    for (const key of keys) {
      const value = metafieldText(byKey.get(key));
      if (value) return value;
    }
    return '';
  };
  const valueMatching = (predicate) => {
    const match = fields.find(([key, field]) => predicate(key) && metafieldText(field));
    return match ? metafieldText(match[1]) : '';
  };

  const metafieldDescription = valueFor(DESCRIPTION_KEYS)
    || valueMatching((key) => key.includes('description') && !key.includes('file'));
  const explicitSizeGuide = valueFor(SIZE_GUIDE_KEYS)
    || valueMatching((key) => key.includes('size') && (key.includes('guide') || key.includes('chart')));
  const bodyText = stripHtml(bodyHtml);
  const directFeatures = valueFor(DIRECT_FEATURE_KEYS)
    || valueMatching((key) => key.includes('key_feature') || key.includes('product_feature'));
  const featureRows = [...FEATURE_ROW_KEYS]
    .map((key) => {
      const value = metafieldText(byKey.get(key));
      return value ? `${titleFromKey(key)}: ${value}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return {
    description: metafieldDescription || bodyText,
    keyFeatures: directFeatures || featureRows,
    // shelfmerch.store uses Shopify's normal product body for this tab.
    sizeGuide: explicitSizeGuide || (metafieldDescription ? bodyText : ''),
  };
}

/** Parse the RFC-5988 Link header for the next page_info cursor. */
function nextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.split(',').find((part) => part.includes('rel="next"'));
  if (!match) return null;
  const url = match.match(/<([^>]+)>/)?.[1];
  if (!url) return null;
  return new URL(url).searchParams.get('page_info');
}

function shopifyHeaders(token, extra = {}) {
  return { 'X-Shopify-Access-Token': token, Accept: 'application/json', ...extra };
}

async function shopifyGraphql({ domain, token, query, variables }) {
  const res = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_GRAPHQL_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: shopifyHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, variables }),
    },
  );
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

/** GraphQL Admin API fallback when REST is forbidden or the REST version is gone. */
async function fetchShopifyProductsGraphql({ domain, token }) {
  const query = `
    query ImportProducts($cursor: String) {
      products(first: 100, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes {
          id title handle vendor productType status tags descriptionHtml
          options { name }
          featuredImage { url }
          images(first: 50) { nodes { url } }
          variants(first: 100) {
            nodes {
              sku price inventoryQuantity
              selectedOptions { name value }
              inventoryItem { id }
            }
          }
        }
      }
    }
  `;
  const products = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { res, body } = await shopifyGraphql({
      domain,
      token,
      query,
      variables: { cursor },
    });
    if (res.status === 401 || res.status === 403) throwShopifyAuthError(res.status, body);
    if (!res.ok) {
      throw new ApiError(502, `Shopify GraphQL returned ${res.status} for "${domain}"`, 'SHOPIFY_ERROR');
    }
    if (body.errors?.length) {
      const text = shopifyErrorText(body);
      if (/scope|not approved|permission|unauthorized|access/i.test(text)) {
        throwShopifyAuthError(403, body);
      }
      throw new ApiError(502, `Shopify GraphQL error for "${domain}": ${text}`, 'SHOPIFY_ERROR');
    }
    const connection = body.data?.products;
    products.push(
      ...(connection?.nodes ?? [])
        .map(graphProductToRest)
        .filter((p) => !p.status || p.status === 'active'),
    );
    if (!connection?.pageInfo?.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
    if (!cursor) break;
  }
  return products;
}

/**
 * Fetch active products from the Shopify Admin API (cursor-paginated).
 * Draft/archived Shopify products are excluded so only sellable catalog
 * items are imported (always as platform drafts for review).
 * REST is tried first; GraphQL is used when REST is unavailable for the app.
 */
export async function fetchShopifyProducts({ domain, token }) {
  const accessToken = normalizeAccessToken(token);
  const base = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/products.json`;
  const products = [];
  let pageInfo = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Cursor pages must only send page_info + limit — the status filter is
    // baked into the first-page cursor by Shopify.
    const params = new URLSearchParams({ limit: '250' });
    if (pageInfo) params.set('page_info', pageInfo);
    else params.set('status', 'active');
    let res;
    try {
      res = await fetch(`${base}?${params}`, {
        headers: shopifyHeaders(accessToken),
      });
    } catch {
      throw new ApiError(502, `Could not reach Shopify store "${domain}"`, 'SHOPIFY_UNREACHABLE');
    }
    if (page === 0 && (res.status === 401 || res.status === 403 || res.status === 404)) {
      const restBody = await res.json().catch(() => ({}));
      try {
        return await fetchShopifyProductsGraphql({ domain, token: accessToken });
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throwShopifyAuthError(res.status, restBody);
      }
    }
    if (res.status === 401 || res.status === 403) {
      throwShopifyAuthError(res.status, await res.json().catch(() => ({})));
    }
    if (!res.ok) {
      throw new ApiError(502, `Shopify returned ${res.status} for "${domain}"`, 'SHOPIFY_ERROR');
    }
    const body = await res.json().catch(() => ({}));
    // Defense in depth: drop non-active rows if status is present on the payload.
    products.push(
      ...(body.products ?? []).filter((p) => !p.status || p.status === 'active'),
    );
    pageInfo = nextPageInfo(res.headers.get('link'));
    if (!pageInfo) break;
  }
  return products;
}

/** Map a Shopify product → CatalogProduct fields (status draft). */
export async function fetchShopifyProductMetafields({ domain, token, productId }) {
  const accessToken = normalizeAccessToken(token);
  let res;
  try {
    res = await fetch(
      `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/metafields.json?limit=250`,
      { headers: shopifyHeaders(accessToken) },
    );
  } catch {
    throw new ApiError(
      502,
      `Could not fetch metafields for Shopify product "${productId}"`,
      'SHOPIFY_UNREACHABLE',
    );
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    const restBody = await res.json().catch(() => ({}));
    try {
      const { res: gqlRes, body } = await shopifyGraphql({
        domain,
        token: accessToken,
        query: `
          query ProductMetafields($id: ID!) {
            product(id: $id) {
              metafields(first: 250) { nodes { namespace key type value } }
            }
          }
        `,
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      if (gqlRes.ok && !body.errors?.length) return body.data?.product?.metafields?.nodes ?? [];
    } catch {
      // Fall through to the REST auth/error mapping.
    }
    if (res.status === 401 || res.status === 403) throwShopifyAuthError(res.status, restBody);
  }
  if (res.status === 401 || res.status === 403) {
    throwShopifyAuthError(res.status, await res.json().catch(() => ({})));
  }
  if (!res.ok) {
    throw new ApiError(
      502,
      `Shopify returned ${res.status} while reading product metafields`,
      'SHOPIFY_ERROR',
    );
  }
  const body = await res.json().catch(() => ({}));
  return body.metafields ?? [];
}

/**
 * Prefer an India-specific HSN when present, else the general HS code.
 * Shopify stores these on InventoryItem, not on the Product resource.
 */
export function resolveHsnFromInventoryItems(items = []) {
  for (const item of items) {
    const countryCodes = item?.country_harmonized_system_codes ?? [];
    const india = countryCodes.find(
      (entry) => String(entry?.country_code || '').toUpperCase() === 'IN' && entry?.harmonized_system_code,
    );
    if (india?.harmonized_system_code) return String(india.harmonized_system_code);
  }
  for (const item of items) {
    if (item?.harmonized_system_code != null && String(item.harmonized_system_code).trim()) {
      return String(item.harmonized_system_code).trim();
    }
  }
  return '';
}

/** Batch-read InventoryItems for HS/HSN codes (REST `ids` filter, chunks of 50). */
export async function fetchShopifyInventoryItems({ domain, token, ids }) {
  const unique = [...new Set((ids ?? []).map(String).filter((id) => /^\d+$/.test(id)))];
  if (!unique.length) return [];

  const items = [];
  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const params = new URLSearchParams({ ids: chunk.join(',') });
    let res;
    try {
      res = await fetch(
        `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/inventory_items.json?${params}`,
        { headers: shopifyHeaders(normalizeAccessToken(token)) },
      );
    } catch {
      // HSN enrichment is optional — product import should still succeed.
      return items;
    }
    if (res.status === 401 || res.status === 403) {
      // Missing read_inventory should not abort an otherwise-valid product import.
      return items;
    }
    if (!res.ok) return items;
    const body = await res.json().catch(() => ({}));
    items.push(...(body.inventory_items ?? []));
  }
  return items;
}

/** Public-page fallback for theme tabs that are not returned by Admin metafields. */
export async function fetchShopifyStorefrontTabs({ domain, handle }) {
  if (!handle) return { description: '', keyFeatures: '', sizeGuide: '' };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`https://${domain}/products/${encodeURIComponent(handle)}`, {
        headers: { Accept: 'text/html' },
        redirect: 'follow',
      });
      if (res.ok && typeof res.text === 'function') {
        return parseShopifyStorefrontTabs(await res.text());
      }
    } catch {
      // Retry occasional Shopify/CDN connection timeouts.
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  // Product import should still work when the public storefront is unavailable.
  return { description: '', keyFeatures: '', sizeGuide: '' };
}

/** Map a Shopify product into CatalogProduct fields (status draft). */
export function mapShopifyProduct(p, domain, metafields = [], hsnCode = '') {
  const optionNames = (p.options ?? []).map((o) => String(o.name || '').toLowerCase());
  const optKey = (i) =>
    optionNames[i]?.includes('size') ? 'size'
      : optionNames[i]?.includes('material') ? 'material'
        : optionNames[i]?.includes('color') || optionNames[i]?.includes('colour') ? 'color'
          : null;

  const variants = (p.variants ?? []).map((v) => {
    const out = {
      sku: v.sku || '',
      priceOverrideInr: v.price != null ? Number(v.price) : null,
      stock: Number(v.inventory_quantity ?? 0),
    };
    [v.option1, v.option2, v.option3].forEach((val, i) => {
      const key = optKey(i);
      if (key && val) out[key] = String(val);
    });
    return out;
  });

  const prices = (p.variants ?? []).map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
  const basePriceInr = prices.length ? Math.min(...prices) : 0;
  const images = (p.images ?? []).map((img) => img.src).filter(Boolean);
  const content = mapShopifyContent(p.body_html, metafields);

  return {
    name: p.title || 'Untitled product',
    ...content,
    brand: p.vendor || '',
    category: '',
    subcategory: '',
    basePriceInr,
    hsnCode: hsnCode || '',
    variants,
    primaryImageUrl: p.image?.src || images[0] || '',
    imageUrls: images,
    status: 'draft',
    // Imported products are fulfilled on demand, not warehoused — default to
    // made-to-order so they don't surface as "out of stock". A catalog admin
    // can switch a product to physical and restock it from the Inventory page.
    inventory: { mode: 'made_to_order' },
    source: {
      provider: 'shopify',
      domain,
      externalId: String(p.id),
      handle: p.handle || '',
      categoryAssignedByAdmin: false,
    },
  };
}

function catalogFieldFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return Boolean(String(value ?? '').trim());
}

/**
 * Shopify re-import may refresh marketing/content fields. Category, GST, masks,
 * and print areas are set in the catalog wizard — keep them when already filled.
 */
function applyShopifyCatalogUpdate(exists, mapped) {
  exists.description = mapped.description;
  exists.keyFeatures = mapped.keyFeatures;
  exists.sizeGuide = mapped.sizeGuide;
  exists.primaryImageUrl = mapped.primaryImageUrl;
  exists.imageUrls = mapped.imageUrls;

  if (!catalogFieldFilled(exists.category) && catalogFieldFilled(mapped.category)) {
    exists.category = mapped.category;
  }
  if (!catalogFieldFilled(exists.subcategory) && catalogFieldFilled(mapped.subcategory)) {
    exists.subcategory = mapped.subcategory;
  }
  if (!catalogFieldFilled(exists.gstRate) && catalogFieldFilled(mapped.gstRate)) {
    exists.gstRate = mapped.gstRate;
  }
  if (!catalogFieldFilled(exists.maskImageUrl) && catalogFieldFilled(mapped.maskImageUrl)) {
    exists.maskImageUrl = mapped.maskImageUrl;
  }
  if (!catalogFieldFilled(exists.maskBackImageUrl) && catalogFieldFilled(mapped.maskBackImageUrl)) {
    exists.maskBackImageUrl = mapped.maskBackImageUrl;
  }
  if (!catalogFieldFilled(exists.printAreas) && catalogFieldFilled(mapped.printAreas)) {
    exists.printAreas = mapped.printAreas;
  }
}

async function uniqueSku(base) {
  let sku = base || `SM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  while (await CatalogProduct.findOne({ sku })) {
    sku = `${base}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }
  return sku;
}

// Words that mark a Shopify product as a bundle/kit rather than a single item.
const KIT_WORD_RE = /\b(kits?|bundles?|combos?|hampers?|gift\s*(set|box|pack)|welcome\s*(kit|pack)|onboarding\s*(kit|pack)|sets?)\b/i;

/**
 * Classify a Shopify product as a kit (bundle of items) vs a single catalog
 * product, so imports can be sorted into the right collection. Signals: kit/
 * bundle/set words in product_type / tags / title, an enumerated "kit includes …"
 * body, or a title that lists multiple items ("Diary, Pen & Calendar").
 */
export function isKitLikeShopifyProduct(p = {}) {
  const type = String(p.product_type || '');
  const tags = Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || '');
  if (KIT_WORD_RE.test(type) || KIT_WORD_RE.test(tags)) return true;

  const body = stripHtml(p.body_html || '');
  // "This kit includes keychain, diary, bottle, pen" — an enumerated bundle.
  if (/\b(kit|bundle|set|pack|combo|hamper)\b[^.]*\bincludes?\b/i.test(body)) return true;
  if (/\bincludes?\b[^.]*,[^.]*\b(and|&|,)\b/i.test(body) && KIT_WORD_RE.test(p.title || '')) return true;

  const title = String(p.title || '');
  // Bundle words in the title — kit / bundle / combo / hamper / set / gift box.
  if (KIT_WORD_RE.test(title)) return true;
  // An enumerated title listing multiple items with commas + "and"/"&"
  // (e.g. "Wooden Diary, Pen & Lifetime Calendar") is a multi-item bundle.
  if (/\w+\s*,\s*\w+[^,]*\s(?:&|and)\s+\w+/i.test(title)) return true;
  return false;
}

/**
 * Map a Shopify product into PlatformKit fields. Shopify bundles are already
 * curated, self-contained products — there are no component products/variants to
 * compose — so they import as `active` with empty `items` and are marked
 * fixed-composition. The Edit-kits item flow does not apply to them.
 */
export function mapShopifyKit(p, domain, mapped) {
  return {
    name: mapped.name,
    description: mapped.description || '',
    packaging: 'box',
    approxValueInr: mapped.basePriceInr || 0,
    imageUrls: mapped.imageUrls || [],
    items: [],
    rules: { fixedComposition: true, customizationAllowed: true, minQtyPerRecipient: 1, maxQtyPerRecipient: 1 },
    status: 'active',
    source: {
      provider: 'shopify',
      domain,
      externalId: String(p.id),
      handle: p.handle || '',
    },
  };
}

/**
 * Import products from a Shopify store; skip ones already imported.
 * `only` sorts the import: 'products' brings in just catalog products, 'kits'
 * brings in just kit bundles, 'all' (default) does both.
 */
export async function importFromShopify({ domain, token, only = 'all' }) {
  const host = normalizeDomain(domain);
  const accessToken = normalizeAccessToken(token);
  const products = await fetchShopifyProducts({ domain: host, token: accessToken });

  // Counts are tracked per kind so kits and catalog products are sorted apart.
  const product = { imported: 0, updated: 0, skipped: 0 };
  const kit = { imported: 0, updated: 0, skipped: 0 };
  let failed = 0;
  const items = [];

  for (const p of products) {
    const externalId = String(p.id);
    try {
      // Classify up front (from the product list alone) so a filtered import
      // skips the per-product metafield/tab fetches it doesn't need.
      const kitLike = isKitLikeShopifyProduct(p);
      if (only === 'kits' && !kitLike) continue;
      if (only === 'products' && kitLike) continue;

      const metafields = await fetchShopifyProductMetafields({
        domain: host,
        token: accessToken,
        productId: externalId,
      });
      // HSN/HS lives on InventoryItem (via variant.inventory_item_id), not Product.
      const inventoryItemIds = (p.variants ?? []).map((v) => v.inventory_item_id);
      const inventoryItems = await fetchShopifyInventoryItems({
        domain: host,
        token: accessToken,
        ids: inventoryItemIds,
      });
      const hsnCode = resolveHsnFromInventoryItems(inventoryItems);
      const mapped = mapShopifyProduct(p, host, metafields, hsnCode);
      if (!mapped.keyFeatures || mapped.description === stripHtml(p.body_html)) {
        const storefrontTabs = await fetchShopifyStorefrontTabs({
          domain: host,
          handle: p.handle,
        });
        if (storefrontTabs.description) mapped.description = storefrontTabs.description;
        if (storefrontTabs.keyFeatures) mapped.keyFeatures = storefrontTabs.keyFeatures;
        if (storefrontTabs.sizeGuide) mapped.sizeGuide = storefrontTabs.sizeGuide;
        if (!mapped.sizeGuide && storefrontTabs.description) {
          mapped.sizeGuide = stripHtml(p.body_html);
        }
      }

      // Bundles/kits belong in the PlatformKit collection, not the catalog.
      if (kitLike) {
        const kitFields = mapShopifyKit(p, host, mapped);
        // A Shopify bundle previously imported as a single catalog product is
        // archived out of the catalog so it is not double-listed.
        await CatalogProduct.updateOne(
          { 'source.provider': 'shopify', 'source.externalId': externalId, status: { $ne: 'archived' } },
          { $set: { status: 'archived' } },
        );
        const existingKit = await PlatformKit.findOne({
          'source.provider': 'shopify',
          'source.externalId': externalId,
        });
        if (existingKit) {
          const changed =
            existingKit.name !== kitFields.name
            || String(existingKit.description ?? '') !== String(kitFields.description ?? '')
            || JSON.stringify(existingKit.imageUrls ?? []) !== JSON.stringify(kitFields.imageUrls ?? []);
          if (changed) {
            existingKit.name = kitFields.name;
            existingKit.description = kitFields.description;
            existingKit.imageUrls = kitFields.imageUrls;
            existingKit.approxValueInr = kitFields.approxValueInr;
            await existingKit.save();
            kit.updated += 1;
            items.push({ title: p.title, status: 'updated', kind: 'kit' });
          } else {
            kit.skipped += 1;
            items.push({ title: p.title, status: 'skipped', kind: 'kit' });
          }
        } else {
          await PlatformKit.create(kitFields);
          kit.imported += 1;
          items.push({ title: p.title, status: 'imported', kind: 'kit' });
        }
        continue;
      }

      const exists = await CatalogProduct.findOne({
        'source.provider': 'shopify',
        'source.externalId': externalId,
      });
      if (exists) {
        const contentChanged = ['description', 'keyFeatures', 'sizeGuide']
          .some((key) => String(exists[key] ?? '') !== String(mapped[key] ?? ''));
        const imagesChanged =
          String(exists.primaryImageUrl ?? '') !== String(mapped.primaryImageUrl ?? '')
          || JSON.stringify(exists.imageUrls ?? []) !== JSON.stringify(mapped.imageUrls ?? []);
        // Fill HSN from Shopify when the draft still has none; never overwrite a set value.
        const hsnFilled = !String(exists.hsnCode || '').trim() && Boolean(mapped.hsnCode);
        if (contentChanged || imagesChanged || hsnFilled) {
          applyShopifyCatalogUpdate(exists, mapped);

          if (hsnFilled) exists.hsnCode = mapped.hsnCode;
          await exists.save();
          product.updated += 1;
          items.push({ title: p.title, status: 'updated', kind: 'product' });
        } else {
          product.skipped += 1;
          items.push({ title: p.title, status: 'skipped', kind: 'product' });
        }
        continue;
      }
      mapped.sku = await uniqueSku(
        mapped.variants.find((v) => v.sku)?.sku || `SHOP-${externalId}`,
      );
      // Always land as platform draft — never inherit Shopify "active".
      mapped.status = 'draft';
      await CatalogProduct.create(mapped);
      product.imported += 1;
      items.push({ title: p.title, status: 'imported', kind: 'product' });
    } catch (err) {
      failed += 1;
      items.push({ title: p?.title ?? externalId, status: 'failed', reason: err.message });
    }
  }

  return {
    domain: host,
    total: products.length,
    // Grand totals (back-compat) plus the kit/product split.
    imported: product.imported + kit.imported,
    updated: product.updated + kit.updated,
    skipped: product.skipped + kit.skipped,
    failed,
    products: product,
    kits: kit,
    items,
  };
}
