/**
 * Move Apparel subcategories under the child Apparel row and archive "sus".
 * Does not rewrite CatalogProduct strings. Safe to re-run.
 *
 * Usage:
 *   node src/scripts/reparent-apparel-categories.js
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import { reparentApparelUnderChild } from '../seed/catalogCategories.js';

async function main() {
  await connectDb();
  const result = await reparentApparelUnderChild();
  logger.info(result, 'Apparel categories reparented');
  await disconnectDb();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
