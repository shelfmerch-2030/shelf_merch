import { z } from 'zod';
import { publicHttpsUrl } from './copilotExternalListingMedia.js';

const currencyCodes = new Set(['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD']);

const priceSchema = z.object({
  text: z.string().min(1).max(40),
  numeric: z.number().positive(),
  currency: z.string().min(3).max(8),
}).strict();

const externalProductSchema = z.object({
  verification: z.literal('verified_listing'),
  name: z.string().trim().min(3).max(160),
  productUrl: z.string().url().max(2048),
  sourceUrl: z.string().url().max(2048),
  sourceTitle: z.string().max(160),
  merchantHostname: z.string().min(1).max(253),
  merchantDisplayName: z.string().min(1).max(120).optional(),
  priceText: z.string().min(1).max(40).optional(),
  priceNumeric: z.number().positive().optional(),
  currency: z.string().min(3).max(8).optional(),
  availability: z.literal('unknown'),
  imageUrl: z.string().url().max(2048).optional(),
  imageProvenance: z.enum(['merchant_og', 'merchant_meta']).optional(),
  retrievedAt: z.string().datetime(),
  reason: z.string().max(240).optional(),
}).strict();

const kitComponentSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('verified_listing'),
    name: z.string().trim().min(3).max(160),
    externalProductIndex: z.number().int().min(0).max(24),
    priceText: z.string().min(1).max(40).optional(),
    priceNumeric: z.number().positive().optional(),
    currency: z.string().min(3).max(8).optional(),
    imageUrl: z.string().url().max(2048).optional(),
    productUrl: z.string().url().max(2048).optional(),
  }).strict(),
  z.object({
    role: z.literal('concept'),
    name: z.string().trim().min(3).max(160),
    reason: z.string().trim().min(5).max(240),
  }).strict(),
]);

const giftKitIdeaSchema = z.object({
  name: z.string().trim().min(3).max(120),
  rationale: z.string().trim().min(5).max(320),
  packagingSuggestion: z.string().trim().min(5).max(320),
  recipientFit: z.string().trim().min(5).max(320),
  components: z.array(kitComponentSchema).min(1).max(6),
  budget: z.object({
    status: z.enum(['complete', 'partial', 'unavailable']),
    currency: z.string().min(3).max(8).optional(),
    knownSubtotal: z.number().positive().optional(),
    missingPriceCount: z.number().int().min(0).max(6),
    note: z.string().min(1).max(240),
  }).strict(),
  imagePolicy: z.literal('none'),
}).strict();

export function currencyFromPriceText(text) {
  if (typeof text !== 'string') return null;
  if (/^(?:₹|INR|Rs\.?)/i.test(text.trim())) return 'INR';
  if (/^(?:\$|USD)/i.test(text.trim())) return 'USD';
  if (/^(?:€|EUR)/i.test(text.trim())) return 'EUR';
  if (/^(?:£|GBP)/i.test(text.trim())) return 'GBP';
  if (/^CAD/i.test(text.trim())) return 'CAD';
  if (/^AUD/i.test(text.trim())) return 'AUD';
  return null;
}

export function merchantHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Prefer injected env module (tests mutate the shared env object). */
export function cardsEnabled(env) {
  return env?.EMBEDDED_COPILOT_EXTERNAL_PRODUCT_CARDS_ENABLED === 'true';
}

export function imageEnrichmentEnabled(env) {
  return env?.EMBEDDED_COPILOT_EXTERNAL_IMAGE_ENRICHMENT_ENABLED === 'true';
}

export function buildExternalProductArtifacts(findings, { retrievedAt = new Date().toISOString() } = {}) {
  const artifacts = [];
  for (const item of findings) {
    const safeUrl = publicHttpsUrl(item.source?.url);
    const host = merchantHostname(safeUrl || '');
    if (!safeUrl || !host) continue;
    const priceCurrency = item.price?.currency || (item.price ? currencyFromPriceText(item.price.text) : null);
    const payload = {
      verification: 'verified_listing',
      name: item.row.name,
      productUrl: safeUrl,
      sourceUrl: safeUrl,
      sourceTitle: item.source.title || host,
      merchantHostname: host,
      availability: 'unknown',
      retrievedAt,
      ...(item.reason ? { reason: item.reason } : {}),
      ...(item.price && priceCurrency && currencyCodes.has(priceCurrency) ? {
        priceText: item.price.text,
        priceNumeric: item.price.numeric,
        currency: priceCurrency,
      } : {}),
    };
    const parsed = externalProductSchema.safeParse(payload);
    if (parsed.success) artifacts.push({ kind: 'external_product', product: parsed.data });
  }
  return artifacts;
}

function kitBudget(components) {
  const note = 'Item prices only when source-verified. Packaging, branding, GST and shipping are not included.';
  const verified = components.filter(row => row.role === 'verified_listing');
  const priced = verified.filter(row => row.priceNumeric != null && row.currency);
  const missingPriceCount = components.length - priced.length;
  if (!priced.length) {
    return { status: 'unavailable', missingPriceCount: components.length, note };
  }
  const currencies = [...new Set(priced.map(row => row.currency))];
  if (currencies.length !== 1) {
    return { status: 'unavailable', missingPriceCount, note: `${note} Mixed currencies cannot be totaled.` };
  }
  const knownSubtotal = priced.reduce((sum, row) => sum + row.priceNumeric, 0);
  if (missingPriceCount > 0) {
    return { status: 'partial', currency: currencies[0], knownSubtotal, missingPriceCount, note };
  }
  return { status: 'complete', currency: currencies[0], knownSubtotal, missingPriceCount: 0, note };
}

function sanitizeConcept(name, reason) {
  const cleanName = String(name || '').trim().slice(0, 160);
  const cleanReason = String(reason || '').trim().slice(0, 240);
  if (cleanName.length < 3 || cleanReason.length < 5) return null;
  return { role: 'concept', name: cleanName, reason: cleanReason };
}

function verifiedComponentFromProduct(product, index) {
  if (product?.kind !== 'external_product') return null;
  return {
    role: 'verified_listing',
    name: product.product.name,
    externalProductIndex: index,
    ...(product.product.priceText ? { priceText: product.product.priceText } : {}),
    ...(product.product.priceNumeric != null ? { priceNumeric: product.product.priceNumeric } : {}),
    ...(product.product.currency ? { currency: product.product.currency } : {}),
    ...(product.product.imageUrl ? { imageUrl: product.product.imageUrl } : {}),
    ...(product.product.productUrl ? { productUrl: product.product.productUrl } : {}),
  };
}

/**
 * Build gift kit ideas from verified listings + concepts.
 * Always attempts to reach `requestedCount` kits using conceptual fill when listings are short.
 */
export function buildGiftKitIdeaArtifacts({
  findings = [],
  concepts = [],
  externalProducts = [],
  kitPlans = [],
  requestedCount = 3,
  company,
  audience,
}) {
  const count = Math.min(12, Math.max(1, requestedCount || 3));
  const audienceLabel = audience === 'employee gifting' ? 'employees'
    : audience === 'event giveaways' ? 'event recipients' : 'recipients';
  const companyLabel = company ? String(company).slice(0, 80) : null;
  const defaultFit = companyLabel
    ? `Practical corporate gifting fit for ${companyLabel} ${audienceLabel}.`
    : `Practical corporate gifting fit for ${audienceLabel}.`;
  const defaultPackaging = 'Present in a branded sleeve or compact gift box with a short welcome note. Confirm packaging with the supplier before ordering.';

  const findingIndex = finding => findings.indexOf(finding);
  const fromPlans = [];
  for (const plan of kitPlans) {
    const components = [];
    for (const component of plan.components || []) {
      if (component.role === 'verified_listing' && component.finding) {
        const index = findingIndex(component.finding);
        const product = index >= 0 ? externalProducts[index] : null;
        const verified = verifiedComponentFromProduct(product, index >= 0 ? index : 0)
          || (index >= 0 ? {
            role: 'verified_listing',
            name: component.finding.row.name,
            externalProductIndex: index,
            ...(component.finding.price ? {
              priceText: component.finding.price.text,
              priceNumeric: component.finding.price.numeric,
              currency: component.finding.price.currency || currencyFromPriceText(component.finding.price.text),
            } : {}),
            productUrl: component.finding.source.url,
          } : null);
        if (verified) components.push(verified);
        continue;
      }
      if (component.role === 'concept') {
        const row = sanitizeConcept(component.name, component.reason);
        if (row) components.push(row);
      }
    }
    if (!components.length) continue;
    const payload = {
      name: String(plan.name).slice(0, 120),
      rationale: String(plan.rationale).slice(0, 320),
      packagingSuggestion: String(plan.packaging || defaultPackaging).slice(0, 320),
      recipientFit: String(plan.recipientFit || defaultFit).slice(0, 320),
      components,
      budget: kitBudget(components),
      imagePolicy: 'none',
    };
    const parsed = giftKitIdeaSchema.safeParse(payload);
    if (parsed.success) fromPlans.push({ kind: 'gift_kit_idea', kit: parsed.data });
    if (fromPlans.length === count) return fromPlans;
  }

  const kits = [...fromPlans];
  for (let index = kits.length; index < count; index++) {
    const components = [];
    const product = externalProducts[index];
    const finding = findings[index];
    const verified = verifiedComponentFromProduct(product, index);
    if (verified) components.push(verified);
    else if (finding) {
      const currency = finding.price?.currency || (finding.price ? currencyFromPriceText(finding.price.text) : null);
      components.push({
        role: 'verified_listing',
        name: finding.row.name,
        externalProductIndex: index,
        ...(finding.price && currency ? {
          priceText: finding.price.text,
          priceNumeric: finding.price.numeric,
          currency,
        } : {}),
        productUrl: finding.source.url,
      });
    }

    const concept = concepts[index] || (concepts.length ? concepts[index % concepts.length] : null);
    if (concept) {
      const row = sanitizeConcept(concept.name, concept.reason);
      if (row && !components.some(item => item.name.toLowerCase() === row.name.toLowerCase())) {
        components.push(row);
      }
    }

    if (!components.length) {
      const fallback = sanitizeConcept(
        `Concept kit ${index + 1}`,
        'A themed corporate gift set to source from a supplier; prices and stock need a quote.',
      );
      if (fallback) components.push(fallback);
    }

    if (components.length === 1 && concepts.length) {
      const extra = concepts[(index + 1) % concepts.length];
      const row = sanitizeConcept(
        extra?.name || `Complementary item ${index + 1}`,
        extra?.reason || 'A complementary gift item to source alongside the primary product.',
      );
      if (row && row.name.toLowerCase() !== components[0].name.toLowerCase()) components.push(row);
    }

    const name = product?.product?.name
      ? `${product.product.name} gift kit`
      : concept?.name
        ? `${concept.name}`
        : `Gifting kit ${index + 1}`;
    const rationale = product?.product?.reason
      || finding?.reason
      || concept?.reason
      || 'A practical themed kit assembled for corporate gifting. Verify each component with suppliers before ordering.';

    const payload = {
      name: name.slice(0, 120),
      rationale: String(rationale).slice(0, 320),
      packagingSuggestion: defaultPackaging,
      recipientFit: defaultFit,
      components,
      budget: kitBudget(components),
      imagePolicy: 'none',
    };
    const parsed = giftKitIdeaSchema.safeParse(payload);
    if (parsed.success) kits.push({ kind: 'gift_kit_idea', kit: parsed.data });
  }
  return kits;
}

export function applyImageToExternalProducts(artifacts, imagesByUrl) {
  if (!imagesByUrl?.size) return artifacts;
  return artifacts.map(row => {
    if (row.kind !== 'external_product') return row;
    const image = imagesByUrl.get(row.product.productUrl);
    const safeImage = publicHttpsUrl(image?.imageUrl);
    if (!safeImage) return row;
    const next = {
      ...row.product,
      imageUrl: safeImage,
      imageProvenance: image.provenance === 'merchant_meta' ? 'merchant_meta' : 'merchant_og',
    };
    const parsed = externalProductSchema.safeParse(next);
    return parsed.success ? { kind: 'external_product', product: parsed.data } : row;
  });
}

export function syncKitImagesFromProducts(kitArtifacts, productArtifacts) {
  return kitArtifacts.map(row => {
    if (row.kind !== 'gift_kit_idea') return row;
    const components = row.kit.components.map(component => {
      if (component.role !== 'verified_listing') return component;
      const product = productArtifacts[component.externalProductIndex]?.product;
      if (!product?.imageUrl) return component;
      return { ...component, imageUrl: product.imageUrl, productUrl: product.productUrl || component.productUrl };
    });
    const payload = { ...row.kit, components, budget: kitBudget(components) };
    const parsed = giftKitIdeaSchema.safeParse(payload);
    return parsed.success ? { kind: 'gift_kit_idea', kit: parsed.data } : row;
  });
}

// Re-export for tests
export const schemas = { externalProductSchema, giftKitIdeaSchema, priceSchema };
