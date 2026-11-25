import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { applyPriceLimits, catalogSearchMongoFilter, toCatalogSearchItem } from '../mcp/catalogSearch.js';

const CATALOG_DISCOVERY_QUESTION = 'Sure! What type of products are you looking for?';

const PRODUCT_REQUEST = /^(?:(?:(?:can|could|would) (?:you|u)\s+)?(?:show(?: me)?|list|find(?: me)?|browse|explore|search for)|(?:(?:can|could|may) i |let me |(?:i want|i would like|i['’]d like) to )(?:see|browse|explore))\s+/i;
const GENERIC_PRODUCTS = /^(?:(?:the|some|a few|your|some of your)\s+)?(?:(?:shelfmerch |catalog )?products?|(?:shelfmerch )?catalog)$/i;
const ANY_PRODUCTS = /^(?:all|everything|anything|anything is fine|any type|any (?:products?|category)|no preference|whatever you have|(?:all|explore all) (?:the )?(?:catalog |shelfmerch )?products|(?:the )?(?:whole|entire|full) catalog)$/i;
const BUDGET = /(?:^|\s)(under|below|less than|up to|at most|within)\s+(?:(?:₹|inr\b|rs\.?)\s*)?([\d,]+(?:\.\d{1,2})?)$/i;

// Use catalog category names first, with a name search for older unclassified products.
const PRODUCT_TYPES = [
  [/^(?:polo(?:[- ]t)?(?:[- ]shirts?)?s?)$/i, 'Polo Shirts', 'Polo'],
  [/^(?:t[-\s]?shirts?|tees?)$/i, 'T-Shirts', 'T-shirt'],
  [/^backpacks?$/i, 'Backpacks', 'Backpack'],
  [/^laptop bags?$/i, 'Laptop Bags', 'Laptop Bag'],
  [/^totes?(?: bags?)?$/i, 'Totes', 'Tote'],
  [/^bags?$/i, 'Bags', 'Bag'],
  [/^hoodies?(?: and sweatshirts)?$/i, 'Hoodies & Sweatshirts', 'Hoodie'],
  [/^sweatshirts?$/i, 'Hoodies & Sweatshirts', 'Sweatshirt'],
  [/^jackets?$/i, 'Jackets', 'Jacket'],
  [/^caps?$/i, 'Caps', 'Cap'],
  [/^mugs?$/i, 'Mugs', 'Mug'],
  [/^bottles?$/i, 'Bottles', 'Bottle'],
  [/^tumblers?$/i, 'Tumblers', 'Tumbler'],
  [/^drinkware$/i, 'Drinkware'],
  [/^stationery$/i, 'Stationery'],
  [/^(?:electronics|gadgets|electronics & gadgets)$/i, 'Electronics & Gadgets'],
  [/^apparel$/i, 'Apparel'],
];

export function catalogDiscoveryIntent(text, previousReply) {
  const input = text.trim().replace(/[.!?]+$/, '').trim().replace(/^please\s+/i, '').replace(/,?\s+please$/i, '')
    .replace(/\s+from\s+(?:the\s+)?shelf\s?merch(?:\s+catalog)?$/i, '');
  const request = input.replace(PRODUCT_REQUEST, '');
  const addressedSearch = request !== input;
  const lastPage = previousReply?.artifacts?.findLast(row => row.kind === 'catalog_page')?.catalog;
  const answeringQuestion = previousReply?.content === CATALOG_DISCOVERY_QUESTION;
  const pageRequest = request.match(/^(?:(?:next|more)(?: (?:page|products))?|previous page|page (\d+))$/i);
  if (lastPage && pageRequest) return lastPage.complete
    ? { content: 'All matching products are already shown above.', lastPage }
    : { query: lastPage.query };

  const hasCatalogContext = answeringQuestion || lastPage || !previousReply;
  if (/^what (?:catalog )?products (?:do you have|are available)$/i.test(input)) return { content: CATALOG_DISCOVERY_QUESTION };
  if (!addressedSearch && !hasCatalogContext) return null;
  if (GENERIC_PRODUCTS.test(request)) return { content: CATALOG_DISCOVERY_QUESTION };
  if (ANY_PRODUCTS.test(request) && (answeringQuestion || lastPage || !previousReply || addressedSearch && /\b(?:products?|catalog)\b/i.test(request))) {
    return { query: { limit: 4 } };
  }

  const budget = request.match(BUDGET);
  const subject = budget ? request.slice(0, budget.index).trim() : request;
  const type = PRODUCT_TYPES.find(([match]) => match.test(subject.replace(/^all\s+(?:the\s+)?/i, '')));
  const budgetOnly = budget && (!subject || GENERIC_PRODUCTS.test(subject) || ANY_PRODUCTS.test(subject));
  if (!type && !budgetOnly) return null;

  const amount = budget ? Number(budget[2].replaceAll(',', '')) : null;
  const upperLimit = amount == null ? undefined : /^(?:under|below|less than)$/i.test(budget[1]) ? Math.ceil(amount) - 1 : Math.floor(amount);
  if (upperLimit < 0) return { content: 'I couldn’t find catalog products within that budget.' };
  if (upperLimit > 10_000_000) return null;

  // A bare budget reply keeps the current type; an explicit request for products across the catalog does not.
  if (!subject && lastPage?.queries?.length) return null;
  const existingType = !subject && lastPage ? { category: lastPage.query?.category, query: lastPage.query?.query } : {};
  const filter = { ...(type ? { category: type[1] } : existingType), ...(budget ? { maxSellingPriceInr: upperLimit } : {}), limit: 4 };
  return { query: filter, fallbackQuery: type?.[2] };
}

/** A counted or price-ranked ask must not expand into the whole catalog. */
export function catalogResultRequest(text) {
  const input = String(text || '');
  const countMatch = input.match(/\b(?:top|first|only|just)\s+(\d{1,2})\b/i)
    || input.match(/\b(\d{1,2})\s+(?:products?|items?)\b/i);
  const count = countMatch ? Math.min(25, Math.max(1, Number(countMatch[1]))) : null;
  const highest = /\b(?:highest|most expensive|priciest|costliest)\b/i.test(input)
    || /\bhigh(?:est)?[- ]pric(?:e|ed)\b/i.test(input);
  const lowest = /\b(?:cheapest|lowest|least expensive|most affordable)\b/i.test(input)
    || /\blow(?:est)?[- ]pric(?:e|ed)\b/i.test(input);
  const ranking = highest && !lowest ? 'highest' : lowest && !highest ? 'lowest' : null;
  if (!count && !ranking) return null;
  return { count, ranking };
}

export function shapeCatalogResults(products, request) {
  if (!request) return { products, reply: null };
  let rows = [...products];
  if (request.ranking) {
    const direction = request.ranking === 'highest' ? -1 : 1;
    rows.sort((a, b) => {
      const price = Number(a.product?.sellingPriceInr || 0) - Number(b.product?.sellingPriceInr || 0);
      if (price) return price * direction;
      return String(a.product?.name || '').localeCompare(String(b.product?.name || ''));
    });
  }
  if (request.count) rows = rows.slice(0, request.count);
  const count = rows.length;
  const noun = count === 1 ? 'product' : 'products';
  let reply = catalogDiscoveryReply(count, true);
  if (count && request.ranking === 'highest') reply = `Here ${count === 1 ? 'is the' : 'are the'} ${count} highest-priced catalog ${noun}.`;
  if (count && request.ranking === 'lowest') reply = `Here ${count === 1 ? 'is the' : 'are the'} ${count} lowest-priced catalog ${noun}.`;
  return { products: rows, reply };
}

export function catalogDiscoveryReply(count, complete) {
  if (!complete) return count
    ? `I loaded ${count} matching catalog ${count === 1 ? 'product' : 'products'} before the search stopped. These results are incomplete.`
    : 'I couldn’t complete the catalog search.';
  if (!count) return 'I couldn’t find any catalog products that match. Try another product type or price range.';
  return `I found ${count} matching catalog ${count === 1 ? 'product' : 'products'}. Here ${count === 1 ? 'it is' : 'they are'}.`;
}

/** Expand an authorized tool search for the embedded UI only. Provider history keeps the tool sample. */
export async function collectCatalogDiscovery(sample, { signal, onBatch, onIncomplete }) {
  const { limit: _limit, page: _page, ...query } = sample.catalogQuery;
  const size = 25;
  const matched = [];
  let batch = [];
  function add(item) {
    // Cards need official images, colors and availability, rather than full variant records.
    const { description, variants, ...product } = item;
    const colors = [...new Set(variants.map(row => row.color).filter(Boolean))];
    const artifact = { kind: 'product', product: {
      ...product,
      inStock: variants.length ? variants.some(row => row.stock > 0) : null,
      variants: colors.map(color => ({ color })),
    } };
    matched.push(artifact);
    batch.push(artifact);
    if (batch.length === size) flush();
  }
  function flush() {
    if (batch.length) onBatch?.(batch);
    batch = [];
  }

  let complete = true;
  if (sample.pagination.page === 1 && sample.items.length === sample.pagination.total) {
    sample.items.forEach(add);
  } else {
    const cursor = CatalogProduct.find(catalogSearchMongoFilter(query))
      .select('sku name brand category subcategory childCategory basePriceInr gstRate moq primaryImageUrl variants')
      .sort({ name: 1, sku: 1, _id: 1 }).lean().cursor({ batchSize: size });
    try {
      for await (const row of cursor) {
        signal?.throwIfAborted();
        const item = applyPriceLimits(toCatalogSearchItem(row), query.minSellingPriceInr, query.maxSellingPriceInr);
        if (item) add(item);
      }
    } catch (error) {
      signal?.throwIfAborted();
      complete = false;
      onIncomplete?.(error);
    } finally {
      await cursor.close().catch(() => {});
    }
  }
  signal?.throwIfAborted();
  flush();
  const total = matched.length;
  return { products: matched, meta: { kind: 'catalog_page', catalog: {
    query, complete, pagination: { page: 1, limit: size, total, totalPages: Math.ceil(total / size) },
  } } };
}
