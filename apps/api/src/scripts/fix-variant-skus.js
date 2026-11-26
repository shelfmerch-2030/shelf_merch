/**
 * Give every catalog variant its own SKU, so clients of the public Catalog/Orders API can order a variant
 * by SKU alone. A variant is renamed when its SKU is empty, equals its product's SKU, or is used by
 * another product. New SKU: <product SKU>-<colour code>-<size>, e.g. APRN-1007-MNAV-L.
 *
 * Safe for existing data: orders keep their snapshot, SKU mappings point at product ids, and the old
 * product SKU still resolves (with size/colour). Shopify-imported products are skipped — re-import matches
 * their variants by SKU.
 *
 * Usage:
 *   node src/scripts/fix-variant-skus.js            # dry run (default): prints the plan, writes nothing
 *   node src/scripts/fix-variant-skus.js --apply    # writes
 *   node src/scripts/fix-variant-skus.js --limit 50 # only show/apply the first 50 products
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { CatalogProduct } from '../modules/catalog/catalogProduct.model.js';

const apply = process.argv.includes('--apply');
const limitArg = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Number(process.argv[i + 1]) || null : null;
})();

const clean = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** "Midnight Navy" → MNAV, "Heather red" → HRED, "Black" → BLAC, "" → '' */
export function colorCode(color) {
  const words = clean(color).split(' ').filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 4);
  return words.slice(0, -1).map((w) => w[0]).join('') + words[words.length - 1].slice(0, 3);
}

/** "2XL" → 2XL, "Extra Large" → EXTRALARGE (kept readable; size spellings vary) */
export function sizeCode(size) {
  return clean(size).replace(/ /g, '').slice(0, 10);
}

/** Pure planner (exported for tests): products → [{ productId, productSku, variantId, from, to }] */
export function planVariantSkus(products) {
  const count = new Map();
  const bump = (s) => s && count.set(s, (count.get(s) ?? 0) + 1);
  for (const p of products) {
    bump(p.sku);
    for (const v of p.variants ?? []) if (v.sku !== p.sku) bump(v.sku);
  }
  const used = new Set(count.keys());
  const firstOwner = new Map(); // a SKU shared across products stays with the first product
  const changes = [];

  for (const p of products) {
    if (p.source?.provider === 'shopify') continue;
    const variants = p.variants ?? [];
    variants.forEach((v, i) => {
      const sku = String(v.sku ?? '').trim();
      let needs = !sku || sku === p.sku;
      if (!needs && count.get(sku) > 1) {
        const owner = firstOwner.get(sku);
        if (owner === undefined) firstOwner.set(sku, String(p._id));
        else if (owner !== String(p._id)) needs = true;
        // duplicate within the same product
        if (!needs && variants.findIndex((x) => x.sku === sku) !== i) needs = true;
      }
      if (!needs) return;
      const parts = [p.sku, colorCode(v.color), sizeCode(v.size)].filter(Boolean);
      let base = parts.length > 1 ? parts.join('-') : `${p.sku}-V${i + 1}`;
      let candidate = base;
      for (let n = 2; used.has(candidate); n += 1) candidate = `${base}-${n}`;
      used.add(candidate);
      changes.push({ productId: p._id, productSku: p.sku, variantId: v._id, size: v.size ?? '', color: v.color ?? '', from: sku, to: candidate });
    });
  }
  return changes;
}

async function main() {
  await connectDb();
  const products = await CatalogProduct.find({})
    .select('sku name status source.provider variants._id variants.sku variants.size variants.color createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const skippedShopify = products.filter((p) => p.source?.provider === 'shopify').length;
  let changes = planVariantSkus(products);
  if (limitArg) {
    const keep = new Set([...new Set(changes.map((c) => String(c.productId)))].slice(0, limitArg));
    changes = changes.filter((c) => keep.has(String(c.productId)));
  }
  const productCount = new Set(changes.map((c) => String(c.productId))).size;

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${products.length} products scanned, ${skippedShopify} Shopify-imported skipped`);
  console.log(`${changes.length} variants in ${productCount} products get a new SKU`);
  for (const c of changes.slice(0, 40)) {
    console.log(`  ${c.productSku.padEnd(16)} ${`${c.size} / ${c.color}`.padEnd(26)} ${String(c.from || '(empty)').padEnd(18)} → ${c.to}`);
  }
  if (changes.length > 40) console.log(`  … and ${changes.length - 40} more`);

  if (apply && changes.length) {
    const ops = changes.map((c) => ({
      updateOne: {
        filter: { _id: c.productId },
        update: { $set: { 'variants.$[v].sku': c.to } },
        arrayFilters: [{ 'v._id': c.variantId }],
      },
    }));
    let written = 0;
    for (let i = 0; i < ops.length; i += 500) {
      const r = await CatalogProduct.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      written += r.modifiedCount;
      console.log(`  wrote ${written}/${ops.length}`);
    }
  } else if (!apply) {
    console.log('Nothing written. Re-run with --apply to write.');
  }
  await disconnectDb();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch(async (err) => {
    console.error(err);
    await disconnectDb().catch(() => {});
    process.exit(1);
  });
}
