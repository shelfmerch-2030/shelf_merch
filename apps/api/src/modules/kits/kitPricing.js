/**
 * Shared kit send money math — must stay in sync with
 * apps/web/src/features/send/money.ts.
 */
export const PREMIUM_BOX_PER_RECIP = 49;
export const SAMPLE_WRAP_PER_KIT = 35;
/** @deprecated Prefer SAMPLE_WRAP_PER_KIT */
export const SAMPLE_PRECURATED_BOX_PER_KIT = SAMPLE_WRAP_PER_KIT;
export const SAMPLE_SHIP_PER_KIT = 50;
export const SAMPLE_BRANDING_PER_KIT = 0;
const SERVICE_FEE_RATE = 0.12;
const SHIP_PER_RECIP = 120;
const GST_RATE = 0.18;
const APPAREL_GST_RATE = 0.05;

/** Sum of catalog basePriceInr for selected kit products (qty 1 each). Curated / publish. */
export function sumKitProductPrices(products = []) {
  return products.reduce((sum, p) => sum + Math.round(Number(p?.basePriceInr) || 0), 0);
}

/** Product-level GST rate from category. Apparel = 5%, everything else = 18%. */
export function productGstRate(category) {
  return String(category || '').trim().toLowerCase() === 'apparel'
    ? APPAREL_GST_RATE
    : GST_RATE;
}

/**
 * Strip GST from a GST-inclusive basePriceInr.
 * Base Price = Inclusive Price / (1 + GST Rate)
 */
export function netPriceExGst(basePriceInr, category) {
  const inclusive = Math.max(0, Number(basePriceInr) || 0);
  if (!inclusive) return 0;
  const rate = productGstRate(category);
  return Math.round(inclusive / (1 + rate));
}

/** Kit GST is 5% only when every product is Apparel; otherwise 18%. */
export function customisedKitGstRate(products = []) {
  if (!products.length) return GST_RATE;
  return products.every((p) => productGstRate(p?.category) === APPAREL_GST_RATE)
    ? APPAREL_GST_RATE
    : GST_RATE;
}

/** Sum of net (ex-GST) product prices for a customised kit. */
export function sumCustomisedKitNetPrices(products = []) {
  return products.reduce(
    (sum, p) => sum + netPriceExGst(Number(p?.basePriceInr) || 0, p?.category),
    0,
  );
}

/**
 * Curated kit checkout — approxValueInr is GST-inclusive (18%).
 * Base = inclusive / 1.18; packaging is ex-GST; GST applied on (base + packaging).
 */
export function curatedKitSendTotals(recipientCount, pricePerKitInr, packaging = 'none') {
  const qty = Math.max(0, Number(recipientCount) || 0);
  const kitIncl = Math.max(0, Math.round(Number(pricePerKitInr) || 0));
  const kitBase = kitIncl > 0 ? Math.round(kitIncl / (1 + GST_RATE)) : 0;
  const pkgPerKit = packaging === 'box' ? PREMIUM_BOX_PER_RECIP : 0;
  const taxablePerKit = kitBase + pkgPerKit;
  const taxPerKit = Math.ceil(taxablePerKit * GST_RATE);
  const costPerKit = taxablePerKit + taxPerKit;
  const total = costPerKit * qty;
  return {
    qty,
    unitPrice: kitBase,
    pkgPerKit,
    costPerKit,
    sub: taxablePerKit * qty,
    pkgCost: pkgPerKit * qty,
    fee: 0,
    ship: 0,
    tax: taxPerKit * qty,
    total,
    kitGstRate: GST_RATE,
    itemsSubtotal: kitBase,
    taxablePerKit,
  };
}

/**
 * Legacy kit send math — unit price treated as ex-GST.
 * Prefer curatedKitSendTotals for platform curated kits (approxValueInr).
 */
export function kitSendTotals(recipientCount, packaging, kitUnitPriceInr) {
  const qty = Math.max(0, Number(recipientCount) || 0);
  const unitPrice = Math.max(0, Math.round(Number(kitUnitPriceInr) || 0));
  const pkgPerKit = packaging === 'box' ? PREMIUM_BOX_PER_RECIP : 0;
  const costPerKitExGst = unitPrice + pkgPerKit;
  // Price per kit is GST-inclusive; grand total = recipients × inclusive price.
  const costPerKit = Math.round(costPerKitExGst * (1 + GST_RATE));
  const total = costPerKit * qty;
  const tax = total - costPerKitExGst * qty;
  return {
    qty,
    unitPrice,
    pkgPerKit,
    costPerKit,
    sub: total,
    pkgCost: pkgPerKit * qty,
    fee: 0,
    ship: 0,
    tax,
    total,
  };
}

/**
 * Customised Kit checkout math — must stay in sync with money.ts customisedKitSendTotals().
 */
export function customisedKitSendTotals(recipientCount, packaging, products = []) {
  const qty = Math.max(0, Number(recipientCount) || 0);
  const itemsSubtotal = sumCustomisedKitNetPrices(products);
  const pkgPerKit = packaging === 'box' ? PREMIUM_BOX_PER_RECIP : 0;
  const taxablePerKit = itemsSubtotal + pkgPerKit;
  const kitGstRate = customisedKitGstRate(products);
  const taxPerKit = Math.ceil(taxablePerKit * kitGstRate);
  const costPerKit = taxablePerKit + taxPerKit;
  const total = costPerKit * qty;
  return {
    qty,
    unitPrice: itemsSubtotal,
    pkgPerKit,
    costPerKit,
    sub: taxablePerKit * qty,
    pkgCost: pkgPerKit * qty,
    fee: 0,
    ship: 0,
    tax: taxPerKit * qty,
    total,
    itemsSubtotal,
    kitGstRate,
    taxablePerKit,
  };
}

function normalizeSamplePackaging(packaging) {
  if (packaging === 'wrap' || packaging === 'box') return packaging;
  return 'none';
}

/**
 * Sample-order totals — must stay in sync with money.ts sampleKitSendTotals().
 * Wrapping ₹35; customised box ₹49; shipping ₹50. Branding is always ₹0.
 */
export function sampleKitSendTotals({
  kind,
  packaging,
  pricePerKitInr = 0,
  products = [],
  recipientCount = 1,
} = {}) {
  const qty = Math.max(1, Math.round(Number(recipientCount) || 1));
  const pkg = normalizeSamplePackaging(packaging);

  let totals;
  if (kind === 'customised') {
    if (pkg === 'wrap') {
      const base = customisedKitSendTotals(qty, 'none', products);
      const pkgPerKit = SAMPLE_WRAP_PER_KIT;
      const taxablePerKit = (base.itemsSubtotal ?? base.unitPrice) + pkgPerKit;
      const kitGstRate = base.kitGstRate ?? GST_RATE;
      const taxPerKit = Math.ceil(taxablePerKit * kitGstRate);
      const costPerKit = taxablePerKit + taxPerKit;
      totals = {
        ...base,
        pkgPerKit,
        costPerKit,
        sub: taxablePerKit * qty,
        pkgCost: pkgPerKit * qty,
        tax: taxPerKit * qty,
        total: costPerKit * qty,
        taxablePerKit,
      };
    } else {
      totals = customisedKitSendTotals(qty, pkg === 'box' ? 'box' : 'none', products);
    }
  } else {
    const kitIncl = Math.max(0, Math.round(Number(pricePerKitInr) || 0));
    const kitBase = kitIncl > 0 ? Math.round(kitIncl / (1 + GST_RATE)) : 0;
    const pkgPerKit = pkg === 'wrap' || pkg === 'box' ? SAMPLE_WRAP_PER_KIT : 0;
    const taxablePerKit = kitBase + pkgPerKit;
    const taxPerKit = Math.ceil(taxablePerKit * GST_RATE);
    const costPerKit = taxablePerKit + taxPerKit;
    totals = {
      qty,
      unitPrice: kitBase,
      pkgPerKit,
      costPerKit,
      sub: taxablePerKit * qty,
      pkgCost: pkgPerKit * qty,
      fee: 0,
      ship: 0,
      tax: taxPerKit * qty,
      total: costPerKit * qty,
      kitGstRate: GST_RATE,
      itemsSubtotal: kitBase,
      taxablePerKit,
    };
  }

  const ship = SAMPLE_SHIP_PER_KIT * qty;
  return {
    ...totals,
    ship,
    branding: SAMPLE_BRANDING_PER_KIT * qty,
    total: totals.total + ship,
  };
}
