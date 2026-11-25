/**
 * Backfill order amountBreakdown.total from invoice grand total (ceil).
 * Usage:
 *   node src/scripts/sync-order-totals-from-invoice.js [--dry-run] [--orderNumber SM-2026-000007]
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import { Order } from '../modules/orders/order.model.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { Kit } from '../modules/kits/kit.model.js';
import { loadActiveKitEntriesForInvoice } from '../modules/orderInvoices/orderInvoice.kit.js';
import { buildOrderInvoiceLines } from '../modules/orderInvoices/orderInvoice.lines.js';
import { computeInvoiceTotals } from '../modules/orderInvoices/orderInvoice.pdf.js';

const dryRun = process.argv.includes('--dry-run');
const orderNumberArg = (() => {
  const idx = process.argv.indexOf('--orderNumber');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

async function loadKitContext(campaign, tenantId) {
  if (campaign.type !== 'kit' || !campaign.kitId) return { kit: null, kitEntries: [] };
  const kit = await Kit.findOne({ _id: campaign.kitId, tenantId }).lean();
  if (!kit) return { kit: null, kitEntries: [] };
  const kitEntries = await loadActiveKitEntriesForInvoice(kit);
  return { kit, kitEntries };
}

async function main() {
  await connectDb();

  // External (client-store) orders have no campaign — never look one up by an undefined id.
  const filter = { campaignId: { $ne: null } };
  if (orderNumberArg) filter.orderNumber = orderNumberArg;

  const orders = await Order.find(filter).setOptions({ skipTenantGuard: true }).lean();
  logger.info({ count: orders.length, dryRun, orderNumber: orderNumberArg || 'all' }, 'Syncing order totals from invoice math');

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const campaign = await Campaign.findOne({ _id: order.campaignId, tenantId: order.tenantId })
        .setOptions({ skipTenantGuard: true })
        .lean();
      if (!campaign) {
        logger.warn({ orderNumber: order.orderNumber }, 'campaign missing — skip');
        failed += 1;
        continue;
      }

      const { kit, kitEntries } = await loadKitContext(campaign, order.tenantId);
      const lines = await buildOrderInvoiceLines({ order, campaign, kit, kitEntries });
      const { grandTotal } = computeInvoiceTotals(lines);
      const current = Number(order.amountBreakdown?.total) || 0;

      if (current === grandTotal) {
        unchanged += 1;
        continue;
      }

      logger.info(
        { orderNumber: order.orderNumber, from: current, to: grandTotal },
        dryRun ? 'would update amountBreakdown.total' : 'updating amountBreakdown.total',
      );

      if (!dryRun) {
        await Order.updateOne(
          { _id: order._id, tenantId: order.tenantId },
          { $set: { 'amountBreakdown.total': grandTotal } },
        ).setOptions({ skipTenantGuard: true });
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      logger.error({ orderNumber: order.orderNumber, err: err.message }, 'failed to sync order total');
    }
  }

  logger.info({ updated, unchanged, failed, dryRun }, 'Order total sync complete');
  await disconnectDb();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
