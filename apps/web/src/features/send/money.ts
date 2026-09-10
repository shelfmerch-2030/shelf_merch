/** Premium packaging charge per recipient (INR). */
export const PREMIUM_BOX_PER_RECIP = 49;
/** Sample / curated wrapping charge per kit (INR). */
export const SAMPLE_WRAP_PER_KIT = 35;
/** @deprecated Prefer SAMPLE_WRAP_PER_KIT — curated sample wrapping. */
export const SAMPLE_PRECURATED_BOX_PER_KIT = SAMPLE_WRAP_PER_KIT;
/** Sample shipping charged per kit (INR). */
export const SAMPLE_SHIP_PER_KIT = 50;
/** Sample branding is always free. */
export const SAMPLE_BRANDING_PER_KIT = 0;
const SERVICE_FEE_RATE = 0.12;
const SHIP_PER_RECIP = 120;
const GST_RATE = 0.18;

export type KitSendTotals = {
  qty: number;
  /** Sum of product basePriceInr (one kit), before GST. */
  unitPrice: number;
  /** Packaging per kit (₹49 premium box or 0). */
  pkgPerKit: number;
  /** Products + packaging + 18% GST — the charged price per kit. */
  costPerKit: number;
  /** Same as total: costPerKit × recipients (GST already in costPerKit). */
  sub: number;
  /** @deprecated Included in costPerKit/sub — kept for compatibility. */
  pkgCost: number;
  /** @deprecated Not charged in checkout summary. */
  fee: number;
  /** @deprecated Shown as free in checkout summary. */
  ship: number;
  /** GST portion embedded in the inclusive kit price (not added separately). */
  tax: number;
  total: number;
  /** Customised kits only — see CustomisedKitSendTotals. */
  itemsSubtotal?: number;
  kitGstRate?: number;
  taxablePerKit?: number;
};

/** Sum of catalog basePriceInr for selected kit products (qty 1 each). */
export function sumKitProductPrices(
  products: Array<{ basePriceInr?: number | null }>,
): number {
  return products.reduce((sum, p) => sum + Math.round(Number(p.basePriceInr) || 0), 0);
}

/**
 * Curated kit checkout — approxValueInr is GST-inclusive (18%).
 * Base = inclusive / 1.18; packaging is ex-GST; GST applied on (base + packaging).
 */
export function curatedKitSendTotals(
  recipientCount: number,
  pricePerKitInr: number,
  packaging: "none" | "box" = "none",
): KitSendTotals {
  const qty = Math.max(0, recipientCount);
  const kitIncl = Math.max(0, Math.round(pricePerKitInr));
  const kitBase = kitIncl > 0 ? Math.round(kitIncl / (1 + GST_RATE)) : 0;
  const pkgPerKit = packaging === "box" ? PREMIUM_BOX_PER_RECIP : 0;
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
 * Money math for a kit send (legacy path — unit price treated as ex-GST).
 * Prefer curatedKitSendTotals when price is GST-inclusive approxValueInr.
 */
export function kitSendTotals(
  recipientCount: number,
  packaging: "none" | "box",
  kitUnitPriceInr: number,
): KitSendTotals {
  const qty = Math.max(0, recipientCount);
  const unitPrice = Math.max(0, Math.round(kitUnitPriceInr));
  const pkgPerKit = packaging === "box" ? PREMIUM_BOX_PER_RECIP : 0;
  const costPerKitExGst = unitPrice + pkgPerKit;
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

type PricedCatalogProduct = {
  basePriceInr?: number | null;
  category?: string | null;
};

/** Product GST rate from catalog category. Apparel = 5%, everything else = 18%. */
export function productGstRate(category?: string | null): number {
  return String(category || "").trim().toLowerCase() === "apparel" ? 0.05 : 0.18;
}

/**
 * Derive GST-exclusive net price from GST-inclusive basePriceInr.
 * Base Price = Inclusive Price / (1 + GST Rate)
 */
export function netPriceExGst(
  basePriceInr: number,
  category?: string | null,
): number {
  const inclusive = Math.max(0, Number(basePriceInr) || 0);
  if (!inclusive) return 0;
  const rate = productGstRate(category);
  return Math.round(inclusive / (1 + rate));
}

/** Sum of net (ex-GST) product prices for one customised kit. */
export function sumCustomisedKitNetPrices(products: PricedCatalogProduct[]): number {
  return products.reduce(
    (sum, p) => sum + netPriceExGst(Number(p.basePriceInr) || 0, p.category),
    0,
  );
}

/**
 * Kit-level GST for customised kits:
 * 5% only when every product is Apparel; otherwise 18%.
 */
export function customisedKitGstRate(products: PricedCatalogProduct[]): number {
  if (!products.length) return GST_RATE;
  return products.every((p) => productGstRate(p.category) === 0.05) ? 0.05 : GST_RATE;
}

export type CustomisedKitSendTotals = KitSendTotals & {
  /** Net product prices (ex-GST), one kit. */
  itemsSubtotal: number;
  /** Kit GST rate applied to (items + packaging): 0.05 or 0.18. */
  kitGstRate: number;
  /** Items + packaging per kit (taxable base before kit GST). */
  taxablePerKit: number;
};

/**
 * Customised Kit checkout math only.
 * basePriceInr is GST-inclusive; strip product GST by category, add packaging,
 * then apply kit GST on (items + packaging).
 */
export function customisedKitSendTotals(
  recipientCount: number,
  packaging: "none" | "box",
  products: PricedCatalogProduct[],
): CustomisedKitSendTotals {
  const qty = Math.max(0, recipientCount);
  const itemsSubtotal = sumCustomisedKitNetPrices(products);
  const pkgPerKit = packaging === "box" ? PREMIUM_BOX_PER_RECIP : 0;
  const taxablePerKit = itemsSubtotal + pkgPerKit;
  const kitGstRate = customisedKitGstRate(products);
  const taxPerKit = Math.ceil(taxablePerKit * kitGstRate);
  const costPerKit = taxablePerKit + taxPerKit;
  const total = costPerKit * qty;
  const tax = taxPerKit * qty;
  return {
    qty,
    unitPrice: itemsSubtotal,
    pkgPerKit,
    costPerKit,
    sub: taxablePerKit * qty,
    pkgCost: pkgPerKit * qty,
    fee: 0,
    ship: 0,
    tax,
    total,
    itemsSubtotal,
    kitGstRate,
    taxablePerKit,
  };
}

export type SampleKitKind = "pre-designed" | "customised";

export type SampleKitSendTotals = KitSendTotals & {
  branding: number;
};

export type SamplePackaging = "none" | "box" | "wrap";

function normalizeSamplePackaging(packaging: string | undefined): SamplePackaging {
  if (packaging === "wrap" || packaging === "box") return packaging;
  return "none";
}

/**
 * Sample-order totals: reuse kit GST math, then add ₹50 shipping.
 * Wrapping is ₹35; customised packaging (box) reuses ₹49.
 * Branding is always ₹0 and is not taxed.
 */
export function sampleKitSendTotals(opts: {
  kind: SampleKitKind;
  packaging: SamplePackaging;
  pricePerKitInr?: number;
  products?: PricedCatalogProduct[];
  recipientCount?: number;
}): SampleKitSendTotals {
  const qty = Math.max(1, Math.round(Number(opts.recipientCount) || 1));
  const pkg = normalizeSamplePackaging(opts.packaging);

  let totals: KitSendTotals;
  if (opts.kind === "customised") {
    if (pkg === "wrap") {
      const base = customisedKitSendTotals(qty, "none", opts.products || []);
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
      totals = customisedKitSendTotals(qty, pkg === "box" ? "box" : "none", opts.products || []);
    }
  } else {
    const kitIncl = Math.max(0, Math.round(Number(opts.pricePerKitInr) || 0));
    const kitBase = kitIncl > 0 ? Math.round(kitIncl / (1 + GST_RATE)) : 0;
    // Curated samples use wrapping (₹35). Legacy "box" maps to the same charge.
    const pkgPerKit = pkg === "wrap" || pkg === "box" ? SAMPLE_WRAP_PER_KIT : 0;
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

import { POINTS_PER_RUPEE } from "@/lib/storeCurrency";
const POINTS_SERVICE_FEE_RATE = 0.15;

export type PointsSendTotals = {
  pointsPerRecipient: number;
  totalPoints: number;
  sub: number;
  fee: number;
  tax: number;
  total: number;
};

/**
 * Money math for a points send: budget per recipient (INR) → points at ₹1 = 2 Pts,
 * 15% service fee, 18% GST.
 */
export function pointsSendTotals(
  budgetPerRecipient: number,
  recipientCount: number,
): PointsSendTotals {
  const sub = budgetPerRecipient * recipientCount;
  const fee = sub * POINTS_SERVICE_FEE_RATE;
  const tax = (sub + fee) * GST_RATE;
  const total = sub + fee + tax;
  const pointsPerRecipient = budgetPerRecipient * POINTS_PER_RUPEE;
  return {
    pointsPerRecipient,
    totalPoints: pointsPerRecipient * recipientCount,
    sub,
    fee,
    tax,
    total,
  };
}

/** @deprecated Use POINTS_PER_RUPEE from storeCurrency — ₹1 = 2 points. */
export const POINT_VALUE = POINTS_PER_RUPEE;
