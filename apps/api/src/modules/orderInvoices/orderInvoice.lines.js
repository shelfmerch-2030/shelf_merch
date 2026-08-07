import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import {
  customisedKitGstRate,
  sumCustomisedKitNetPrices,
  sumKitProductPrices,
} from '../kits/kitPricing.js';
import {
  isCuratedKitMeta,
  parseCuratedKitMeta,
  resolveCuratedApproxValueInr,
} from '../kits/curatedKitMeta.js';
import {
  gstProfileForCategory,
  lineTaxAmounts,
  priceWithoutGst,
  formatHsn,
} from './orderInvoice.pricing.js';


async function catalogMetaByProductId(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const rows = await CatalogProduct.find({ _id: { $in: unique } })
    .select('category hsnCode')
    .lean();
  return new Map(
    rows.map((r) => [
      String(r._id),
      { category: r.category || '', hsnCode: String(r.hsnCode || '').trim() },
    ]),
  );
}

function mergeItemsByName(items = []) {
  const map = new Map();
  for (const item of items) {
    const name = String(item.name || 'Item').trim();
    const key = name.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      prev.qty += Number(item.qty) || 0;
    } else {
      map.set(key, {
        name,
        qty: Number(item.qty) || 0,
        unitPriceInr: Number(item.unitPriceInr) || 0,
        catalogProductId: item.catalogProductId,
        hsnCode: item.hsnCode || '',
      });
    }
  }
  return [...map.values()];
}

function kitQuantity(order, campaign) {
  if (campaign.fulfillmentMode === 'single') {
    return Math.max(1, Number(campaign.recipientCount) || 1);
  }
  return 1;
}

function kitUnitPriceInclGst(order, campaign, kitEntries) {
  if (kitEntries?.length) {
    return Math.round(sumKitProductPrices(kitEntries.map((e) => e.product)));
  }
  const itemsSubtotal = (order.items || []).reduce(
    (sum, i) => sum + Number(i.unitPriceInr || 0) * Number(i.qty || 0),
    0,
  );
  const qty = kitQuantity(order, campaign);
  return qty > 0 ? Math.round(itemsSubtotal / qty) : itemsSubtotal;
}

/**
 * Ex-GST kit unit rate + GST profile for a kit campaign invoice line.
 * Customised kits: net product sum (same as checkout), never per-product lines.
 * Curated kits: always platformkits.approxValueInr (GST-inclusive), never catalog refs.
 */
async function kitInvoiceUnit(order, campaign, kit, kitEntries, qty) {
  const name = kit?.name || campaign?.name || order.items?.[0]?.name || 'Kit';
  const curatedMeta = parseCuratedKitMeta(kit?.designNotes);

  // Curated must use live platform approxValueInr — ignore leftover productRefs.
  if (isCuratedKitMeta(curatedMeta)) {
    const unitIncl = await resolveCuratedApproxValueInr(kit, curatedMeta);
    const frozenIncl = Math.round(Number(order.items?.[0]?.unitPriceInr) || 0);
    const inclusive = unitIncl > 0 ? unitIncl : frozenIncl;
    return {
      name: order.items?.[0]?.name || name,
      rate: priceWithoutGst(inclusive, 'kit'),
      profile: 'kit',
    };
  }

  if (kitEntries.length > 0) {
    const products = kitEntries.map((e) => e.product);
    const rate = sumCustomisedKitNetPrices(products);
    const profile = customisedKitGstRate(products) <= 0.05 ? 'apparel' : 'kit';
    return { name, rate, profile };
  }

  // Non-curated fallback when refs are missing: order items store GST-inclusive kit price.
  if (Array.isArray(order.items) && order.items.length > 0) {
    const hasCatalogLines = order.items.some((i) => i.catalogProductId);
    if (hasCatalogLines) {
      const catalogMeta = await catalogMetaByProductId(order.items.map((i) => i.catalogProductId));
      let totalNet = 0;
      const products = [];
      for (const item of order.items) {
        const meta = catalogMeta.get(String(item.catalogProductId)) || {};
        const category = meta.category || '';
        products.push({ basePriceInr: item.unitPriceInr, category });
        const profile = gstProfileForCategory(category);
        totalNet += priceWithoutGst(item.unitPriceInr, profile) * (Number(item.qty) || 0);
      }
      const rate = qty > 0 ? Math.round(totalNet / qty) : totalNet;
      const profile = customisedKitGstRate(products) <= 0.05 ? 'apparel' : 'kit';
      return { name, rate, profile };
    }

    const unitIncl = kitUnitPriceInclGst(order, campaign, []);
    return {
      name: order.items[0]?.name || name,
      rate: priceWithoutGst(unitIncl, 'kit'),
      profile: 'kit',
    };
  }

  const unitIncl = Math.round(Number(kit?.kitPrice) || 0);
  return { name, rate: priceWithoutGst(unitIncl, 'kit'), profile: 'kit' };
}

/**
 * Build invoice line items for PDF + tax summary.
 * Kit campaigns (curated + customised): one kit line + optional packaging — same as checkout.
 * Non-kit orders: per-product lines.
 * @returns {Promise<Array<{name, hsn, qty, rate, amount, profile}>>}
 */
export async function buildOrderInvoiceLines({ order, campaign, kit, kitEntries = [] }) {
  // Kit campaigns store packaging as ex-GST (PREMIUM_BOX_PER_RECIP × qty).
  const packagingExGst = Math.round(Number(order.amountBreakdown?.packaging) || 0);
  const lines = [];
  const isKitOrder = campaign?.type === 'kit' && Boolean(campaign?.kitId);

  if (isKitOrder) {
    const qty = kitQuantity(order, campaign);
    const { name, rate, profile } = await kitInvoiceUnit(order, campaign, kit, kitEntries, qty);
    lines.push({
      name,
      hsn: '',
      qty,
      rate,
      amount: rate * qty,
      profile,
    });
  } else {
    const merged = mergeItemsByName(order.items || []);
    const catalogMeta = await catalogMetaByProductId(merged.map((m) => m.catalogProductId));
    for (const item of merged) {
      const meta = catalogMeta.get(String(item.catalogProductId)) || {};
      const category = meta.category || '';
      const profile = gstProfileForCategory(category);
      const rate = priceWithoutGst(item.unitPriceInr, profile);
      lines.push({
        name: item.name,
        hsn: String(item.hsnCode || meta.hsnCode || '').trim(),
        qty: item.qty,
        rate,
        amount: rate * item.qty,
        profile,
      });
    }
  }

  // Packaging as its own line (ex-GST ₹49/kit). Taxed at 18% (CGST 9% + SGST 9%).
  if (packagingExGst > 0) {
    const pkgQty = isKitOrder ? kitQuantity(order, campaign) : 1;
    const pkgRate = pkgQty > 0 ? Math.round(packagingExGst / pkgQty) : packagingExGst;
    lines.push({
      name: 'Packaging',
      hsn: '',
      qty: pkgQty,
      rate: pkgRate,
      amount: pkgRate * pkgQty,
      profile: 'packaging',
    });
  }

  return lines;
}

export function aggregateGstRows(lines) {
  const buckets = new Map();
  for (const line of lines) {
    const key = `${line.hsn}|${line.profile}`;
    const prev = buckets.get(key) || {
      hsn: line.hsn,
      profile: line.profile,
      taxable: 0,
    };
    prev.taxable += line.amount;
    buckets.set(key, prev);
  }
  return [...buckets.values()];
}

/**
 * Body GST rows under the items table.
 * Packaging CGST/SGST are kept separate from product/kit GST so each
 * appears as its own CGST @9% / SGST @9% pair.
 */
export function summarizeBodyGst(lines) {
  const totals = {
    cgst25: 0,
    sgst25: 0,
    cgst9: 0,
    sgst9: 0,
    packagingCgst9: 0,
    packagingSgst9: 0,
  };
  for (const line of lines) {
    const taxable = line.amount;
    if (line.profile === 'apparel') {
      totals.cgst25 += taxable * 0.025;
      totals.sgst25 += taxable * 0.025;
    } else if (line.profile === 'packaging') {
      totals.packagingCgst9 += taxable * 0.09;
      totals.packagingSgst9 += taxable * 0.09;
    } else {
      totals.cgst9 += taxable * 0.09;
      totals.sgst9 += taxable * 0.09;
    }
  }
  return {
    cgst25: Math.round(totals.cgst25 * 100) / 100,
    sgst25: Math.round(totals.sgst25 * 100) / 100,
    cgst9: Math.round(totals.cgst9 * 100) / 100,
    sgst9: Math.round(totals.sgst9 * 100) / 100,
    packagingCgst9: Math.round(totals.packagingCgst9 * 100) / 100,
    packagingSgst9: Math.round(totals.packagingSgst9 * 100) / 100,
  };
}

export function buildHsnSummary(lines) {
  const groups = aggregateGstRows(lines);
  return groups.map((g) => {
    const tax = lineTaxAmounts(g.taxable, g.profile);
    return {
      hsn: g.profile === 'packaging' ? 'Packaging' : formatHsn(g.hsn),
      taxable: g.taxable,
      cgstRate: tax.cgstRate,
      cgstAmt: tax.cgstAmt,
      sgstRate: tax.sgstRate,
      sgstAmt: tax.sgstAmt,
      totalTax: tax.totalTax,
    };
  });
}
