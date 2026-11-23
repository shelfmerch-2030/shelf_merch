import { z } from 'zod';
import { briefPlanSchema, mergeBrief, excluded, exclusionTerms } from './curator.js';

export const ADVISOR_LIMITS = Object.freeze({ requested: 25, pool: 150, page: 25, pages: 6, modelCandidates: 25, seen: 500, kitRows: 50 });
const text = z.string().trim().max(240);
export const advisorBriefSchema = z.object({
  brief: briefPlanSchema.shape.brief.extend({ recipientGroup: text.optional(), preferences: z.array(text).max(8).optional() }).strict(),
  clearBudget: z.boolean().default(false), replaceExclusions: z.boolean().default(false),
  count: z.number().int().min(1).max(25).optional(),
  combinations: z.boolean().optional(),
  queries: z.array(z.string().trim().min(1).max(60)).max(4).default([]),
}).strict();
export const advisorConceptSchema = z.object({
  groups: z.array(z.object({ name: z.string().trim().min(1).max(80), rationale: text, itemIds: z.array(z.string().max(100)).min(2).max(5) }).strict()).max(3),
}).strict();

// These are retrieval hints, not catalog categories or product attributes.
const OCCASIONS = [
  { match: /\bdiwali|deepavali|festiv(?:al|e)\b/i, name: 'Diwali / Festival', exact: ['diwali', 'deepavali', 'festive', 'festival'], related: ['gift', 'hamper', 'chocolate', 'sweet', 'candle', 'light', 'decor', 'dry fruit'] },
  { match: /\bchristmas|xmas\b/i, name: 'Christmas', exact: ['christmas', 'xmas'], related: ['gift', 'hamper', 'chocolate', 'candle', 'winter', 'holiday'] },
  { match: /\bonboarding|welcome|new (?:hire|joiner)s?\b/i, name: 'Welcome / Onboarding', exact: ['onboarding', 'welcome', 'new hire', 'new joiner'], related: ['desk', 'notebook', 'journal', 'stationery', 'pen', 'tech', 'apparel', 'bag', 'bottle'] },
  { match: /\bexecutive|leadership|client\b/i, name: 'Executive gifting', exact: ['executive', 'premium', 'luxury'], related: ['leather', 'tech', 'pen', 'desk', 'speaker', 'organizer', 'gift'] },
  { match: /\bappreciation|recognition|anniversary\b/i, name: 'Employee appreciation', exact: ['appreciation', 'recognition', 'anniversary'], related: ['wellness', 'gift', 'desk', 'journal', 'tech', 'chocolate', 'sustainable'] },
];
export function occasionHints(brief = {}) {
  return OCCASIONS.find(row => row.match.test(brief.occasion || '')) || { exact: [], related: ['gift', 'desk', 'tech', 'stationery', 'wellness', 'apparel', 'bag', 'drinkware'] };
}
const BUSINESS = /\b(?:wallet|balance|allocation|allocate|top[- ]?up|debit|payment|invoice|purchase order|campaign|collection|employee management|order status|track(?:ing)? (?:an? |my |the )?(?:order|delivery))\b|\b(?:create|publish|unpublish|update|delete|archive|fund|send|launch|invite|add|remove)\s+(?:(?:a|an|the|my|our|this)\s+)?(?:store|shop|wallet|campaign|collection|employee|contact|points|money|order|kit)\b|\b(?:show|list|find|manage)\s+(?:(?:my|our|the|all)\s+)?(?:stores?|shops?|orders?|employees|contacts)\b/i;
export function isCopilotBusinessRequest(content) {
  const businessAction = /\b(?:create|publish|unpublish|update|delete|archive|fund|launch|invite|add|remove)\b(?:\s+[\w'-]+){0,6}\s+(?:stores?|shops?|wallets?|campaigns?|collections?|employees?|contacts?|points|orders?)\b|\b(?:send|purchase|buy|order)\b.{0,80}\b(?:kits?|gifts?|products?|items?)\b|\b(?:department|entity|organization|organisation)\s+budgets?\b/i;
  return BUSINESS.test(content) || businessAction.test(content);
}

export function isCreativeGiftingRequest(content) {
  return !/\bshelf\s?merch\b|\b(?:in stock|available to order|actual products)\b/i.test(content)
    && /\b(?:creative|innovative|brainstorm|concepts?|imagine|kit ideas)\b/i.test(content)
    && /\b(?:kits?|gifts?|gifting|giveaways?|swag|merchandise)\b/i.test(content)
    && (/\bkits?\b/i.test(content) || !/\b(?:suggest|give|show|find|recommend)(?:\s+me)?\s+\d+\b/i.test(content));
}

export function isGiftingAdvisorRequest(content, conversation = {}) {
  if (isCopilotBusinessRequest(content) || /\b(?:do not|don't) call tools\b|\b(?:first|top)\s+\d+\s+(?:catalog\s+)?products\b/i.test(content)) return false;
  if (/\bgift(?:s|ing)?\b|\b(?:welcome|onboarding|diwali|christmas|appreciation|executive)\s+(?:kits?|merch(?:andise)?)\b|\b(?:suggest|recommend|need|want)\b.*\bkits?\b/i.test(content)) return true;
  const last = [...(conversation.messages || [])].reverse().find(row => row.role === 'assistant' && row.content);
  const active = Boolean(last?.artifacts?.some(artifact => artifact.kind === 'curation' && artifact.curation?.chat));
  return active && /\b(?:more|different|alternatives?|premium|affordable|cheaper|budget|instead|exclude|avoid|allow|include|forget|remove|other categories|for \d+|under|each|per person|per employee)\b/i.test(content);
}
export function updateAdvisorBrief(previous = {}, plan, content) {
  const brief = mergeBrief(previous, plan.brief, content, plan.replaceExclusions);
  // The old curator fallback guesses companies after "at/from"; prefer explicit extraction.
  if (!plan.brief.company && !/\b\d+\s+[A-Z][\w-]*\s+employees\b/.test(content)) {
    if (previous.company) brief.company = previous.company;
    else delete brief.company;
  }
  const occasion = OCCASIONS.find(row => row.match.test(content));
  if (occasion) brief.occasion = occasion.name;
  if (explicitBudgetRemoval(content)) {
    delete brief.budgetPerRecipient; delete brief.totalBudget;
  }
  if ((plan.brief.budgetPerRecipient || plan.brief.totalBudget) && !brief.currency) brief.currency = 'INR';
  return brief;
}
export function explicitBudgetRemoval(content) {
  return /\b(?:forget|ignore|remove|drop|clear)\s+(?:the |my |our )?budget\b|\bno budget (?:limit|constraint)\b|\bunlimited budget\b|\bbudget (?:is )?unlimited\b|\bno spending limit\b/i.test(content);
}
export function requestedAdvice(content, previous = {}, plan = {}) {
  const explicit = content.match(/\b(?:show|suggest|give|recommend|find|see)(?:\s+me)?\s+(\d+)\b(?!\s+(?:employees?|people|recipients?))(?=[^.!?]{0,80}\b(?:gifts?|ideas?|products?|options?|recommendations?)\b)/i)
    || content.match(/\b(\d+)\s+(?:more|additional)\b/i);
  const count = Math.min(ADVISOR_LIMITS.requested, Math.max(1, explicit ? Number(explicit[1]) : plan.count || previous.count || 8));
  const ranking = /\bpremium|executive|luxury\b/i.test(content) ? 'premium' : /\baffordable|cheaper|low.cost|economical\b/i.test(content) ? 'affordable' : previous.ranking || 'relevant';
  const combinations = plan.combinations ?? (/\b(?:individual|only products|products only)\b/i.test(content) ? false : previous.combinations ?? true);
  const budgetCleared = explicitBudgetRemoval(content) || Boolean(previous.budgetCleared && !plan.brief?.budgetPerRecipient && !plan.brief?.totalBudget);
  return { count, ranking, combinations, budgetCleared, differentCategories: /\b(?:other|different|new)\s+categories\b/i.test(content), revisit: /\b(?:revisit|repeat|previous|earlier|show again)\b/i.test(content) };
}
export function metadataText(item) {
  return [item.name, item.rankingDescription || item.description, item.category, item.subcategory, item.childCategory, ...(item.products || []).map(p => p.name), ...(item.variantOptions || []).flatMap(v => [v.color, v.size])].filter(Boolean).join(' ').toLowerCase();
}
export function scoreGift(item, brief, advice, queries = []) {
  const metadata = metadataText(item), hints = occasionHints(brief);
  const exact = hints.exact.filter(term => metadata.includes(term)).length;
  const related = hints.related.filter(term => metadata.includes(term)).length;
  const preference = [...(brief.preferences || []), ...queries].filter(term => metadata.includes(term.toLowerCase())).length;
  const price = item.price || 0;
  // Premium/affordable orders only compare actual INR prices; no invented popularity score.
  const base = exact * 100 + related * 8 + preference * 20;
  const priceBias = Math.min(1, price / Math.max(brief.budgetPerRecipient || 10000, 1));
  return base ? base + (advice.ranking === 'premium' ? priceBias : advice.ranking === 'affordable' ? -priceBias : 0) : 0;
}
export function advisorEligible(item, brief) {
  if (!/^[a-f\d]{24}$/i.test(item?.id || '') || !item.name || excluded(item, brief.exclusions)) return false;
  const hints = occasionHints(brief), metadata = metadataText(item);
  const occasionMarkers = ['diwali', 'deepavali', 'christmas', 'xmas', 'onboarding', 'welcome', 'new hire', 'new joiner', 'appreciation', 'recognition', 'anniversary', 'executive'];
  if (hints.exact.length && !hints.exact.some(term => metadata.includes(term)) && occasionMarkers.some(term => metadata.includes(term))) return false;
  if (item.availability === 'Out of stock') return false;
  if (item.kind === 'kit' && brief.exclusions?.length && (!item.products?.length || item.products.some(p => !p.name || /^item$/i.test(p.name)))) return false;
  if (item.price != null && (!Number.isFinite(item.price) || item.price < 0)) return false;
  return !(brief.currency === 'INR' && brief.budgetPerRecipient && item.price > brief.budgetPerRecipient);
}
export function safeAdvisorCopy(value, fallback = '') {
  const copy = String(value || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[*_`<>]/g, '').trim().slice(0, 240);
  return /(?:₹|\$|INR|USD)\s*\d|\b(?:trending|popular|best.?sell|in stock|guaranteed|free shipping)\b/i.test(copy) ? fallback : copy;
}
export function giftGroup(name, rationale, candidates, brief, kind = 'products') {
  const known = candidates.filter(item => item.price != null && Number.isFinite(item.price));
  const subtotal = Math.round(known.reduce((sum, item) => sum + item.price, 0) * 100) / 100;
  const complete = known.length === candidates.length;
  return { name, rationale, kind,
    artifacts: candidates.map(item => item.kind === 'kit' ? { kind: 'kit', kit: item.card } : { kind: 'product', product: item.card }),
    ...(kind === 'combination' || kind === 'existing_kit' ? { subtotal, completePrice: complete, missingPrices: candidates.length - known.length,
      total: complete && brief.recipients ? Math.round(subtotal * brief.recipients * 100) / 100 : null,
      budgetDifference: complete && brief.currency === 'INR' && brief.budgetPerRecipient ? Math.round((brief.budgetPerRecipient - subtotal) * 100) / 100 : null,
    } : {}),
  };
}
export function buildAdvisorGroups(plan, selected, brief, combinations) {
  const byKey = new Map(selected.map(item => [item.key, item]));
  const used = new Set(), groups = [];
  for (const row of plan.groups || []) {
    const keys = [...new Set(row.itemIds)];
    // Reject the whole proposed combination if any reference is fabricated or already used.
    if (keys.length < 2 || keys.some(key => !byKey.has(key) || used.has(key) || byKey.get(key).kind !== 'product')) continue;
    const items = keys.map(key => byKey.get(key));
    const subtotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
    if (combinations && brief.currency === 'INR' && brief.budgetPerRecipient && subtotal > brief.budgetPerRecipient) continue;
    groups.push(giftGroup(safeAdvisorCopy(row.name, combinations ? 'Suggested gift combination' : 'Catalog options'), safeAdvisorCopy(row.rationale, 'Actual catalog items matched to your gifting brief.'), items, brief, combinations ? 'combination' : 'products'));
    keys.forEach(key => used.add(key));
  }
  for (const item of selected.filter(item => item.kind === 'kit')) {
    groups.push(giftGroup(item.name, 'An existing ShelfMerch kit. Contents and stored price come from the kit READ service.', [item], brief, 'existing_kit'));
    used.add(item.key);
  }
  const remaining = selected.filter(item => !used.has(item.key));
  if (remaining.length) groups.push(giftGroup(groups.length ? 'Individual catalog alternatives' : 'Suggested catalog products', '', remaining, brief));
  return groups;
}
export { exclusionTerms };
