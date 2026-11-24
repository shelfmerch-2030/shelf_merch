import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isCopilotBusinessRequest } from './giftingAdvisor.js';
import { researchBudget } from './copilotWebResearch.js';
import { publicHttpsUrl } from './copilotExternalListingMedia.js';
import { applyImageToExternalProducts, buildExternalProductArtifacts, merchantHostname } from './copilotExternalProductArtifacts.js';

const SEARCH_URL = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 8_000;

const DEFAULT_GIFT_QUERIES = [
  { query: 'insulated stainless steel water bottle', reason: 'A premium bottle employees can use every day.' },
  { query: 'wireless charging pad', reason: 'A modern gadget for office desks and home use.' },
  { query: 'mini bluetooth speaker', reason: 'A small speaker employees can use outside work too.' },
  { query: 'premium hardcover notebook', reason: 'A useful desk gift for notes and meetings.' },
  { query: 'portable power bank', reason: 'A practical gadget for travel and long workdays.' },
];

const NAMED_PRODUCTS = [
  [/\b(?:bottles?|flasks?|tumblers?|drinkware)\b/i, DEFAULT_GIFT_QUERIES[0]],
  [/\b(?:wireless charg\w*|charging pads?)\b/i, DEFAULT_GIFT_QUERIES[1]],
  [/\b(?:bluetooth speakers?|mini speakers?)\b/i, DEFAULT_GIFT_QUERIES[2]],
  [/\b(?:notebooks?|diaries|diary|journals?)\b/i, DEFAULT_GIFT_QUERIES[3]],
  [/\b(?:power\s*banks?)\b/i, DEFAULT_GIFT_QUERIES[4]],
  [/\b(?:headphones?|earbuds?)\b/i, { query: 'wireless headphones', reason: 'A useful audio gift for work and commute.' }],
  [/\b(?:mugs?)\b/i, { query: 'ceramic coffee mug gift', reason: 'A simple everyday desk gift.' }],
];

export function serpShoppingEnabled(config = env) {
  return typeof config?.SERPAPI_API_KEY === 'string' && config.SERPAPI_API_KEY.trim().length > 0;
}

export function isProductShoppingRequest(text) {
  if (typeof text !== 'string' || text.trim().length < 8) return false;
  if (isCopilotBusinessRequest(text)) return false;
  if (/\bshelf\s?merch\b/i.test(text) && !/\b(?:outside|external|not|beyond)\b/i.test(text)) return false;
  if (/\b(?:send|purchase|buy|order)\b/i.test(text) && /\b(?:kits?|points|campaigns?)\b/i.test(text)) return false;
  const productAsk = /\b(?:products?|gifts?|gadgets?|items?)\b/i.test(text)
    && /\b(?:show|suggest|recommend|find|need|want|give|ideas?|some)\b/i.test(text);
  const employeeGift = /\b(?:emp(?:loyee)?s?|staff)\b/i.test(text)
    && /\b(?:give|gift|gifts|products?|ideas?|show|suggest|recommend)\b/i.test(text);
  return productAsk || employeeGift;
}

export function shoppingPlan(text) {
  const budget = researchBudget(text);
  const recipientMatch = text.match(/\b(\d{1,4})\s*(?:emp(?:loyee)?s?|staff|people|recipients?)\b/i);
  const recipientCount = recipientMatch ? Number(recipientMatch[1]) : undefined;
  const named = NAMED_PRODUCTS.filter(([pattern]) => pattern.test(text)).map(([, row]) => row);
  const unique = named.filter((row, index) => named.findIndex(item => item.query === row.query) === index);
  if (unique.length === 1) {
    return { mode: 'focused', queries: unique, perQuery: 5, budget, recipientCount };
  }
  if (unique.length > 1) {
    return { mode: 'named', queries: unique.slice(0, 5), perQuery: 1, budget, recipientCount };
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

export function mapShoppingResults(payload, { reason, budget, retrievedAt = new Date().toISOString(), limit = 1 } = {}) {
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
    if (!fitsBudget(numeric, budget)) continue;
    const merchant = String(row?.source || '').trim().slice(0, 120);
    findings.push({
      row: { name },
      source: { url: productUrl, title: merchant || merchantHostname(productUrl) },
      reason,
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

async function searchShopping(query, { signal, apiKey }) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', query);
  url.searchParams.set('gl', 'in');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('google_domain', 'google.co.in');
  url.searchParams.set('api_key', apiKey);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) {
    logger.info({ status: response.status }, 'Copilot shopping search rejected');
    return { shopping_results: [] };
  }
  return response.json();
}

function replyFor(plan, count) {
  const people = plan.recipientCount ? ` for ${plan.recipientCount} employees` : '';
  if (!count) return '';
  if (plan.mode === 'focused') {
    return `Here are ${count} ${plan.queries[0].query} options${people}. Each card is a current shopping result with a photo, price, and a link.`;
  }
  return `Here are ${count} product ideas${people}. Each card is a current shopping result with a photo, price, and a link.`;
}

export async function runSerpShoppingRecommendation({ text, signal, config = env, search = searchShopping } = {}) {
  const apiKey = config?.SERPAPI_API_KEY?.trim();
  if (!apiKey || !isProductShoppingRequest(text)) return { content: '', products: [], queries: 0 };
  const plan = shoppingPlan(text);
  const retrievedAt = new Date().toISOString();
  const batches = await Promise.all(plan.queries.map(async (item) => {
    try {
      const payload = await search(item.query, { signal, apiKey });
      return mapShoppingResults(payload, { reason: item.reason, budget: plan.budget, retrievedAt, limit: plan.perQuery });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      logger.info({ outcome: 'query_failed' }, 'Copilot shopping search failed');
      return [];
    }
  }));
  const seen = new Set();
  const products = [];
  for (const batch of batches) {
    for (const artifact of batch) {
      const key = artifact.product.productUrl;
      if (seen.has(key)) continue;
      seen.add(key);
      products.push(artifact);
      if (products.length >= 5) break;
    }
    if (products.length >= 5) break;
  }
  return { content: replyFor(plan, products.length), products, queries: plan.queries.length };
}
