/**
 * Canonical catalog taxonomy. Names match the strings already stored on
 * CatalogProduct.category / subcategory / childCategory.
 *
 * Level 0 = Parent Category, level 1 = Category, level 2 = Sub-Category.
 * Kits stays Parent → Category only (no Sub-Categories).
 * Kits is included so existing "Kits" product strings and /category/kits keep resolving.
 */
import mongoose from 'mongoose';
import { Category } from '../modules/catalog/category.model.js';
import { CatalogProduct } from '../modules/catalog/catalogProduct.model.js';
import { updateCategory } from '../modules/catalog/platformCatalog.service.js';

/** Former top-level categories that stay in the database and sit under Accessories. */
export const MOVED_UNDER_ACCESSORIES = ['Bags', 'Drinkware', 'Office Supplies', 'Technology'];

/**
 * Products still stored under an old parent name.
 * The old category string becomes the Accessories Category, except Technology
 * and Office Supplies, which use the business Category names.
 */
export const PRODUCT_CATEGORY_REMAP = {
  Drinkware: { category: 'Accessories', subcategory: 'Drinkware' },
  Bags: { category: 'Accessories', subcategory: 'Bags' },
  Technology: { category: 'Accessories', subcategory: 'Electronics & Gadgets' },
  'Office Supplies': { category: 'Accessories', subcategory: 'Stationery' },
};

/**
 * Parent Category → Category → Sub-Category.
 * String children are Categories with no Sub-Categories.
 * Object children may nest Sub-Category name arrays.
 */
export const CATALOG_CATEGORY_TREE = [
  {
    name: 'Apparel',
    children: [
      {
        name: 'Apparel',
        children: ['T-Shirts', 'Polo Shirts', 'Hoodies & Sweatshirts', 'Jackets', 'Caps', 'Others'],
      },
    ],
  },
  {
    name: 'Accessories',
    children: [
      {
        name: 'Stationery',
        children: [
          'Diaries',
          'Pens & Pencils',
          'Card Holders',
          'ID Cards',
          'Notepads',
          'Desk Organisers',
        ],
      },
      { name: 'Drinkware', children: ['Mugs', 'Tumblers', 'Bottles'] },
      { name: 'Bags', children: ['Totes', 'Laptop Bags', 'Backpacks'] },
      'Travel Accessories',
      'Electronics & Gadgets',
      'Others',
    ],
  },
  {
    name: 'Food & Beverage',
    children: ['Coffee', 'Snacks', 'Chocolates'],
  },
  {
    name: 'Kits',
    children: ['Pre-designed kits', 'Customised kits'],
  },
];

/** @deprecated Prefer nested CATALOG_CATEGORY_TREE; kept for tests / scripts. */
export const CHILD_CATEGORY_TREE = Object.fromEntries(
  (CATALOG_CATEGORY_TREE.find((row) => row.name === 'Accessories')?.children ?? [])
    .filter((entry) => typeof entry === 'object' && Array.isArray(entry.children))
    .map((entry) => [entry.name, entry.children]),
);

function normalizeChildSpec(entry) {
  if (typeof entry === 'string') return { name: entry, children: [] };
  return { name: entry.name, children: entry.children ?? [] };
}

function categoryNames(children = []) {
  return children.map((entry) => normalizeChildSpec(entry).name);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function countResult(totals, result) {
  if (result.created) totals.created += 1;
  else if (result.moved) totals.moved += 1;
  else totals.existing += 1;
}

async function upsertCategory({ name, parentId, sortOrder }) {
  const existing = await Category.findOne({ parentId, name });
  if (existing) return { created: false, moved: false };
  await Category.create({
    name,
    slug: slugify(name),
    description: '',
    status: 'active',
    parentId,
    sortOrder,
  });
  return { created: true, moved: false };
}

/**
 * Re-parent an existing top-level row without changing its name or slug.
 * Does not delete the row.
 */
async function attachExistingCategory({ name, parentId, sortOrder }) {
  const alreadyChild = await Category.findOne({ parentId, name });
  if (alreadyChild) {
    if (alreadyChild.sortOrder !== sortOrder) {
      alreadyChild.sortOrder = sortOrder;
      await alreadyChild.save();
    }
    return { created: false, moved: false };
  }

  const root = await Category.findOne({ parentId: null, name });
  if (!root) return upsertCategory({ name, parentId, sortOrder });

  const previousParentId = root.parentId ?? null;
  root.parentId = parentId;
  root.sortOrder = sortOrder;
  await root.save();
  return {
    created: false,
    moved: true,
    categoryId: root._id,
    name: root.name,
    previousParentId,
  };
}

/**
 * Place a named row under parentId. When moveExisting is true, also adopts a
 * former root with the same name. When moveFromParentId is set, adopts a row
 * that currently sits under that parent (e.g. Apparel leaves under root Apparel).
 */
async function placeChild({ name, parentId, sortOrder, moveExisting, moveFromParentId }) {
  const existing = await Category.findOne({ parentId, name });
  if (existing) {
    if (existing.sortOrder !== sortOrder) {
      existing.sortOrder = sortOrder;
      await existing.save();
    }
    return { created: false, moved: false };
  }

  if (moveFromParentId) {
    const sibling = await Category.findOne({ parentId: moveFromParentId, name });
    if (sibling) {
      const previousParentId = sibling.parentId ?? null;
      sibling.parentId = parentId;
      sibling.sortOrder = sortOrder;
      await sibling.save();
      return {
        created: false,
        moved: true,
        categoryId: sibling._id,
        name: sibling.name,
        previousParentId,
      };
    }
  }

  if (moveExisting) {
    return attachExistingCategory({ name, parentId, sortOrder });
  }

  return upsertCategory({ name, parentId, sortOrder });
}

const BACKUP_COLLECTION = 'categorymigrationbackups';

function backupCollection() {
  return mongoose.connection.collection(BACKUP_COLLECTION);
}

async function rememberParentMove(parentMoves, result) {
  if (!result.moved) return;
  parentMoves.push({
    categoryId: result.categoryId,
    name: result.name,
    previousParentId: result.previousParentId ?? null,
  });
}

/**
 * Walk a nested Category / Sub-Category spec under a Parent Category row.
 */
async function ensureNestedChildren({
  parent,
  children,
  totals,
  parentMoves,
  moveExistingNames = new Set(),
  moveFromParentId = null,
}) {
  for (let j = 0; j < children.length; j += 1) {
    const spec = normalizeChildSpec(children[j]);
    const childResult = await placeChild({
      name: spec.name,
      parentId: parent._id,
      sortOrder: j,
      moveExisting: moveExistingNames.has(spec.name),
      moveFromParentId,
    });
    countResult(totals, childResult);
    await rememberParentMove(parentMoves, childResult);

    const child = await Category.findOne({ parentId: parent._id, name: spec.name });
    if (!child || !spec.children.length) continue;

    for (let k = 0; k < spec.children.length; k += 1) {
      const leafName = typeof spec.children[k] === 'string' ? spec.children[k] : spec.children[k].name;
      // Apparel leaves may still sit under the Parent; adopt them under the Category row.
      const leafMoveFrom =
        parent.name === 'Apparel' && spec.name === 'Apparel' ? parent._id : null;
      const leafResult = await placeChild({
        name: leafName,
        parentId: child._id,
        sortOrder: k,
        moveExisting: false,
        moveFromParentId: leafMoveFrom,
      });
      countResult(totals, leafResult);
      await rememberParentMove(parentMoves, leafResult);
    }
  }
}

/**
 * Insert missing rows and move Bags, Drinkware, Office Supplies, and Technology
 * under Accessories. Does not rename, delete, or rewrite product strings.
 * Kits stays a root. Re-running does not duplicate rows.
 */
export async function ensureCatalogCategories() {
  await Category.syncIndexes();
  const totals = { created: 0, existing: 0, moved: 0 };
  const parentMoves = [];
  const moveExistingNames = new Set(MOVED_UNDER_ACCESSORIES);

  for (let i = 0; i < CATALOG_CATEGORY_TREE.length; i += 1) {
    const parentSpec = CATALOG_CATEGORY_TREE[i];
    const parentResult = await upsertCategory({ name: parentSpec.name, parentId: null, sortOrder: i });
    countResult(totals, parentResult);

    const parent = await Category.findOne({ parentId: null, name: parentSpec.name });
    if (parent && parent.sortOrder !== i) {
      parent.sortOrder = i;
      await parent.save();
    }

    await ensureNestedChildren({
      parent,
      children: parentSpec.children ?? [],
      totals,
      parentMoves,
      moveExistingNames,
    });
  }

  const accessories = await Category.findOne({ parentId: null, name: 'Accessories' });
  const businessChildren = new Set(
    categoryNames(CATALOG_CATEGORY_TREE.find((row) => row.name === 'Accessories')?.children),
  );

  for (const name of MOVED_UNDER_ACCESSORIES) {
    if (businessChildren.has(name)) continue;
    const result = await attachExistingCategory({
      name,
      parentId: accessories._id,
      sortOrder: 100,
    });
    countResult(totals, result);
    await rememberParentMove(parentMoves, result);
  }

  const extras = await Category.find({
    parentId: accessories._id,
    name: { $nin: [...businessChildren] },
  }).sort({ name: 1 });
  for (let i = 0; i < extras.length; i += 1) {
    const desired = 100 + i;
    if (extras[i].sortOrder !== desired) {
      extras[i].sortOrder = desired;
      await extras[i].save();
    }
  }

  await assignCategoryDepths();

  return { ...totals, parentMoves };
}

/** Set depth from the parent chain. Roots are 0. Does not change names or product strings. */
export async function assignCategoryDepths() {
  const rows = await Category.find();
  const byId = new Map(rows.map((row) => [String(row._id), row]));

  function depthOf(row, seen = new Set()) {
    if (!row?.parentId) return 0;
    const id = String(row._id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const parent = byId.get(String(row.parentId));
    if (!parent) return 0;
    return depthOf(parent, seen) + 1;
  }

  for (const row of rows) {
    const depth = depthOf(row);
    if (row.depth !== depth) {
      row.depth = depth;
      await row.save();
    }
  }
}

async function insertBackupOnce(filter, doc) {
  const existing = await backupCollection().findOne({ ...filter, restored: { $ne: true } });
  if (existing) return;
  await backupCollection().insertOne({
    ...doc,
    restored: false,
    createdAt: new Date(),
  });
}

/** Store the parentId that was replaced, once, so rollback can put the row back. */
export async function recordParentMoves(parentMoves) {
  for (const move of parentMoves) {
    await insertBackupOnce(
      { kind: 'category-parent', categoryId: move.categoryId },
      {
        kind: 'category-parent',
        categoryId: move.categoryId,
        name: move.name,
        previousParentId: move.previousParentId ?? null,
      },
    );
  }
}

/**
 * Rewrite CatalogProduct strings that still use a former parent name.
 * Original strings are stored once. A second run updates nothing.
 */
export async function remapCatalogProductCategories() {
  let productsUpdated = 0;

  for (const [fromCategory, next] of Object.entries(PRODUCT_CATEGORY_REMAP)) {
    const products = await CatalogProduct.find({ category: fromCategory }).select(
      '_id category subcategory',
    );
    for (const product of products) {
      await insertBackupOnce(
        { kind: 'product', productId: product._id },
        {
          kind: 'product',
          productId: product._id,
          category: product.category,
          subcategory: product.subcategory ?? '',
        },
      );
      await CatalogProduct.updateOne(
        { _id: product._id },
        { $set: { category: next.category, subcategory: next.subcategory } },
      );
      productsUpdated += 1;
    }
  }

  return { productsUpdated };
}

/**
 * Put product strings and moved category parents back from unrestored backups.
 * Category rows are not deleted.
 */
export async function rollbackCatalogHierarchy() {
  const pending = await backupCollection().find({ restored: { $ne: true } }).toArray();
  let productsRestored = 0;
  let parentsRestored = 0;

  for (const row of pending) {
    if (row.kind === 'product') {
      await CatalogProduct.updateOne(
        { _id: row.productId },
        { $set: { category: row.category, subcategory: row.subcategory ?? '' } },
      );
      productsRestored += 1;
    } else if (row.kind === 'category-parent') {
      await Category.updateOne(
        { _id: row.categoryId },
        { $set: { parentId: row.previousParentId ?? null } },
      );
      parentsRestored += 1;
    }
    await backupCollection().updateOne(
      { _id: row._id },
      { $set: { restored: true, restoredAt: new Date() } },
    );
  }

  return { productsRestored, parentsRestored };
}

/** Old Accessories children / retired parents that are not in the business tree. Rows are archived, not deleted. */
export const LEGACY_CATEGORIES_TO_ARCHIVE = [
  'Technology',
  'Office Supplies',
  'Lifestyle Accessories',
  'Premium Gifts',
];

async function activeProductUses(category) {
  if (!category.parentId) {
    return CatalogProduct.countDocuments({ status: 'active', category: category.name });
  }
  const parent = await Category.findById(category.parentId).select('name').lean();
  return CatalogProduct.countDocuments({
    status: 'active',
    subcategory: category.name,
    ...(parent ? { category: parent.name } : {}),
  });
}

async function archiveCategoryAndDescendants(category, totals) {
  const children = await Category.find({ parentId: category._id, status: 'active' });
  for (const child of children) {
    await archiveCategoryAndDescendants(child, totals);
  }

  const fresh = await Category.findById(category._id);
  if (!fresh || fresh.status === 'archived') return;

  const activeChildren = await Category.countDocuments({ parentId: fresh._id, status: 'active' });
  if (activeChildren) {
    totals.skipped.push({ name: fresh.name, reason: 'active children remain' });
    return;
  }
  const used = await activeProductUses(fresh);
  if (used) {
    totals.skipped.push({ name: fresh.name, reason: `${used} active products` });
    return;
  }

  fresh.status = 'archived';
  await fresh.save();
  totals.archived.push(fresh.name);
}

/**
 * Archive leftover category rows that are not in the business tree.
 * Descendant rows are archived first so a parent is not left with active children.
 * Product strings are not changed. Key Chains, Lanyards, and Badges are left active.
 */
export async function archiveLegacyCatalogCategories() {
  const totals = { archived: [], skipped: [] };
  for (const name of LEGACY_CATEGORIES_TO_ARCHIVE) {
    const rows = await Category.find({ name, status: 'active' });
    for (const row of rows) {
      await archiveCategoryAndDescendants(row, totals);
    }
  }
  return {
    archived: totals.archived.length,
    archivedNames: totals.archived,
    skipped: totals.skipped,
  };
}

/**
 * Drafts left on the archived Lifestyle Accessories subcategory.
 * Active products are not updated.
 */
export async function moveLifestyleAccessoryDraftsToOthers() {
  const result = await CatalogProduct.updateMany(
    {
      status: 'draft',
      category: 'Accessories',
      subcategory: 'Lifestyle Accessories',
    },
    { $set: { subcategory: 'Others' } },
  );
  return { draftsUpdated: result.modifiedCount };
}

export const APPAREL_REPARENT_NAMES = [
  'T-Shirts',
  'Polo Shirts',
  'Hoodies & Sweatshirts',
  'Jackets',
  'Caps',
  'Others',
];

/**
 * Move the listed Apparel rows under the child Apparel category.
 * Writes a parent/depth/sortOrder backup first. Does not change product strings.
 * Archives the empty "sus" row when it is still an active child of root Apparel.
 */
export async function reparentApparelUnderChild() {
  const root = await Category.findOne({ name: 'Apparel', parentId: null });
  if (!root) throw new Error('Root Apparel category is missing');
  const child = await Category.findOne({ name: 'Apparel', parentId: root._id });
  if (!child) throw new Error('Child Apparel category is missing');

  const movedNames = [];
  for (const name of APPAREL_REPARENT_NAMES) {
    const row = await Category.findOne({ name, parentId: root._id });
    if (!row) continue;
    await insertBackupOnce(
      { kind: 'category-reparent', categoryId: row._id },
      {
        kind: 'category-reparent',
        categoryId: row._id,
        name: row.name,
        previousParentId: row.parentId ?? null,
        previousDepth: row.depth ?? 0,
        previousSortOrder: row.sortOrder ?? 0,
      },
    );
    await updateCategory(row._id, { parentId: child._id });
    movedNames.push(name);
  }

  const sus = await Category.findOne({ name: 'sus', parentId: root._id, status: 'active' });
  if (sus) await updateCategory(sus._id, { status: 'archived' });

  return { moved: movedNames.length, movedNames, susArchived: Boolean(sus) };
}

/** Old Apparel subcategory strings that become childCategory. Others is not included. */
export const APPAREL_PRODUCT_MIGRATION = [
  'T-Shirts',
  'Polo Shirts',
  'Hoodies & Sweatshirts',
  'Jackets',
  'Caps',
];

function emptyChildCategoryFilter() {
  return {
    $or: [{ childCategory: '' }, { childCategory: null }, { childCategory: { $exists: false } }],
  };
}

/**
 * Move Apparel / <leaf> / "" to Apparel / Apparel / <leaf>.
 * Only the listed subcategory names are updated. A second run changes nothing.
 */
export async function migrateApparelProductLabels() {
  const root = await Category.findOne({ name: 'Apparel', parentId: null, status: 'active' });
  const child = root
    ? await Category.findOne({ name: 'Apparel', parentId: root._id, status: 'active' })
    : null;
  if (!root || !child) throw new Error('Apparel subcategory row is missing');

  const byChildCategory = {};
  let productsUpdated = 0;

  for (const leafName of APPAREL_PRODUCT_MIGRATION) {
    const products = await CatalogProduct.find({
      category: 'Apparel',
      subcategory: leafName,
      ...emptyChildCategoryFilter(),
    }).select('_id category subcategory childCategory');
    if (!products.length) continue;

    const leaf = await Category.findOne({ name: leafName, parentId: child._id, status: 'active' });
    if (!leaf) throw new Error(`Apparel child category "${leafName}" is missing`);

    for (const product of products) {
      await insertBackupOnce(
        { kind: 'apparel-product', productId: product._id },
        {
          kind: 'apparel-product',
          productId: product._id,
          category: product.category,
          subcategory: product.subcategory ?? '',
          childCategory: product.childCategory ?? '',
        },
      );
      await CatalogProduct.updateOne(
        { _id: product._id },
        { $set: { category: 'Apparel', subcategory: 'Apparel', childCategory: leafName } },
      );
      productsUpdated += 1;
      byChildCategory[leafName] = (byChildCategory[leafName] || 0) + 1;
    }
  }

  return { productsUpdated, byChildCategory };
}

/** Restore Apparel product strings from unrestored apparel-product backups. */
export async function rollbackApparelProductLabels() {
  const pending = await backupCollection()
    .find({ kind: 'apparel-product', restored: { $ne: true } })
    .toArray();
  let productsRestored = 0;

  for (const row of pending) {
    await CatalogProduct.updateOne(
      { _id: row.productId },
      {
        $set: {
          category: row.category,
          subcategory: row.subcategory ?? '',
          childCategory: row.childCategory ?? '',
        },
      },
    );
    await backupCollection().updateOne(
      { _id: row._id },
      { $set: { restored: true, restoredAt: new Date() } },
    );
    productsRestored += 1;
  }

  return { productsRestored };
}
