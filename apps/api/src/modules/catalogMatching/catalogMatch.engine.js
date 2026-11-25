import { sizeKey } from '../orders/orderItemResolver.js';

/**
 * Rule-based catalog matching: a client's product row → the best ShelfMerch
 * catalog products, with an explainable score in [0, 1].
 *
 * Signals (no AI):
 *   - exact identifiers: client SKU / barcode equal to our product or variant SKU → 1.0
 *   - name similarity: word overlap (Dice) + character-trigram overlap, after
 *     normalising product-type synonyms (tee ≡ t-shirt, sipper ≡ bottle…)
 *   - brand, model-number tokens, product type, material
 *   - variant fit: the client's size/colour must exist on our product
 * Pure functions — unit-tested without a database.
 */

export const THRESHOLDS = { auto: 0.9, review: 0.6, candidate: 0.3, ambiguityMargin: 0.05 };

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'with', 'for', 'of', 'in', 'by', 'to', 'on', 'new', 'pack', 'set', 'pcs', 'pc']);

/** Product-type vocabulary: any phrase on the right normalises to the type on the left. */
const TYPE_SYNONYMS = {
  tshirt: ['t shirt', 'tshirt', 'tee', 'tees', 'crew neck', 'crewneck', 'round neck'],
  polo: ['polo', 'polo shirt', 'collar t shirt', 'collared'],
  hoodie: ['hoodie', 'hoody', 'hooded sweatshirt', 'hooded'],
  sweatshirt: ['sweatshirt', 'sweat shirt', 'pullover'],
  jacket: ['jacket', 'windcheater', 'bomber'],
  cap: ['cap', 'caps', 'baseball cap', 'hat'],
  mug: ['mug', 'mugs', 'coffee mug', 'cup'],
  bottle: ['bottle', 'bottles', 'sipper', 'flask', 'tumbler'],
  tote: ['tote', 'tote bag', 'jute bag', 'canvas bag'],
  backpack: ['backpack', 'laptop bag', 'rucksack'],
  notebook: ['notebook', 'diary', 'journal', 'planner'],
  pen: ['pen', 'pens', 'ballpoint'],
};

const PHRASE_TO_TYPE = Object.entries(TYPE_SYNONYMS)
  .flatMap(([type, phrases]) => phrases.map((p) => [p, type]))
  .sort((a, b) => b[0].length - a[0].length); // longest phrase first

const COLOR_ALIASES = { gray: 'grey', 'navy blue': 'navy', 'off white': 'offwhite', 'sky blue': 'skyblue' };

export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeColor(c) {
  const n = normalizeText(c);
  return (COLOR_ALIASES[n] ?? n).replace(/\s+/g, '');
}

/** Product type(s) mentioned in a text, e.g. "Logo Tee - Black" → ['tshirt']. */
export function productTypes(text) {
  let t = ` ${normalizeText(text)} `;
  const found = new Set();
  for (const [phrase, type] of PHRASE_TO_TYPE) {
    if (t.includes(` ${phrase} `)) {
      found.add(type);
      t = t.replaceAll(` ${phrase} `, ' ');
    }
  }
  return found;
}

/** Name → comparable word tokens: type phrases canonicalised, colour/size words removed. */
export function nameTokens(name, { color, size } = {}) {
  let t = ` ${normalizeText(name)} `;
  for (const [phrase, type] of PHRASE_TO_TYPE) t = t.replaceAll(` ${phrase} `, ` ${type} `);
  const drop = new Set([normalizeText(color), sizeKey(size)].filter(Boolean).flatMap((v) => v.split(' ')));
  // Unique: "crew neck tee" must not count the canonical type twice.
  return [
    ...new Set(
      t
        .trim()
        .split(' ')
        .filter((w) => w && !STOPWORDS.has(w) && !drop.has(w) && !drop.has(sizeKey(w))),
    ),
  ];
}

/** Alphanumeric tokens with digits (model / part numbers), e.g. "PW200", "A-123" → "a123". */
export function modelTokens(...texts) {
  const out = new Set();
  for (const text of texts) {
    for (const raw of String(text ?? '').split(/[\s,/|()]+/)) {
      const w = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (w.length >= 3 && /\d/.test(w) && /[a-z]/.test(w)) out.add(w);
    }
  }
  return out;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return (2 * inter) / (a.size + b.size);
}

function trigrams(s) {
  const t = ` ${s} `;
  const out = new Set();
  for (let i = 0; i < t.length - 2; i += 1) out.add(t.slice(i, i + 3));
  return out;
}

/** 0..1 similarity of two token lists: words (60%) + character trigrams (40%). */
export function nameSimilarity(tokensA, tokensB) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  // Short client names ("Coffee Mug" vs "Ceramic Coffee Mug 11oz") score low on Dice alone; containment
  // (overlap coefficient) lifts them into review range. Capped at 0.75 so that, even with brand/type/model/
  // material bonuses (0.7*0.75 + 0.35 = 0.875), containment alone never reaches the 0.9 auto-map threshold.
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const containment = a.size && b.size ? inter / Math.min(a.size, b.size) : 0;
  const words = dice(a, b);
  const chars = dice(trigrams(tokensA.join(' ')), trigrams(tokensB.join(' ')));
  return Math.max(0.6 * words + 0.4 * chars, 0.75 * containment);
}

/** Precompute what we compare on for every catalog product (once per run). */
export function indexCatalog(products) {
  return products.map((p) => {
    const variants = (p.variants ?? []).filter((v) => v.enabled !== false);
    const skus = new Map();
    if (p.sku) skus.set(p.sku.toLowerCase(), null);
    for (const v of variants) if (v.sku) skus.set(v.sku.toLowerCase(), v);
    const typeText = [p.name, p.category, p.subcategory, p.childCategory, p.group].filter(Boolean).join(' ');
    return {
      product: p,
      id: String(p._id),
      variants,
      skus,
      tokens: nameTokens(p.name),
      normName: nameTokens(p.name).join(' '),
      brand: normalizeText(p.brand),
      material: normalizeText(p.material),
      types: productTypes(typeText),
      models: modelTokens(p.name, p.sku),
    };
  });
}

/** Find our variant for the client's size/colour. Returns { variant, ok }. */
function fitVariant(entry, row) {
  if (!entry.variants.length) return { variant: null, ok: true };
  if (!row.size && !row.color) return { variant: null, ok: true }; // follow each order
  const v = entry.variants.find(
    (x) =>
      (!row.size || sizeKey(x.size) === sizeKey(row.size)) &&
      (!row.color || normalizeColor(x.color) === normalizeColor(row.color)),
  );
  return { variant: v ?? null, ok: Boolean(v) };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Score one client row against one catalog entry.
 * Returns { score, reasons[], variant, variantOk, exact }.
 */
export function scorePair(row, entry) {
  // 1. Exact identifiers.
  for (const [id, label] of [[row.sku, 'SKU'], [row.barcode, 'barcode']]) {
    const key = String(id ?? '').trim().toLowerCase();
    if (key && entry.skus.has(key)) {
      const viaVariant = entry.skus.get(key);
      const fit = viaVariant ? { variant: viaVariant, ok: true } : fitVariant(entry, row);
      return { score: 1, reasons: [`${label} matches ${viaVariant ? 'variant' : 'product'} SKU`], variant: fit.variant, variantOk: fit.ok, exact: true };
    }
  }

  // 2. Similarity.
  const reasons = [];
  const rowTokens = nameTokens(row.name, row);
  const sim = nameSimilarity(rowTokens, entry.tokens);
  let score = 0.7 * sim;
  reasons.push(`name ${Math.round(sim * 100)}%`);
  if (rowTokens.length && rowTokens.join(' ') === entry.normName) {
    score += 0.12;
    reasons.push('same name');
  }

  const rowTypes = productTypes([row.name, row.category].filter(Boolean).join(' '));
  if (rowTypes.size && entry.types.size) {
    if ([...rowTypes].some((t) => entry.types.has(t))) {
      score += 0.1;
      reasons.push('same product type');
    } else {
      score -= 0.25;
      reasons.push('different product type');
    }
  }

  const brand = normalizeText(row.brand);
  if (brand && entry.brand) {
    if (brand === entry.brand) {
      score += 0.1;
      reasons.push('same brand');
    } else {
      score -= 0.1;
      reasons.push('different brand');
    }
  }

  const rowModels = modelTokens(row.model, row.name);
  if (rowModels.size && [...rowModels].some((m) => entry.models.has(m))) {
    score += 0.1;
    reasons.push('model number matches');
  }

  const material = normalizeText(row.material);
  if (material && entry.material && material === entry.material) {
    score += 0.05;
    reasons.push('same material');
  }

  const fit = fitVariant(entry, row);
  if (!fit.ok) {
    score -= 0.15;
    reasons.push(`no ${[row.size, row.color].filter(Boolean).join(' / ')} variant`);
  }

  // Non-exact evidence never reaches 1.0.
  return { score: round2(Math.max(0, Math.min(0.97, score))), reasons, variant: fit.variant, variantOk: fit.ok, exact: false };
}

/**
 * Best candidates for one client row and the resulting decision:
 *   auto_mapped — confident, variant fits, and clearly ahead of the runner-up
 *   review      — plausible, needs a human
 *   no_match    — nothing plausible
 */
export function matchRow(row, index, thresholds = THRESHOLDS) {
  const scored = index
    .map((entry) => ({ entry, ...scorePair(row, entry) }))
    .filter((c) => c.score >= thresholds.candidate)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const candidates = scored.map((c) => ({
    catalogProductId: c.entry.id,
    name: c.entry.product.name,
    sku: c.entry.product.sku,
    score: c.score,
    reasons: c.reasons,
    variant: c.variant ? { size: c.variant.size ?? '', color: c.variant.color ?? '', sku: c.variant.sku ?? '' } : null,
    variantOk: c.variantOk,
  }));

  const best = candidates[0];
  if (!best || best.score < thresholds.review) return { decision: 'no_match', bestScore: best?.score ?? 0, candidates };

  const runnerUp = candidates[1];
  const ambiguous = runnerUp && !best.reasons[0]?.includes('SKU') && best.score - runnerUp.score < thresholds.ambiguityMargin;
  if (best.score >= thresholds.auto && best.variantOk && !ambiguous) {
    return { decision: 'auto_mapped', bestScore: best.score, candidates };
  }
  const why = [];
  if (best.score < thresholds.auto) why.push('below auto-map confidence');
  if (!best.variantOk) why.push('variant not found');
  if (ambiguous) why.push('two products are equally likely');
  return { decision: 'review', bestScore: best.score, candidates, reviewReason: why.join('; ') };
}
