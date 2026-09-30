/**
 * Align catalog categories with the business tree and rewrite product strings
 * that still use a former parent name. Safe to re-run. Does not delete rows.
 *
 * Usage:
 *   node src/scripts/seed-catalog-categories.js
 *   node src/scripts/seed-catalog-categories.js --rollback
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import {
  ensureCatalogCategories,
  recordParentMoves,
  remapCatalogProductCategories,
  rollbackCatalogHierarchy,
  archiveLegacyCatalogCategories,
  moveLifestyleAccessoryDraftsToOthers,
} from '../seed/catalogCategories.js';

async function main() {
  await connectDb();
  if (process.argv.includes('--rollback')) {
    const result = await rollbackCatalogHierarchy();
    logger.info(result, 'Catalog hierarchy rolled back');
  } else {
    const categories = await ensureCatalogCategories();
    await recordParentMoves(categories.parentMoves);
    const products = await remapCatalogProductCategories();
    const archived = await archiveLegacyCatalogCategories();
    const drafts = await moveLifestyleAccessoryDraftsToOthers();
    logger.info(
      {
        created: categories.created,
        existing: categories.existing,
        moved: categories.moved,
        productsUpdated: products.productsUpdated,
        archived: archived.archived,
        archivedNames: archived.archivedNames,
        skipped: archived.skipped,
        draftsUpdated: drafts.draftsUpdated,
      },
      'Catalog categories ready',
    );
  }
  await disconnectDb();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
