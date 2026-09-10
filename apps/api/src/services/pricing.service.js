/**
 * §4 pricing.service — service fee + GST (+ kit packaging/shipping).
 * Kit send math must stay in sync with apps/web money.ts via kitPricing.
 */
import {
  curatedKitSendTotals,
  customisedKitSendTotals,
  kitSendTotals,
  sampleKitSendTotals,
} from '../modules/kits/kitPricing.js';

export const SERVICE_FEE_RATE = 0.12;
export const GST_RATE = 0.18;

const round2 = (n) => Math.round(n * 100) / 100;

/** Match invoice grand-total: ceil to the next rupee when any paise remain. */
export function ceilRupee(n) {
  const paise = Math.round(Number(n) * 100);
  return Math.ceil(paise / 100);
}

function breakdownFromTotals(t) {
  return {
    subtotal: round2(t.sub),
    packaging: round2(t.pkgCost),
    shipping: round2(t.ship),
    serviceFee: round2(t.fee),
    gst: round2(t.tax),
    total: ceilRupee(t.total),
  };
}

/**
 * Points / storefront cart: catalog prices are GST-inclusive.
 * Do not add service fee or GST again — subtotal is the payable total.
 */
export function computeAmountBreakdown(items) {
  const subtotal = round2(items.reduce((sum, i) => sum + i.unitPriceInr * i.qty, 0));
  return { subtotal, packaging: 0, shipping: 0, serviceFee: 0, gst: 0, total: subtotal };
}

/**
 * Kit checkout breakdown for `recipientCount` kits.
 * `kitUnitPriceInr` is GST-inclusive (curated approxValue / catalog sum).
 * Base = inclusive / (1 + GST); packaging ex-GST; GST on (base + packaging).
 */
export function computeKitSendAmountBreakdown(kitUnitPriceInr, packaging = 'none', recipientCount = 1) {
  const t = curatedKitSendTotals(
    recipientCount,
    Math.round(Number(kitUnitPriceInr) || 0),
    packaging === 'box' ? 'box' : 'none',
  );
  return breakdownFromTotals(t);
}

/**
 * Amount stored on a kit fulfillment order.
 * Prefer campaign.totalBudget (wallet debit) as the payable total so Order History
 * always matches Checkout / Wallet.
 *
 * @param {object} campaign
 * @param {{
 *   kitUnitPriceInr?: number,
 *   packaging?: 'none'|'box',
 *   orderKitCount?: number,
 *   products?: Array<{ basePriceInr?: number, category?: string }>,
 *   gstInclusive?: boolean,
 * }} opts
 *   orderKitCount — kits represented by this order (1 for per-recipient surprise/redeem;
 *   recipientCount for single-location).
 *   products — when set, uses customised kit math (per-category GST strip).
 */
export function amountBreakdownForKitCampaign(campaign, opts = {}) {
  const campaignRecipients = Math.max(1, Number(campaign?.recipientCount) || 1);
  const orderKitCount = Math.max(1, Number(opts.orderKitCount) || 1);
  const pkg =
    opts.packaging === 'box' || opts.packaging === 'none' || opts.packaging === 'wrap'
      ? opts.packaging
      : campaign?.packaging === 'box' || campaign?.packaging === 'wrap'
        ? campaign.packaging
        : 'none';
  const unitPrice = Math.round(Number(opts.kitUnitPriceInr) || 0);

  let breakdown;
  if (campaign?.isSample) {
    const kind = Array.isArray(opts.products) && opts.products.length ? 'customised' : 'pre-designed';
    breakdown = breakdownFromTotals(
      sampleKitSendTotals({
        kind,
        packaging: pkg,
        pricePerKitInr: unitPrice,
        products: opts.products,
        recipientCount: orderKitCount,
      }),
    );
  } else if (Array.isArray(opts.products) && opts.products.length) {
    breakdown = breakdownFromTotals(
      customisedKitSendTotals(orderKitCount, pkg === 'box' ? 'box' : 'none', opts.products),
    );
  } else if (opts.gstInclusive === false) {
    breakdown = breakdownFromTotals(
      kitSendTotals(orderKitCount, pkg === 'box' ? 'box' : 'none', unitPrice),
    );
  } else {
    breakdown = computeKitSendAmountBreakdown(unitPrice, pkg, orderKitCount);
  }

  const paid = Math.round(Number(campaign?.totalBudget) || 0);
  if (paid > 0) {
    if (orderKitCount >= campaignRecipients) {
      // Order covers the whole campaign (single-location or 1 recipient).
      breakdown.total = paid;
    } else if (orderKitCount === 1) {
      // Per-recipient order: equal share of the charged grand total (invoice-style ceil).
      breakdown.total = ceilRupee(paid / campaignRecipients);
    }
  }

  return breakdown;
}
