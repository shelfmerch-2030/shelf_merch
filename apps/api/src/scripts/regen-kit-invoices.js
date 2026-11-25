/**
 * Force-regenerate kit order invoices (single kit line + packaging) and sync totals.
 * Usage:
 *   node src/scripts/regen-kit-invoices.js [--dry-run] [--orderNumber SM-2026-000007]
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import { Order } from '../modules/orders/order.model.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { generateAndStoreOrderInvoice } from '../modules/orderInvoices/orderInvoice.service.js';

const dryRun = process.argv.includes('--dry-run');
const orderNumberArg = (() => {
  const idx = process.argv.indexOf('--orderNumber');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

async function main() {
  await connectDb();

  // External (client-store) orders have no campaign — never look one up by an undefined id.
  const filter = { campaignId: { $ne: null } };
  if (orderNumberArg) filter.orderNumber = orderNumberArg;

  const orders = await Order.find(filter).setOptions({ skipTenantGuard: true });
  let regenerated = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const campaign = await Campaign.findOne({ _id: order.campaignId, tenantId: order.tenantId })
        .setOptions({ skipTenantGuard: true })
        .lean();
      if (!campaign || campaign.type !== 'kit') {
        skipped += 1;
        continue;
      }

      logger.info(
        { orderNumber: order.orderNumber, currentTotal: order.amountBreakdown?.total },
        dryRun ? 'would regenerate kit invoice' : 'regenerating kit invoice',
      );

      if (!dryRun) {
        const invoice = await generateAndStoreOrderInvoice(order, {
          force: true,
          skipEmail: true,
        });
        const refreshed = await Order.findOne({ _id: order._id, tenantId: order.tenantId })
          .setOptions({ skipTenantGuard: true })
          .select('amountBreakdown.total')
          .lean();
        logger.info(
          {
            orderNumber: order.orderNumber,
            invoiceNumber: invoice?.invoiceNumber,
            newTotal: refreshed?.amountBreakdown?.total,
          },
          'kit invoice regenerated',
        );
      }
      regenerated += 1;
    } catch (err) {
      failed += 1;
      logger.error({ orderNumber: order.orderNumber, err: err.message }, 'failed to regenerate invoice');
    }
  }

  logger.info({ regenerated, skipped, failed, dryRun }, 'Kit invoice regen complete');
  await disconnectDb();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
