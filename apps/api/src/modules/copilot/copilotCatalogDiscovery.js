const CATALOG_DISCOVERY_QUESTION = 'Sure! What type of products are you looking for?';

const PRODUCT_REQUEST = /^(?:(?:(?:can|could|would) (?:you|u)\s+)?(?:show(?: me)?|list|find(?: me)?|browse|search for)|(?:(?:can|could|may) i |let me |(?:i want|i would like|i['’]d like) to )(?:see|browse))\s+/i;
const GENERIC_PRODUCTS = /^(?:(?:the|some|a few|your|some of your)\s+)?(?:(?:shelfmerch |catalog )?products?|(?:shelfmerch )?catalog)$/i;
const ANY_PRODUCTS = /^(?:all|everything|anything|anything is fine|any type|any (?:products?|category)|no preference|whatever you have|all (?:catalog )?products|(?:the )?(?:whole|entire|full) catalog)$/i;
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
  const input = text.trim().replace(/[.!?]+$/, '').trim().replace(/^please\s+/i, '').replace(/,?\s+please$/i, '');
  const request = input.replace(PRODUCT_REQUEST, '');
  const addressedSearch = request !== input;
  const lastPage = previousReply?.artifacts?.findLast(row => row.kind === 'catalog_page')?.catalog;
  const answeringQuestion = previousReply?.content === CATALOG_DISCOVERY_QUESTION;
  const pageRequest = request.match(/^(?:(?:next|more)(?: (?:page|products))?|previous page|page (\d+))$/i);
  if (lastPage && pageRequest) {
    const { page, totalPages, limit } = lastPage.pagination;
    const target = pageRequest[1] ? Number(pageRequest[1]) : page + (/^previous/i.test(request) ? -1 : 1);
    if (target < 1 || target > totalPages || target > 10_000) {
      return { content: target < 1 ? 'You’re already on the first page.' : 'There are no more pages for this search.', lastPage };
    }
    return { query: { ...lastPage.query, page: target, limit } };
  }

  const hasCatalogContext = answeringQuestion || lastPage || !previousReply;
  if (/^what (?:catalog )?products (?:do you have|are available)$/i.test(input)) return { content: CATALOG_DISCOVERY_QUESTION };
  if (!addressedSearch && !hasCatalogContext) return null;
  if (GENERIC_PRODUCTS.test(request)) return { content: CATALOG_DISCOVERY_QUESTION };
  if (ANY_PRODUCTS.test(request) && (answeringQuestion || lastPage || !previousReply || addressedSearch && /\b(?:products?|catalog)\b/i.test(request))) {
    return { query: { limit: 4 } };
  }

  const budget = request.match(BUDGET);
  const subject = budget ? request.slice(0, budget.index).trim() : request;
  const type = PRODUCT_TYPES.find(([match]) => match.test(subject));
  const budgetOnly = budget && (!subject || GENERIC_PRODUCTS.test(subject));
  if (!type && !budgetOnly) return null;

  const amount = budget ? Number(budget[2].replaceAll(',', '')) : null;
  const upperLimit = amount == null ? undefined : /^(?:under|below|less than)$/i.test(budget[1]) ? Math.ceil(amount) - 1 : Math.floor(amount);
  if (upperLimit < 0) return { content: 'I couldn’t find catalog products within that budget.' };
  if (upperLimit > 10_000_000) return null;

  // A bare budget reply keeps the current type; an explicit request for products across the catalog does not.
  const existingType = !subject && lastPage ? { category: lastPage.query?.category, query: lastPage.query?.query } : {};
  const filter = { ...(type ? { category: type[1] } : existingType), ...(budget ? { maxSellingPriceInr: upperLimit } : {}), limit: 4 };
  return { query: filter, fallbackQuery: type?.[2] };
}

export function catalogDiscoveryReply({ items, pagination }) {
  if (!items.length) return 'I couldn’t find any catalog products that match. Try another product type or price range.';
  if (pagination.page < pagination.totalPages) return 'Here are some matches from the catalog. Say “next page” to see more.';
  return 'Here’s what I found in the catalog.';
}
