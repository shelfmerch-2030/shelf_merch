import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { reserveSerpCall, serpFeatureState, shoppingUnavailableMessage } from './copilotSerpQuota.js';
import { isCopilotBusinessRequest } from './giftingAdvisor.js';
import { researchBudget, resolveCatalogTopic } from './copilotWebResearch.js';
import { publicHttpsUrl } from './copilotExternalListingMedia.js';
import { applyImageToExternalProducts, buildExternalProductArtifacts, merchantHostname } from './copilotExternalProductArtifacts.js';

const SEARCH_URL = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 20_000;

const DEFAULT_GIFT_QUERIES = [
  { query: 'insulated stainless steel water bottle', reason: 'A premium bottle employees can use every day.' },
  { query: 'wireless charging pad', reason: 'A modern gadget for office desks and home use.' },
  { query: 'mini bluetooth speaker', reason: 'A small speaker employees can use outside work too.' },
  { query: 'premium hardcover notebook', reason: 'A useful desk gift for notes and meetings.', drop: /\bcovers?\b/i },
  { query: 'portable power bank', reason: 'A practical gadget for travel and long workdays.', require: /\bpower\s*banks?\b/i },
];

const NAMED_PRODUCTS = [
  [/\b(?:bottles?|flasks?|tumblers?|drinkware)\b/i, DEFAULT_GIFT_QUERIES[0]],
  [/\b(?:wireless charg\w*|charging pads?)\b/i, DEFAULT_GIFT_QUERIES[1]],
  [/\b(?:bluetooth speakers?|mini speakers?)\b/i, DEFAULT_GIFT_QUERIES[2]],
  [/\b(?:notebooks?|diaries|diary|journals?)\b/i, DEFAULT_GIFT_QUERIES[3]],
  [/\b(?:power\s*banks?)\b/i, DEFAULT_GIFT_QUERIES[4]],
  [/\bearbuds?\b|\bearphones?\b|\bbuds\b/i, { query: 'wireless earbuds', reason: 'A compact audio gift for calls and commute.', require: /\b(?:earbuds?|earphones?|buds)\b/i, drop: /\bheadphones?\b/i }],
  [/\bheadphones?\b/i, { query: 'wireless headphones', reason: 'A useful audio gift for work and commute.', require: /\bheadphones?\b/i }],
  [/\b(?:mugs?)\b/i, { query: 'ceramic coffee mug gift', reason: 'A simple everyday desk gift.', require: /\bmugs?\b/i }],
  [/\bpens?\b/i, { query: 'gel pen', reason: 'A simple pen for notes and meetings.' }],
];

const KIT_SHARE = {
  'gel pen': 0.2,
  'premium hardcover notebook': 0.3,
  'ceramic coffee mug gift': 0.5,
};

const EXCLUSIONS = [
  [/\bbottles?\b|\bflasks?\b|\btumblers?\b/i, /\b(?:bottles?|flasks?|tumblers?)\b/i],
  [/\bbags?\b|\btotes?\b|\bbackpacks?\b/i, /\b(?:bags?|totes?|backpacks?)\b/i],
  [/\bhoodies?\b/i, /\bhoodies?\b/i],
  [/\bcaps?\b|\bhats?\b/i, /\b(?:caps?|hats?)\b/i],
];

const KITCHEN_GIFT_QUERIES = [
  { query: 'electric kettle', require: /\bkettles?\b/i },
  { query: 'milk frother', require: /\bfrothers?\b/i },
  { query: 'vegetable chopper', require: /\bchoppers?\b/i },
  { query: 'digital kitchen scale', require: /\b(?:kitchen\s*scale|weighing\s*scale)\b/i },
  { query: 'hand blender', require: /\bblenders?\b/i },
];

const VARIETY_GADGETS = [
  { query: 'bluetooth speaker', require: /\bspeakers?\b/i },
  { query: 'wireless earbuds', require: /\b(?:earbuds?|buds?)\b/i },
  { query: 'portable power bank', require: /\bpower\s*banks?\b/i },
  { query: 'wireless mouse', require: /\b(?:mice|mouse)\b/i },
  { query: 'smartwatch', require: /\b(?:smart\s*)?watch(?:es)?\b/i },
];

const FOCUSED_SEARCHES = [
  {
    test: /\bkitchen(?:\s+\w+){0,2}\s+tch\b|\bkitchen(?:\s*|-)?tech\b|\bkitchen technology\b|\bsmart kitchen\b/i,
    kind: 'kitchen',
    giftCap: 2500,
    drop: /\b(?:dining|chairs?|sofas?|furniture|wardrobe|bed|mattress|ovens?|microwaves?|otg|slow\s*cookers?|refrigerators?|mixer\s*grinders?)\b/i,
  },
  {
    test: /\binnovative\b/i,
    kind: 'gadgets',
    drop: /\b(?:sandwich|dining|sofas?|furniture|hoodies?|t-?shirts?|apparel|development\s*boards?|esp32|esp8266|arduino|raspberry)\b/i,
  },
];

export function serpShoppingEnabled(config = env) {
  return serpFeatureState(config) === 'ready';
}

export function isProductShoppingRequest(text) {
  if (typeof text !== 'string' || text.trim().length < 8) return false;
  if (isCopilotBusinessRequest(text)) return false;
  if (/\bshelf\s?merch\b/i.test(text) && !/\b(?:outside|external|not|beyond)\b/i.test(text)) return false;
  if (/\b(?:send|purchase|buy|order)\b/i.test(text) && /\b(?:kits?|points|campaigns?)\b/i.test(text)) return false;
  if (/\b(?:discuss|talk(?:ing)?|chat|plan(?:ning)?|design|think)\b/i.test(text)
    && !/\b(?:show|find|search|buy|order)\b/i.test(text)) return false;
  const productAsk = /\b(?:products?|gifts?|gadgets?|items?)\b/i.test(text)
    && /\b(?:show|suggest|recommend|find|need|want|give|ideas?|some|more)\b/i.test(text);
  const employeeGift = /\b(?:emp(?:loyee)?s?|staff)\b/i.test(text)
    && /\b(?:give|gift|gifts|products?|ideas?|show|suggest|recommend)\b/i.test(text);
  const namedProductAsk = /\b(?:show|suggest|recommend|find|need|want|give)\b/i.test(text)
    && NAMED_PRODUCTS.some(([pattern]) => pattern.test(text));
  return productAsk || employeeGift || namedProductAsk;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    // Google Shopping identifies the product in the query string. Dropping it
    // makes every result look like the same google.com/search page.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|gclid|fbclid|srsltid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href.toLowerCase();
  } catch {
    return String(value || '').toLowerCase();
  }
}

export function shownShoppingProducts(messages = []) {
  const urls = new Set();
  const names = new Set();
  for (const message of messages) {
    for (const artifact of message?.artifacts || []) {
      if (artifact?.kind !== 'external_product' || artifact.product?.imageProvenance !== 'shopping_result') continue;
      if (artifact.product.productUrl) urls.add(normalizeUrl(artifact.product.productUrl));
      if (artifact.product.name) names.add(normalizeName(artifact.product.name));
    }
  }
  return { urls, names };
}

/** A short "show them" after a kit discussion should search the products already named. */
export function wantsRememberedProducts(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (NAMED_PRODUCTS.some(([pattern]) => pattern.test(trimmed))) return false;
  return /^(?:please\s+)?(?:yes[,.]?\s+)?(?:can you\s+|could you\s+)?(?:show(?:\s+me)?(?:\s+(?:them|those|these|the\s+(?:products?|items?|kit|options?)))?|look(?:\s+for)?(?:\s+(?:them|those|these|the\s+(?:products?|items?|kit)))?|find(?:\s+(?:them|those|these|the\s+(?:products?|items?|kit)))?|pull(?:\s+them|\s+those|\s+these|\s+the\s+(?:products?|items?|kit))?\s+up)[.!?]*$/i.test(trimmed);
}

export function rememberedShoppingPlan(text, messages = []) {
  if (!wantsRememberedProducts(text)) return null;
  const rows = messages.filter(message => (message?.role === 'user' || message?.role === 'assistant') && message.content);
  const last = rows[rows.length - 1];
  const prior = last?.role === 'user' && String(last.content).trim() === text.trim() ? rows.slice(0, -1) : rows;
  const sourceRows = prior.slice(-8);
  const source = sourceRows.map(message => String(message.content)).join('\n');
  if (!source.trim()) return null;
  const budget = shoppingBudget(source);
  const drop = excludedPatterns(source);
  const chosen = [...sourceRows].reverse()
    .filter((row) => row.role === 'user')
    .map((row) => namedQueries(row.content))
    .find((named) => named.length) || [];
  const unique = (chosen?.length ? chosen : namedQueries(source)).filter((row) => !drop.some((pattern) => pattern.test(row.query)));
  if (!unique.length) return null;
  return {
    mode: 'named',
    queries: withKitBudgets(unique.slice(0, 5), budget),
    perQuery: unique.length === 1 ? 5 : 1,
    budget,
    drop,
  };
}

const CHEAPER_FOLLOW_UP = /\b(?:cheaper|less expensive|more affordable|lower(?:\s+the)?\s+price|make it cheaper)\b/i;
const EXCLUDE_FOLLOW_UP = /\b(?:exclude|skip|drop|remove|leave out|without|not)\s+(?:these|those|them|this)\b/i;
const MORE_FOLLOW_UP = /\b(?:more|another|different|other|else|again|same|repeat|duplicates?|new ones)\b/i;

export function shoppingFollowUpKind(text) {
  if (typeof text !== 'string') return null;
  if (CHEAPER_FOLLOW_UP.test(text)) return 'cheaper';
  if (EXCLUDE_FOLLOW_UP.test(text)) return 'exclude';
  if (MORE_FOLLOW_UP.test(text)) return 'more';
  return null;
}

function shownPrices(messages = []) {
  const prices = [];
  for (const message of messages) {
    for (const artifact of message?.artifacts || []) {
      const price = Number(artifact?.product?.priceNumeric);
      if (artifact?.kind === 'external_product' && price > 0) prices.push(price);
    }
  }
  return prices;
}

function cheaperThanShown(messages, previous) {
  const prices = shownPrices(messages);
  const cap = prices.length ? Math.min(...prices) : previous?.inr;
  if (!(cap > 0)) return previous;
  return { inr: Math.max(49, Math.floor(cap) - 1), exclusive: true };
}

export function isShoppingFollowUp(text, messages = []) {
  const shown = shownShoppingProducts(messages);
  if (!shown.urls.size && !shown.names.size) return false;
  return Boolean(shoppingFollowUpKind(text));
}

/** "Show me kitchen ideas" should return product cards, not a concept essay. Kit-writing prompts stay on the creative lane. */
export function prefersShoppingCards(text) {
  if (typeof text !== 'string') return false;
  if (/\bshelf\s?merch\b/i.test(text) && !/\b(?:outside|external|not|beyond)\b/i.test(text)) return false;
  if (/\bkits?\b/i.test(text)) return false;
  return /\b(?:show|find)\b/i.test(text) && /\b(?:products?|gifts?|gadgets?|ideas?|items?)\b/i.test(text);
}

function shoppingBudget(text) {
  const parsed = researchBudget(text);
  if (parsed) return parsed;
  const bare = String(text || '').match(/\b(under|below|less than|up to|at most|within)\s+(\d[\d,]*)\b/i);
  if (bare) {
    const inr = Number(bare[2].replaceAll(',', ''));
    if (inr > 0 && inr <= 10_000_000) return { inr, exclusive: /^(?:under|below|less than)$/i.test(bare[1]) };
  }
  const phrase = text.match(/\bbudget(?:\s+is|\s+of)?\s*(?:about|around|₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!phrase) return undefined;
  const inr = Number(phrase[1].replaceAll(',', ''));
  if (!(inr > 0 && inr <= 10_000_000)) return undefined;
  return { inr, exclusive: false };
}

function isEmployeeGiftAsk(text) {
  return /\b(?:emp(?:loyee)?s?|staff)\b/i.test(text)
    && /\b(?:give|gift|gifts|gifting|products?|ideas?|want)\b/i.test(text);
}

const EXCLUSION_LEAD = String.raw`\b(?:apart from|except|excluding|without|other than|leave out|leaving out|skip|(?:do not|don't|no|not)\s+(?:want\s+|include\s+)?(?:a\s+|the\s+)?)`;

function exclusionClause(text) {
  return [...String(text || '').matchAll(new RegExp(`${EXCLUSION_LEAD}([^.]*)`, 'gi'))].map((match) => match[1]).join(' ');
}

function shoppingText(text) {
  return String(text || '').replace(new RegExp(`${EXCLUSION_LEAD}[^.]*`, 'gi'), ' ');
}

function excludedPatterns(text) {
  const clause = exclusionClause(text);
  return EXCLUSIONS.filter(([pattern]) => pattern.test(clause)).map(([, drop]) => drop);
}

function withKitBudgets(queries, budget) {
  if (!budget || budget.exclusive || queries.length < 2) {
    return queries.map(query => ({ ...query, budget }));
  }
  const shares = queries.map(query => KIT_SHARE[query.query] || 1);
  const total = shares.reduce((sum, share) => sum + share, 0);
  return queries.map((query, index) => ({
    ...query,
    budget: { inr: Math.max(49, Math.round(budget.inr * shares[index] / total)), exclusive: false },
  }));
}

function namedQueries(text) {
  const source = shoppingText(text);
  const named = NAMED_PRODUCTS.filter(([pattern]) => pattern.test(source)).map(([, row]) => row);
  return named.filter((row, index) => named.findIndex(item => item.query === row.query) === index);
}

function focusedSearch(text) {
  return FOCUSED_SEARCHES.find(row => row.test.test(shoppingText(text))) || null;
}

function productReason(name) {
  const title = name.split(/\s+[|–—]\s+/)[0].trim();
  let clipped = title;
  if (clipped.length > 90) {
    const cut = clipped.slice(0, 90);
    const at = cut.lastIndexOf(' ');
    clipped = (at > 40 ? cut.slice(0, at) : cut).trim();
  }
  return clipped.length >= 3 ? `${clipped} is a current match for this search.` : '';
}

function discoverSearchQuery(text) {
  const cleaned = String(text || '')
    .replace(/\b(?:please|can you|could you|show me|find me|i want|some)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned.length >= 3 ? cleaned : '';
}

/** A shopping query is a short product search, not the person's whole sentence. */
export function isConcreteShoppingQuery(query) {
  const words = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 6) return false;
  const productWords = words.filter((word) => !/^(?:my|the|a|an|me|some|products?|items?|options?|gifts?|budget|is|rs|inr|rupees?|under|below|above|show|find|for|and|with|of|\d+)$/i.test(word));
  return productWords.length >= 1;
}

/** How many cards the person asked for. Unspecified stays at 5. Never above 10. */
export function requestedCardCount(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/\b(?:top|first|only|just)\s+(\d{1,2})\b|\b(\d{1,2})(?:\s+(?!emp(?:loyee)?s?\b|staff\b|people\b|recipients?\b)[a-z][a-z0-9-]*){0,4}\s+(?:products?|items?|options?|gifts?)\b/i);
  const value = Number(match?.[1] || match?.[2]);
  if (!Number.isInteger(value) || value < 1) return null;
  return Math.min(10, value);
}

function applyRequestedCount(plan, text) {
  if (!plan) return plan;
  const fromText = requestedCardCount(text);
  const fromPlan = Number(plan.limit);
  const limit = fromText || (Number.isInteger(fromPlan) && fromPlan >= 1 ? Math.min(10, fromPlan) : 5);
  const perQuery = Array.isArray(plan.queries) && plan.queries.length === 1 ? limit : plan.perQuery;
  return { ...plan, limit, perQuery };
}

function capPlanToStatedBudget(plan, text) {
  const stated = shoppingBudget(text);
  if (!stated || !plan) return plan;
  const current = plan.budget;
  const inr = current?.inr > 0 ? Math.min(current.inr, stated.inr) : stated.inr;
  const budget = { inr, exclusive: Boolean(stated.exclusive || current?.exclusive) };
  return {
    ...plan,
    budget,
    queries: (plan.queries || []).map((query) => {
      const share = query.budget?.inr > 0 ? Math.min(query.budget.inr, budget.inr) : budget.inr;
      return { ...query, budget: { inr: share, exclusive: budget.exclusive || Boolean(query.budget?.exclusive) } };
    }),
  };
}

export function shoppingPlan(text, { discover = false } = {}) {
  const budget = shoppingBudget(text);
  const recipientMatch = text.match(/\b(\d{1,4})\s*(?:emp(?:loyee)?s?|staff|people|recipients?)\b/i);
  const recipientCount = recipientMatch ? Number(recipientMatch[1]) : undefined;
  const drop = excludedPatterns(text);
  const unique = namedQueries(text);
  if (unique.length === 1) {
    return { mode: 'focused', queries: unique.map(query => ({ ...query, budget })), perQuery: 5, budget, recipientCount, drop };
  }
  if (unique.length > 1) {
    return { mode: 'named', queries: withKitBudgets(unique.slice(0, 5), budget), perQuery: 1, budget, recipientCount, drop };
  }
  const focused = focusedSearch(text);
  if (focused?.kind === 'kitchen' || focused?.kind === 'gadgets') {
    const giftBudget = !budget && focused.giftCap && /\b(?:gifts?|gifting|ideas?)\b/i.test(text)
      ? { inr: focused.giftCap, exclusive: false }
      : budget;
    const items = focused.kind === 'kitchen' ? KITCHEN_GIFT_QUERIES : VARIETY_GADGETS;
    const queries = items
      .filter((item) => !drop.some((pattern) => pattern.test(item.query)))
      .map((item) => ({ ...item, budget: giftBudget, drop: focused.drop }));
    return {
      mode: 'variety',
      queries,
      perQuery: 1,
      budget: giftBudget,
      recipientCount,
      drop: [...drop, focused.drop].filter(Boolean),
      giftCap: Boolean(!budget && focused.giftCap && giftBudget),
    };
  }
  const catalog = resolveCatalogTopic(shoppingText(text));
  if (catalog?.[1] && catalog[1] !== 'corporate gifting and merchandise') {
    return {
      mode: 'focused',
      queries: [{ query: `${catalog[1]} gift`, reason: `A ${catalog[1]} gift you can buy now.`, budget }],
      perQuery: 5,
      budget,
      recipientCount,
      drop,
    };
  }
  if (isEmployeeGiftAsk(text)) {
    return { mode: 'employee_gifts', queries: DEFAULT_GIFT_QUERIES, perQuery: 1, budget, recipientCount };
  }
  if (discover) {
    const query = discoverSearchQuery(text);
    if (query && isConcreteShoppingQuery(query)) {
      return {
        mode: 'focused',
        queries: [{ query, reason: 'A current shopping result for this search.' }],
        perQuery: 5,
        budget,
        recipientCount,
      };
    }
    // A vague sentence is not a shopping query. Claude's tool plan supplies the searches.
    return { mode: 'focused', queries: [], budget, recipientCount, drop };
  }
  return { mode: 'employee_gifts', queries: DEFAULT_GIFT_QUERIES, perQuery: 1, budget, recipientCount };
}

function listingUrl(row) {
  const candidates = [row?.link, row?.product_link].filter(value => typeof value === 'string');
  const safe = candidates.map(publicHttpsUrl).filter(Boolean);
  const direct = safe.find(href => {
    try { return !/(^|\.)google\./i.test(new URL(href).hostname); } catch { return false; }
  });
  return direct || safe[0] || null;
}

function fitsBudget(price, budget) {
  if (!budget || price == null || !Number.isFinite(price)) return true;
  return budget.exclusive ? price < budget.inr : price <= budget.inr;
}

function alreadyShown(name, productUrl, exclude) {
  if (!exclude?.urls?.size && !exclude?.names?.size) return false;
  return exclude.urls?.has(normalizeUrl(productUrl)) || exclude.names?.has(normalizeName(name));
}

function titleRejected(name, { drop, require, query } = {}) {
  if (require && !require.test(name)) return true;
  if (query && !/\b(?:sets?|packs?|combos?|bundles?)\b/i.test(query)
    && (/\b(?:set|pack|combo|bundle)\s+of\s+(?!1(?:\b|_))/i.test(name)
      || /\b(?:[2-9]|\d{2,})\s*[- ]?(?:pcs|pieces)\b/i.test(name))) {
    return true;
  }
  const patterns = Array.isArray(drop) ? drop : [drop];
  return patterns.some(pattern => pattern?.test?.(name));
}

function merchantRejected(merchant) {
  return /\b(?:desertcart|ubuy)\b/i.test(merchant || '');
}

function productFamily(name) {
  const families = [
    [/\b(?:earbuds?|buds?|headphones?)\b/i, 'earbuds'],
    [/\bspeakers?\b/i, 'speaker'],
    [/\b(?:smart\s*)?watch(?:es)?\b/i, 'watch'],
    [/\b(?:mice|mouse)\b/i, 'mouse'],
    [/\bpower\s*banks?\b/i, 'power'],
    [/\bchargers?\b/i, 'charger'],
    [/\bkettles?\b/i, 'kettle'],
    [/\bfrothers?\b/i, 'frother'],
    [/\bchoppers?\b/i, 'chopper'],
    [/\bscales?\b/i, 'scale'],
    [/\bblenders?\b/i, 'blender'],
  ];
  return families.find(([pattern]) => pattern.test(name))?.[1] || '';
}

function sanitizeReason(reason, name, priceNumeric) {
  const text = String(reason || '').replace(/\s+/g, ' ').trim();
  if (text.length < 12 || text.length > 180) return '';
  const token = String(name || '').toLowerCase().split(/\W+/).find((word) => word.length >= 4);
  if (token && !text.toLowerCase().includes(token)) return '';
  const amounts = [...text.matchAll(/₹\s*([\d,]+(?:\.\d+)?)/g)].map((match) => Number(match[1].replaceAll(',', '')));
  if (amounts.some((amount) => priceNumeric == null || Math.abs(amount - priceNumeric) >= 1)) return '';
  return text;
}

export function mapShoppingResults(payload, { reason, budget, retrievedAt = new Date().toISOString(), limit = 1, exclude, drop, require, query, describe = false } = {}) {
  const rows = Array.isArray(payload?.shopping_results) ? payload.shopping_results : [];
  const findings = [];
  const images = new Map();
  for (const row of rows) {
    if (findings.length >= limit) break;
    const name = String(row?.title || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const productUrl = listingUrl(row);
    const imageUrl = publicHttpsUrl(row?.thumbnail);
    const numeric = Number(row?.extracted_price);
    const priceText = String(row?.price || (Number.isFinite(numeric) && numeric > 0 ? `₹${numeric}` : '')).trim().slice(0, 40);
    if (name.length < 3 || !productUrl || !imageUrl) continue;
    if (titleRejected(name, { drop, require, query })) continue;
    if (!fitsBudget(numeric, budget) || alreadyShown(name, productUrl, exclude)) continue;
    const merchant = String(row?.source || '').trim().slice(0, 120);
    if (merchantRejected(merchant)) continue;
    findings.push({
      row: { name },
      source: { url: productUrl, title: merchant || merchantHostname(productUrl) },
      reason: (describe && productReason(name)) || reason,
      ...(Number.isFinite(numeric) && numeric > 0 && priceText
        ? { price: { text: priceText, numeric, currency: /₹|INR|Rs/i.test(priceText) ? 'INR' : 'INR' } }
        : {}),
    });
    images.set(productUrl, { imageUrl, provenance: 'shopping_result' });
  }
  const artifacts = applyImageToExternalProducts(
    buildExternalProductArtifacts(findings, { retrievedAt }).map(artifact => {
      const merchant = findings.find(item => item.source.url === artifact.product.productUrl)?.source.title;
      if (!merchant || merchant === artifact.product.merchantHostname) return artifact;
      return { ...artifact, product: { ...artifact.product, merchantDisplayName: merchant } };
    }),
    images,
  );
  return artifacts.filter(row => row.product?.imageUrl && row.product?.imageProvenance === 'shopping_result');
}

async function searchShopping(query, { signal, apiKey, start = 0 }) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', query);
  url.searchParams.set('gl', 'in');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('google_domain', 'google.co.in');
  if (start > 0) url.searchParams.set('start', String(start));
  url.searchParams.set('api_key', apiKey);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    logger.info({ outcome: 'timeout' }, 'Copilot shopping search failed');
    return { shopping_results: [], failure: 'timeout' };
  }
  if (!response.ok) {
    logger.info({ status: response.status }, 'Copilot shopping search rejected');
    const failure = response.status === 401 || response.status === 403 ? 'unauthorized' : 'rejected';
    return { shopping_results: [], failure };
  }
  return response.json();
}

function replyFor(plan, count, { more = false } = {}) {
  const people = plan.recipientCount ? ` for ${plan.recipientCount} employees` : '';
  if (!count) return more
    ? 'I could not find more distinct products beyond the ones already shown.'
    : '';
  const lead = more ? `${count} more product ideas` : `${count} product ideas`;
  if (plan.mode === 'variety') {
    const cap = plan.budget?.inr
      ? ` ${plan.budget.exclusive ? 'under' : 'at or under'} ₹${plan.budget.inr}`
      : '';
    return `Here are ${count} different products${cap}${people}.`;
  }
  if (plan.mode === 'focused') {
    return `Here are ${count} ${more ? 'more ' : ''}${plan.queries[0].query} options${people}. Each card is a current shopping result with a photo, price, and a link.`;
  }
  return `Here are ${lead}${people}. Each card is a current shopping result with a photo, price, and a link.`;
}

function pricedQuery(query, budget) {
  if (!budget?.inr) return query;
  return `${query} under ${budget.inr}`;
}

async function listingsForQuery(item, { plan, search, signal, apiKey, exclude, retrievedAt }) {
  const budget = item.budget || plan.budget;
  const query = pricedQuery(item.query, budget);
  const filters = { drop: [item.drop, ...(plan.drop || [])].filter(Boolean), require: item.require, query: item.query, describe: true };
  const payload = await search(query, { signal, apiKey, start: 0 });
  if (payload?.failure) return [];
  let cards = mapShoppingResults(payload, {
    reason: item.reason, budget, retrievedAt, limit: plan.perQuery, exclude, ...filters,
  });
  // A ₹100 pen share often has no Google Shopping hit. Keep the cheapest item that still fits the whole kit.
  if (!cards.length && budget?.inr && plan.budget?.inr && budget.inr < plan.budget.inr) {
    const relaxedPayload = await search(pricedQuery(item.query, plan.budget), { signal, apiKey, start: 0 });
    if (relaxedPayload?.failure) return [];
    const relaxed = mapShoppingResults(relaxedPayload, {
      reason: item.reason, budget: plan.budget, retrievedAt, limit: Math.max(plan.perQuery, 8), exclude, ...filters,
    });
    relaxed.sort((a, b) => (a.product.priceNumeric ?? Number.POSITIVE_INFINITY) - (b.product.priceNumeric ?? Number.POSITIVE_INFINITY));
    cards = relaxed.slice(0, plan.perQuery);
  }
  if (cards.length < plan.perQuery) {
    const next = await search(query, { signal, apiKey, start: 20 });
    if (next?.failure) return cards.slice(0, plan.perQuery);
    const extra = mapShoppingResults(next, {
      reason: item.reason, budget, retrievedAt, limit: plan.perQuery - cards.length, exclude, ...filters,
    });
    cards = [...cards, ...extra];
  }
  return cards.slice(0, plan.perQuery);
}

function earlierSearchText(text, messages) {
  if (!isShoppingFollowUp(text, messages)) return text;
  const prior = [...messages].reverse().find((row) => row?.role === 'user'
    && typeof row.content === 'string'
    && row.content.trim()
    && row.content.trim() !== text.trim()
    && !isShoppingFollowUp(row.content, messages));
  return prior?.content || text;
}

function dropsForWords(words) {
  const drops = [];
  for (const word of words) {
    const known = EXCLUSIONS.find(([pattern]) => pattern.test(word));
    if (known) {
      drops.push(known[1]);
      continue;
    }
    if (/^[a-z][a-z\s-]{1,24}$/i.test(word)) {
      drops.push(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i'));
    }
  }
  return drops;
}

/** A Claude tool call names the searches. Vague kitchen and tech requests keep the tested variety plan. */
export function planFromAssistant(toolArgs = {}) {
  const cleaned = [...new Set((Array.isArray(toolArgs?.queries) ? toolArgs.queries : [])
    .map((query) => String(query || '').replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter((query) => query.length >= 3 && isConcreteShoppingQuery(query)))].slice(0, 5);
  if (!cleaned.length) return null;
  const amount = Number(toolArgs?.budgetInr);
  const budget = amount > 0 && amount <= 10_000_000
    ? { inr: Math.round(amount), exclusive: Boolean(toolArgs?.exclusive) }
    : undefined;
  const drop = dropsForWords((Array.isArray(toolArgs?.exclude) ? toolArgs.exclude : []).map((word) => String(word || '').trim()));
  const asked = Number(toolArgs?.count);
  const limit = Number.isInteger(asked) && asked >= 1 ? Math.min(10, asked) : undefined;
  let queries = cleaned.map((query) => {
    const named = namedQueries(query)[0];
    return { ...(named || { query, reason: '' }), budget, drop };
  });
  if (budget && toolArgs?.perItem === false && queries.length > 1) queries = withKitBudgets(queries, budget);
  return {
    mode: queries.length > 1 ? 'named' : 'focused',
    queries,
    perQuery: queries.length > 1 ? 1 : 5,
    budget,
    drop,
    ...(limit ? { limit } : {}),
  };
}

function finishDiscoverPlan(plan, text) {
  return plan ? applyRequestedCount(capPlanToStatedBudget(plan, text), text) : null;
}

export function discoverSearchPlan({ text, messages = [], toolArgs } = {}) {
  if (isShoppingFollowUp(text, messages)) return null;
  const modelPlan = planFromAssistant(toolArgs);
  if (focusedSearch(shoppingText(text)) && (!modelPlan || modelPlan.queries.length < 2)) {
    return finishDiscoverPlan(shoppingPlan(text, { discover: true }), text);
  }
  return finishDiscoverPlan(modelPlan || rememberedShoppingPlan(text, messages), text);
}

export async function runSerpShoppingRecommendation({
  text, signal, config = env, search = searchShopping, messages = [], discover = false, describeCards, plan: suppliedPlan,
  tenantId, userId, reserve,
} = {}) {
  const apiKey = config?.SERPAPI_API_KEY?.trim();
  const followUp = isShoppingFollowUp(text, messages);
  const wantsSearch = Boolean(suppliedPlan) || discover || isProductShoppingRequest(text) || followUp || prefersShoppingCards(text);
  const feature = serpFeatureState(config);
  if (!wantsSearch || !apiKey || feature !== 'ready') {
    return {
      content: wantsSearch && feature !== 'ready' ? shoppingUnavailableMessage(feature) : '',
      products: [],
      queries: 0,
      followUp,
      notice: wantsSearch && feature !== 'ready' ? shoppingUnavailableMessage(feature) : '',
      apiCalls: 0,
    };
  }
  let plan = suppliedPlan
    || (discover && rememberedShoppingPlan(text, messages))
    || shoppingPlan(discover ? earlierSearchText(text, messages) : text, { discover });
  if (shoppingFollowUpKind(text) === 'cheaper' && Array.isArray(plan?.queries)) {
    const budget = cheaperThanShown(messages, plan.budget);
    plan = {
      ...plan,
      budget,
      queries: plan.queries.map((query) => ({ ...query, budget })),
    };
  } else {
    plan = capPlanToStatedBudget(plan, shoppingFollowUpKind(text) ? earlierSearchText(text, messages) : text);
  }
  plan = applyRequestedCount(plan, text);
  if (!plan?.queries?.length) {
    return { content: '', products: [], queries: 0, followUp, notice: '', apiCalls: 0, copyUsage: {} };
  }
  const exclude = shownShoppingProducts(messages);
  const more = followUp;
  const retrievedAt = new Date().toISOString();
  const reserveCall = reserve || (tenantId && userId ? reserveSerpCall : null);
  const turnLimit = Number(config.EMBEDDED_COPILOT_SERPAPI_MAX_CALLS_PER_TURN) || 8;
  let calls = 0;
  let stopReason = null;
  let sawTimeout = false;
  const continuableFailure = new Set(['timeout', 'rejected']);
  const guardedSearch = async (query, options) => {
    if (stopReason || calls >= turnLimit) {
      if (calls >= turnLimit) stopReason = stopReason || 'turn';
      return { shopping_results: [] };
    }
    calls += 1;
    if (reserveCall) {
      let outcome = 'unavailable';
      try {
        outcome = await reserveCall({ tenantId, userId, amount: 1, config });
      } catch {
        outcome = 'unavailable';
      }
      if (outcome !== 'reserved') {
        calls -= 1;
        stopReason = stopReason || outcome;
        return { shopping_results: [] };
      }
    }
    try {
      const payload = await search(query, options);
      if (payload?.failure === 'timeout') sawTimeout = true;
      if (payload?.failure && !continuableFailure.has(payload.failure)) stopReason = stopReason || payload.failure;
      return payload || { shopping_results: [] };
    } catch (error) {
      if (signal?.aborted || (error?.name === 'AbortError' && signal?.aborted)) throw error;
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        sawTimeout = true;
        return { shopping_results: [], failure: 'timeout' };
      }
      throw error;
    }
  };
  const limit = plan.limit || 5;
  const seen = new Set();
  const names = new Set();
  const families = new Set();
  const products = [];
  for (const item of plan.queries) {
    if (stopReason || products.length >= limit) break;
    let batch = [];
    try {
      const room = limit - products.length;
      const expand = requestedCardCount(text) && plan.mode !== 'variety';
      const take = expand ? Math.min(limit, Math.max(plan.perQuery || 1, room)) : plan.perQuery;
      batch = await listingsForQuery(item, {
        plan: { ...plan, perQuery: take }, search: guardedSearch, signal, apiKey, exclude, retrievedAt,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      logger.info({ outcome: 'query_failed', errorName: error?.name || 'Error' }, 'Copilot shopping search failed');
      sawTimeout = true;
    }
    for (const artifact of batch) {
      const key = artifact.product.productUrl;
      const nameKey = normalizeName(artifact.product.name);
      if (seen.has(key) || names.has(nameKey)) continue;
      const family = plan.mode === 'variety' ? productFamily(artifact.product.name) : '';
      if (family && families.has(family)) continue;
      seen.add(key);
      if (nameKey) names.add(nameKey);
      if (family) families.add(family);
      products.push(artifact);
      if (products.length >= limit) break;
    }
  }
  let content = replyFor(plan, products.length, { more });
  let notice = '';
  if (stopReason && !(stopReason === 'turn' && products.length >= limit)) {
    notice = shoppingUnavailableMessage(stopReason);
    if (!products.length) content = notice;
  } else if (!products.length && sawTimeout) {
    notice = shoppingUnavailableMessage('timeout');
    content = notice;
  }
  let copyUsage = {};
  if (describeCards && products.length) {
    try {
      const copy = await describeCards({
        ask: text,
        cards: products.map((artifact) => ({ name: artifact.product.name, price: artifact.product.priceText || '' })),
      });
      const intro = String(copy?.intro || '').replace(/\s+/g, ' ').trim();
      if (intro.length >= 12 && intro.length <= 320) content = intro;
      products.forEach((artifact, index) => {
        const reason = sanitizeReason(copy?.reasons?.[index], artifact.product.name, artifact.product.priceNumeric);
        if (reason) artifact.product.reason = reason;
      });
      copyUsage = copy?.usage || {};
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      logger.info({ outcome: 'copy_failed', errorName: error?.name || 'Error' }, 'Copilot shopping copy failed');
    }
  }
  if (notice && products.length && !content.includes(notice)) content = `${content}\n\n${notice}`;
  return { content, products, queries: plan.queries.length, followUp, copyUsage, notice, apiCalls: calls };
}
