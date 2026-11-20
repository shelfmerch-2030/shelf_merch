import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { catalogSearchMongoFilter, escapeCatalogSearch, toCatalogSearchItem } from '../mcp/catalogSearch.js';
import { employeeReaderFromContext } from '../mcp/employeesRead.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { ForbiddenError } from '../../utils/errors.js';
import { runCopilotTool } from './copilotTools.js';
import { candidate } from './copilotCurator.service.js';
import { ADVISOR_LIMITS, advisorEligible, occasionHints, scoreGift, exclusionTerms, metadataText } from './giftingAdvisor.js';

const FIELDS = 'sku name brand category subcategory childCategory basePriceInr gstRate moq description primaryImageUrl variants';
const MATCH_FIELDS = ['name', 'description', 'category', 'subcategory', 'childCategory', 'brand'];
function termsFilter(terms) {
  return { $or: terms.slice(0, 20).flatMap(term => MATCH_FIELDS.map(field => ({ [field]: new RegExp(escapeCatalogSearch(term), 'i') }))) };
}
function cardCandidate(raw, kind, curated = false) {
  const item = candidate(raw, kind, curated);
  // Missing/zero kit summary prices and invalid prices must not look like free gifts.
  if (!Number.isFinite(item.price) || item.price <= 0) { item.price = null; item.currency = null; }
  const card = kind === 'product' ? {
    id: raw.id, name: raw.name, primaryImageUrl: raw.primaryImageUrl || '', sellingPriceInr: item.price, recommendation: true,
    category: raw.category, subcategory: raw.subcategory, childCategory: raw.childCategory, gstRate: raw.gstRate, moq: raw.moq,
    variants: [...(raw.variants || [])].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0)).slice(0, 8).map(v => ({ color: v.color, size: v.size, stock: v.stock, sellingPriceInr: v.sellingPriceInr })),
  } : { id: raw.id, name: raw.name, imageUrl: raw.imageUrl || '', priceInr: item.price, type: raw.type, recommendation: true, availability: item.availability,
    curated: item.curated, status: raw.status, products: (raw.products || []).map(p => ({ name: p.name, quantity: p.quantity, stockLabel: p.stockLabel })),
  };
  return { ...item, rankingDescription: String(raw.description || '').slice(0, 6000), variantOptions: card.variants?.map(v => ({ color: v.color, size: v.size })) || [], card };
}

/** Internal recommendation READ, not a new MCP contract. Keeps the existing catalog visibility/price mapping. */
export async function readAdvisorCatalogPage({ brief, terms, page, seenIds, omitCategories, ranking, role, toolCtx }) {
  const reader = employeeReaderFromContext(toolCtx);
  if (!reader.tenantId || reader.user.role !== role || !rolesForTenantArea('catalog', 'read').includes(role)) throw new ForbiddenError('Catalog recommendations are not available for this caller');
  const filter = catalogSearchMongoFilter({ ...(brief.currency === 'INR' && brief.budgetPerRecipient ? { maxSellingPriceInr: brief.budgetPerRecipient } : {}) });
  if (terms.length) filter.$and.push(termsFilter(terms));
  if (seenIds.length) filter.$and.push({ _id: { $nin: seenIds } });
  if (omitCategories.length) filter.$and.push({ category: { $nin: omitCategories } });
  const exclusions = exclusionTerms(brief.exclusions);
  if (exclusions.length) {
    const pattern = new RegExp(`\\b(?:${exclusions.map(escapeCatalogSearch).join('|')})\\b`, 'i');
    filter.$and.push({ $nor: ['name', 'category', 'subcategory', 'childCategory'].map(field => ({ [field]: pattern })) });
  }
  const sort = ranking === 'premium' ? { basePriceInr: -1, name: 1, _id: 1 } : ranking === 'affordable' ? { basePriceInr: 1, name: 1, _id: 1 } : { name: 1, _id: 1 };
  const rows = await CatalogProduct.find(filter).select(FIELDS).sort(sort).skip((page - 1) * ADVISOR_LIMITS.page).limit(ADVISOR_LIMITS.page + 1).maxTimeMS(3000).lean();
  return { items: rows.slice(0, ADVISOR_LIMITS.page).map(toCatalogSearchItem), hasMore: rows.length > ADVISOR_LIMITS.page };
}

export async function discoverAdvisorCandidates({ brief, advice, queries = [], state = {}, role, toolCtx, signal, onRead,
  readPage = readAdvisorCatalogPage, readTool = runCopilotTool }) {
  if (brief.source === 'external') return { candidates: [], scanned: 0, readCalls: 0, bounded: true };
  const seen = new Set(advice.revisit ? [] : state.seenKeys || []);
  const seenIds = [...seen].filter(key => key.startsWith('product:')).map(key => key.slice(8)).filter(id => /^[a-f\d]{24}$/i.test(id));
  const hints = occasionHints(brief);
  const metadataQueries = [...new Set([...(brief.preferences || []), ...queries])].filter(Boolean).map(term => term.slice(0, 60));
  const tiers = [hints.exact, [...hints.related, ...metadataQueries]].filter(terms => terms.length);
  const found = new Map();
  let readCalls = 0, scanned = 0, pages = 0;
  const emit = (name, status) => onRead?.(name, status);
  const aborted = () => { if (signal?.aborted) throw Object.assign(new Error('Request aborted'), { code: 'ABORT_ERR' }); };
  for (const terms of tiers) {
    for (let page = 1; page <= 3 && pages < ADVISOR_LIMITS.pages; page += 1) {
      aborted(); emit('gifting_catalog_read', 'running'); readCalls += 1; pages += 1;
      const result = await readPage({ brief, terms, page, seenIds, omitCategories: advice.differentCategories ? (state.lastCategories || []) : [], ranking: advice.ranking, role, toolCtx });
      const rows = result.items.slice(0, ADVISOR_LIMITS.page); scanned += rows.length;
      for (const raw of rows) {
        const item = cardCandidate(raw, 'product');
        if (advisorEligible(item, brief) && !seen.has(item.key)) found.set(item.key, item);
      }
      emit('gifting_catalog_read', 'done');
      if (!result.hasMore || found.size >= advice.count * 2) break;
    }
    if (found.size >= advice.count * 2) break;
  }
  // Reuse both actual kit READ services. Workspace scoping and permissions remain in those handlers.
  if (!advice.differentCategories) for (const name of ['kits_list_curated', 'kits_list']) {
    for (const query of [...new Set([hints.exact[0] || '', ''])]) {
      aborted(); emit(name, 'running'); readCalls += 1;
      const { result } = await readTool(name, toolCtx, { limit: ADVISOR_LIMITS.kitRows, ...(query ? { query } : {}),
        ...(name === 'kits_list' ? { status: 'live', type: 'customized' } : brief.currency === 'INR' && brief.budgetPerRecipient ? { maxPriceInr: brief.budgetPerRecipient } : {}),
      }, role);
      for (const raw of (result?.items || []).slice(0, ADVISOR_LIMITS.kitRows)) {
        const item = cardCandidate(raw, 'kit', name === 'kits_list_curated');
        const score = scoreGift(item, brief, advice, metadataQueries);
        if (advisorEligible(item, brief) && !seen.has(item.key) && score > 0 && (item.curated ? ['active', 'live'] : ['live']).includes(item.status)) found.set(item.key, item);
      }
      emit(name, 'done');
    }
  }
  const candidates = [...found.values()].map(item => ({ ...item, matchScore: scoreGift(item, brief, advice, metadataQueries) }))
    .filter(item => item.matchScore > 0 || (advice.ranking === 'affordable' && occasionHints(brief).related.some(term => [item.name, item.category, item.description].join(' ').toLowerCase().includes(term))))
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
  return { candidates, scanned, readCalls, bounded: true, exactMatches: candidates.filter(item => hints.exact.some(term => metadataText(item).includes(term))).length };
}
