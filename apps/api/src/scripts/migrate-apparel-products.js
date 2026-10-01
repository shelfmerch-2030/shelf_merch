/**
 * Move the 19 Apparel products onto the 3-level labels.
 * Does not touch other categories. Safe to re-run.
 *
 * Usage:
 *   node src/scripts/migrate-apparel-products.js
 *   node src/scripts/migrate-apparel-products.js --rollback
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import { migrateApparelProductLabels, rollbackApparelProductLabels } from '../seed/catalogCategories.js';

async function main() {
  await connectDb();
  if (process.argv.includes('--rollback')) {
    const result = await rollbackApparelProductLabels();
    logger.info(result, 'Apparel product labels rolled back');
  } else {
    const result = await migrateApparelProductLabels();
    logger.info(result, 'Apparel product labels migrated');
  }
  await disconnectDb();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
