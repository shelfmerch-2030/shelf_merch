/**
 * Canonical catalog taxonomy. Names match the strings already stored on
 * CatalogProduct.category / subcategory.
 *
 * Kits is included only so existing "Kits" product strings and /category/kits
 * keep resolving. Kit classification and PlatformKit are unchanged.
 */
import mongoose from 'mongoose';
import { Category } from '../modules/catalog/category.model.js';
import { CatalogProduct } from '../modules/catalog/catalogProduct.model.js';

/** Former top-level categories that stay in the database and sit under Accessories. */
export const MOVED_UNDER_ACCESSORIES = ['Bags', 'Drinkware', 'Office Supplies', 'Technology'];

/**
 * Products still stored under an old parent name.
 * The old category string becomes the Accessories subcategory, except Technology
 * and Office Supplies, which use the business subcategory names.
 */
export const PRODUCT_CATEGORY_REMAP = {
  Drinkware: { category: 'Accessories', subcategory: 'Drinkware' },
  Bags: { category: 'Accessories', subcategory: 'Bags' },
  Technology: { category: 'Accessories', subcategory: 'Electronics & Gadgets' },
  'Office Supplies': { category: 'Accessories', subcategory: 'Stationery' },
};

/** Child rows under an Accessories subcategory. Product strings are not rewritten. */
export const CHILD_CATEGORY_TREE = {
  Drinkware: ['Mugs', 'Tumblers', 'Bottles'],
  Stationery: ['Diaries', 'Pens & Pencils', 'Card Holders', 'ID Cards', 'Notepads', 'Desk Organisers'],
  Bags: ['Totes', 'Laptop Bags', 'Backpacks'],
};

export const CATALOG_CATEGORY_TREE = [
  {
    name: 'Apparel',
    children: ['T-Shirts', 'Polo Shirts', 'Hoodies & Sweatshirts', 'Jackets', 'Caps', 'Others'],
  },
  {
    name: 'Accessories',
    children: [
      'Stationery',
      'Drinkware',
      'Bags',
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

async function placeChild({ name, parentId, sortOrder, moveExisting }) {
  if (!moveExisting) {
    const existing = await Category.findOne({ parentId, name });
    if (existing) {
      if (existing.sortOrder !== sortOrder) {
        existing.sortOrder = sortOrder;
        await existing.save();
      }
      return { created: false, moved: false };
    }
    return upsertCategory({ name, parentId, sortOrder });
  }
  return attachExistingCategory({ name, parentId, sortOrder });
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
 * Insert missing rows and move Bags, Drinkware, Office Supplies, and Technology
 * under Accessories. Does not rename, delete, or rewrite product strings.
 * Kits stays a root. Re-running does not duplicate rows.
 */
export async function ensureCatalogCategories() {
  await Category.syncIndexes();
  const totals = { created: 0, existing: 0, moved: 0 };
  const parentMoves = [];

  for (let i = 0; i < CATALOG_CATEGORY_TREE.length; i += 1) {
    const parentSpec = CATALOG_CATEGORY_TREE[i];
    const parentResult = await upsertCategory({ name: parentSpec.name, parentId: null, sortOrder: i });
    countResult(totals, parentResult);

    const parent = await Category.findOne({ parentId: null, name: parentSpec.name });
    if (parent && parent.sortOrder !== i) {
      parent.sortOrder = i;
      await parent.save();
    }

    for (let j = 0; j < parentSpec.children.length; j += 1) {
      const childName = parentSpec.children[j];
      const childResult = await placeChild({
        name: childName,
        parentId: parent._id,
        sortOrder: j,
        moveExisting: MOVED_UNDER_ACCESSORIES.includes(childName),
      });
      countResult(totals, childResult);
      await rememberParentMove(parentMoves, childResult);
    }
  }

  const accessories = await Category.findOne({ parentId: null, name: 'Accessories' });
  const businessChildren = new Set(
    CATALOG_CATEGORY_TREE.find((row) => row.name === 'Accessories')?.children ?? [],
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

  for (const [subName, leaves] of Object.entries(CHILD_CATEGORY_TREE)) {
    const sub = await Category.findOne({ parentId: accessories._id, name: subName });
    if (!sub) continue;
    for (let k = 0; k < leaves.length; k += 1) {
      const leafResult = await placeChild({
        name: leaves[k],
        parentId: sub._id,
        sortOrder: k,
        moveExisting: false,
      });
      countResult(totals, leafResult);
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

/** Old Accessories children that are not in the business tree. Rows are archived, not deleted. */
export const LEGACY_CATEGORIES_TO_ARCHIVE = ['Technology', 'Office Supplies', 'Lifestyle Accessories'];

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
