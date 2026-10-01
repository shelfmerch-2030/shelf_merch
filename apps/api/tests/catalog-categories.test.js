import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { makeUser, authHeader } from './helpers.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Category } from '../src/modules/catalog/category.model.js';
import { updateProduct } from '../src/modules/catalog/platformCatalog.service.js';
import {
  ensureCatalogCategories,
  recordParentMoves,
  remapCatalogProductCategories,
  rollbackCatalogHierarchy,
  archiveLegacyCatalogCategories,
  moveLifestyleAccessoryDraftsToOthers,
  reparentApparelUnderChild,
  migrateApparelProductLabels,
  rollbackApparelProductLabels,
} from '../src/seed/catalogCategories.js';

let app;
let token;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  ({ token } = await makeUser(null, 'platform_catalog_admin', 'platform'));
});

function authed(method, path) {
  return request(app)[method](path).set(authHeader(token));
}

describe('platform catalog categories', () => {
  it('creates a parent, a subcategory, and returns a tree', async () => {
    const parent = await authed('post', '/api/v1/platform/categories').send({ name: 'Food & Beverage' });
    expect(parent.status).toBe(201);
    expect(parent.body.parentId).toBeNull();

    const child = await authed('post', '/api/v1/platform/categories').send({
      name: 'Coffee',
      parentId: parent.body._id,
    });
    expect(child.status).toBe(201);
    expect(String(child.body.parentId)).toBe(String(parent.body._id));

    const tree = await authed('get', '/api/v1/platform/categories');
    expect(tree.status).toBe(200);
    expect(tree.body).toHaveLength(1);
    expect(tree.body[0].name).toBe('Food & Beverage');
    expect(tree.body[0].children.map((row) => row.name)).toEqual(['Coffee']);

    const children = await authed('get', `/api/v1/platform/categories?parentId=${parent.body._id}`);
    expect(children.status).toBe(200);
    expect(children.body.map((row) => row.name)).toEqual(['Coffee']);
  });

  it('allows the same subcategory name under different parents', async () => {
    const apparel = await authed('post', '/api/v1/platform/categories').send({ name: 'Apparel' });
    const bags = await authed('post', '/api/v1/platform/categories').send({ name: 'Bags' });
    const first = await authed('post', '/api/v1/platform/categories').send({
      name: 'Others',
      parentId: apparel.body._id,
    });
    const second = await authed('post', '/api/v1/platform/categories').send({
      name: 'Others',
      parentId: bags.body._id,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('rejects a subcategory that does not belong to the selected parent', async () => {
    const apparel = await authed('post', '/api/v1/platform/categories').send({ name: 'Apparel' });
    const bags = await authed('post', '/api/v1/platform/categories').send({ name: 'Bags' });
    await authed('post', '/api/v1/platform/categories').send({ name: 'T-Shirts', parentId: apparel.body._id });
    await authed('post', '/api/v1/platform/categories').send({ name: 'Backpacks', parentId: bags.body._id });

    const res = await authed('post', '/api/v1/platform/products').send({
      name: 'Tee',
      category: 'Apparel',
      subcategory: 'Backpacks',
      sellingPriceInr: 500,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_SUBCATEGORY');
  });

  it('stores the selected category names on the product', async () => {
    const apparel = await authed('post', '/api/v1/platform/categories').send({ name: 'Apparel' });
    await authed('post', '/api/v1/platform/categories').send({ name: 'T-Shirts', parentId: apparel.body._id });

    const res = await authed('post', '/api/v1/platform/products').send({
      name: 'Tee',
      category: 'Apparel',
      subcategory: 'T-Shirts',
      sellingPriceInr: 500,
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('Apparel');
    expect(res.body.subcategory).toBe('T-Shirts');
    expect(res.body.childCategory || '').toBe('');
    expect(res.body.categoryId).toBeUndefined();
  });

  it('allows a child category under a subcategory and keeps childCategory optional', async () => {
    const accessories = await authed('post', '/api/v1/platform/categories').send({ name: 'Accessories' });
    const drinkware = await authed('post', '/api/v1/platform/categories').send({
      name: 'Drinkware',
      parentId: accessories.body._id,
    });
    expect(drinkware.body.depth).toBe(1);
    const mugs = await authed('post', '/api/v1/platform/categories').send({
      name: 'Mugs',
      parentId: drinkware.body._id,
    });
    expect(mugs.status).toBe(201);
    expect(mugs.body.depth).toBe(2);

    const tree = await authed('get', '/api/v1/platform/categories');
    expect(tree.body[0].children[0].children.map((row) => row.name)).toEqual(['Mugs']);

    const pub = await request(app).get('/api/v1/catalog/categories');
    const publicAccessories = pub.body.find((row) => row.name === 'Accessories');
    expect(publicAccessories.children.map((row) => row.name)).toEqual(['Drinkware']);

    const withoutLeaf = await authed('post', '/api/v1/platform/products').send({
      name: 'Bottle',
      category: 'Accessories',
      subcategory: 'Drinkware',
      sellingPriceInr: 100,
    });
    expect(withoutLeaf.status).toBe(201);
    expect(withoutLeaf.body.childCategory || '').toBe('');

    const withLeaf = await authed('post', '/api/v1/platform/products').send({
      name: 'Mug',
      category: 'Accessories',
      subcategory: 'Drinkware',
      childCategory: 'Mugs',
      sellingPriceInr: 100,
    });
    expect(withLeaf.status).toBe(201);
    expect(withLeaf.body.childCategory).toBe('Mugs');
    expect(withLeaf.body.category).toBe('Accessories');
    expect(withLeaf.body.subcategory).toBe('Drinkware');

    const invalid = await authed('post', '/api/v1/platform/products').send({
      name: 'Wrong',
      category: 'Accessories',
      subcategory: 'Drinkware',
      childCategory: 'Totes',
      sellingPriceInr: 100,
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('INVALID_CHILD_CATEGORY');
  });

  it('blocks archive while active products still use the category', async () => {
    const apparel = await authed('post', '/api/v1/platform/categories').send({ name: 'Apparel' });
    const shirts = await authed('post', '/api/v1/platform/categories').send({
      name: 'T-Shirts',
      parentId: apparel.body._id,
    });
    await CatalogProduct.create({
      sku: 'SM-ARCH-1',
      name: 'Live Tee',
      category: 'Apparel',
      subcategory: 'T-Shirts',
      basePriceInr: 100,
      status: 'active',
    });

    const blocked = await authed('patch', `/api/v1/platform/categories/${shirts.body._id}`).send({
      status: 'archived',
    });
    expect(blocked.status).toBe(409);

    await CatalogProduct.updateMany({}, { $set: { status: 'draft' } });
    const parentBlocked = await authed('patch', `/api/v1/platform/categories/${apparel.body._id}`).send({
      status: 'archived',
    });
    expect(parentBlocked.status).toBe(409);

    const childArchived = await authed('patch', `/api/v1/platform/categories/${shirts.body._id}`).send({
      status: 'archived',
    });
    expect(childArchived.status).toBe(200);
    expect(childArchived.body.status).toBe('archived');
  });

  it('renames product strings and hides archived rows from the public tree', async () => {
    const apparel = await authed('post', '/api/v1/platform/categories').send({ name: 'Apparel' });
    await CatalogProduct.create({
      sku: 'SM-REN-1',
      name: 'Draft Tee',
      category: 'Apparel',
      basePriceInr: 100,
      status: 'draft',
    });

    const renamed = await authed('patch', `/api/v1/platform/categories/${apparel.body._id}`).send({
      name: 'Clothing',
    });
    expect(renamed.status).toBe(200);
    const product = await CatalogProduct.findOne({ sku: 'SM-REN-1' });
    expect(product.category).toBe('Clothing');

    await authed('patch', `/api/v1/platform/categories/${apparel.body._id}`).send({ status: 'archived' });
    const pub = await request(app).get('/api/v1/catalog/categories');
    expect(pub.status).toBe(200);
    expect(pub.body.find((row) => row.name === 'Clothing')).toBeUndefined();
    const stored = await Category.findById(apparel.body._id);
    expect(stored.status).toBe('archived');
  });

  it('moves former parents under Accessories and remaps product strings', async () => {
    const bags = await Category.create({
      name: 'Bags',
      slug: 'bags',
      parentId: null,
      sortOrder: 2,
      status: 'active',
    });
    const backpacks = await Category.create({
      name: 'Backpacks',
      slug: 'backpacks',
      parentId: bags._id,
      sortOrder: 0,
      status: 'active',
    });
    await Category.create({
      name: 'Technology',
      slug: 'technology',
      parentId: null,
      sortOrder: 3,
      status: 'active',
    });
    await Category.create({
      name: 'Office Supplies',
      slug: 'office-supplies',
      parentId: null,
      sortOrder: 4,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-BAG-1',
      name: 'Tote',
      category: 'Bags',
      subcategory: 'Laptop Bags',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-MUG-1',
      name: 'Mug',
      category: 'Drinkware',
      subcategory: 'Mugs',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-TECH-1',
      name: 'Charger',
      category: 'Technology',
      subcategory: 'Chargers',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-OFF-1',
      name: 'Notebook',
      category: 'Office Supplies',
      subcategory: 'Notebooks',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-APP-1',
      name: 'Tee',
      category: 'Apparel',
      subcategory: 'T-Shirts',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-KIT-1',
      name: 'Welcome kit',
      category: 'Kits',
      subcategory: 'Pre-designed kits',
      basePriceInr: 100,
      status: 'active',
    });

    const first = await ensureCatalogCategories();
    const untouched = await CatalogProduct.findOne({ sku: 'SM-BAG-1' });
    expect(untouched.category).toBe('Bags');
    expect(untouched.subcategory).toBe('Laptop Bags');

    await recordParentMoves(first.parentMoves);
    const remapped = await remapCatalogProductCategories();
    expect(remapped.productsUpdated).toBe(4);

    const accessories = await Category.findOne({ name: 'Accessories', parentId: null });
    const moved = await Category.findById(bags._id);
    expect(String(moved.parentId)).toBe(String(accessories._id));
    expect(moved.slug).toBe('bags');
    expect(String((await Category.findById(backpacks._id)).parentId)).toBe(String(bags._id));

    const accessoryChildren = await Category.find({ parentId: accessories._id }).sort({ sortOrder: 1 });
    expect(accessoryChildren.slice(0, 6).map((row) => row.name)).toEqual([
      'Stationery',
      'Drinkware',
      'Bags',
      'Travel Accessories',
      'Electronics & Gadgets',
      'Others',
    ]);
    expect(accessoryChildren.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Office Supplies', 'Technology']),
    );

    const bag = await CatalogProduct.findOne({ sku: 'SM-BAG-1' });
    expect(bag.category).toBe('Accessories');
    expect(bag.subcategory).toBe('Bags');
    const mug = await CatalogProduct.findOne({ sku: 'SM-MUG-1' });
    expect(mug.category).toBe('Accessories');
    expect(mug.subcategory).toBe('Drinkware');
    const charger = await CatalogProduct.findOne({ sku: 'SM-TECH-1' });
    expect(charger.category).toBe('Accessories');
    expect(charger.subcategory).toBe('Electronics & Gadgets');
    const notebook = await CatalogProduct.findOne({ sku: 'SM-OFF-1' });
    expect(notebook.category).toBe('Accessories');
    expect(notebook.subcategory).toBe('Stationery');
    expect((await CatalogProduct.findOne({ sku: 'SM-APP-1' })).category).toBe('Apparel');
    expect((await CatalogProduct.findOne({ sku: 'SM-KIT-1' })).subcategory).toBe('Pre-designed kits');

    const food = await Category.findOne({ name: 'Food & Beverage', parentId: null });
    const foodChildren = await Category.find({ parentId: food._id }).sort({ sortOrder: 1 });
    expect(foodChildren.map((row) => row.name)).toEqual(['Coffee', 'Snacks', 'Chocolates']);
    const kits = await Category.findOne({ name: 'Kits', parentId: null });
    const kitChildren = await Category.find({ parentId: kits._id }).sort({ sortOrder: 1 });
    expect(kitChildren.map((row) => row.name)).toEqual(['Pre-designed kits', 'Customised kits']);
    expect(first.moved).toBeGreaterThan(0);

    const second = await ensureCatalogCategories();
    const secondRemap = await remapCatalogProductCategories();
    expect(second.created).toBe(0);
    expect(second.moved).toBe(0);
    expect(secondRemap.productsUpdated).toBe(0);
    expect(await Category.countDocuments({ name: 'Bags' })).toBe(1);

    const rolled = await rollbackCatalogHierarchy();
    expect(rolled.productsRestored).toBe(4);
    expect(rolled.parentsRestored).toBeGreaterThan(0);
    const restoredBag = await CatalogProduct.findOne({ sku: 'SM-BAG-1' });
    expect(restoredBag.category).toBe('Bags');
    expect(restoredBag.subcategory).toBe('Laptop Bags');
    const restoredCharger = await CatalogProduct.findOne({ sku: 'SM-TECH-1' });
    expect(restoredCharger.category).toBe('Technology');
    expect(restoredCharger.subcategory).toBe('Chargers');
    const restoredNotebook = await CatalogProduct.findOne({ sku: 'SM-OFF-1' });
    expect(restoredNotebook.category).toBe('Office Supplies');
    expect(restoredNotebook.subcategory).toBe('Notebooks');
    expect((await Category.findById(bags._id)).parentId).toBeNull();
    expect(await Category.findById(bags._id)).toBeTruthy();
    expect(await Category.findOne({ name: 'Stationery' })).toBeTruthy();
  });

  it('archives leftover accessory categories without changing product strings', async () => {
    await ensureCatalogCategories();
    const accessories = await Category.findOne({ name: 'Accessories', parentId: null });
    const technology = await Category.findOne({ name: 'Technology', parentId: accessories._id });
    const powerBanks = await Category.create({
      name: 'Power Banks',
      slug: 'power-banks',
      parentId: technology._id,
      sortOrder: 0,
      status: 'active',
    });
    await Category.create({
      name: 'Lifestyle Accessories',
      slug: 'lifestyle-accessories',
      parentId: accessories._id,
      sortOrder: 20,
      status: 'active',
    });
    const keyChains = await Category.create({
      name: 'Key Chains',
      slug: 'key-chains',
      parentId: accessories._id,
      sortOrder: 21,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-KEEP-1',
      name: 'Charger',
      category: 'Accessories',
      subcategory: 'Electronics & Gadgets',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-LIFE-1',
      name: 'Sticker',
      category: 'Accessories',
      subcategory: 'Lifestyle Accessories',
      basePriceInr: 100,
      status: 'draft',
    });
    await CatalogProduct.create({
      sku: 'SM-KEY-1',
      name: 'Metal keychain',
      category: 'Accessories',
      subcategory: 'Key Chains',
      basePriceInr: 100,
      status: 'active',
    });

    const first = await archiveLegacyCatalogCategories();
    expect(first.archived).toBeGreaterThan(0);
    expect(first.skipped).toEqual([]);
    expect((await Category.findById(technology._id)).status).toBe('archived');
    expect((await Category.findOne({ name: 'Office Supplies' })).status).toBe('archived');
    expect((await Category.findOne({ name: 'Lifestyle Accessories' })).status).toBe('archived');
    expect((await Category.findById(powerBanks._id)).status).toBe('archived');
    expect((await Category.findById(keyChains._id)).status).toBe('active');
    expect(await Category.findById(technology._id)).toBeTruthy();

    const charger = await CatalogProduct.findOne({ sku: 'SM-KEEP-1' });
    expect(charger.category).toBe('Accessories');
    expect(charger.subcategory).toBe('Electronics & Gadgets');
    const sticker = await CatalogProduct.findOne({ sku: 'SM-LIFE-1' });
    expect(sticker.category).toBe('Accessories');
    expect(sticker.subcategory).toBe('Lifestyle Accessories');
    const keychain = await CatalogProduct.findOne({ sku: 'SM-KEY-1' });
    expect(keychain.subcategory).toBe('Key Chains');

    const second = await archiveLegacyCatalogCategories();
    expect(second.archived).toBe(0);

    const pub = await request(app).get('/api/v1/catalog/categories');
    expect(pub.status).toBe(200);
    const accessoriesNode = pub.body.find((row) => row.name === 'Accessories');
    const publicChildren = accessoriesNode.children.map((row) => row.name);
    expect(publicChildren).not.toContain('Technology');
    expect(publicChildren).not.toContain('Office Supplies');
    expect(publicChildren).not.toContain('Lifestyle Accessories');
    expect(publicChildren).toEqual(expect.arrayContaining(['Key Chains', 'Others']));
    const platformChildren = await authed('get', `/api/v1/platform/categories?parentId=${accessories._id}`);
    const wizardChoices = platformChildren.body
      .filter((row) => row.status === 'active')
      .map((row) => row.name);
    expect(wizardChoices).not.toContain('Lifestyle Accessories');
    expect(wizardChoices).toEqual(expect.arrayContaining(['Key Chains', 'Others']));
  });

  it('moves lifestyle accessory drafts to Others and leaves active products', async () => {
    await CatalogProduct.create({
      sku: 'SM-DRAFT-1',
      name: 'A2 sticker',
      category: 'Accessories',
      subcategory: 'Lifestyle Accessories',
      basePriceInr: 100,
      status: 'draft',
    });
    await CatalogProduct.create({
      sku: 'SM-ACTIVE-1',
      name: 'Live keychain',
      category: 'Accessories',
      subcategory: 'Key Chains',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-ACTIVE-LIFE',
      name: 'Live sticker',
      category: 'Accessories',
      subcategory: 'Lifestyle Accessories',
      basePriceInr: 100,
      status: 'active',
    });

    const first = await moveLifestyleAccessoryDraftsToOthers();
    expect(first.draftsUpdated).toBe(1);
    const draft = await CatalogProduct.findOne({ sku: 'SM-DRAFT-1' });
    expect(draft.status).toBe('draft');
    expect(draft.category).toBe('Accessories');
    expect(draft.subcategory).toBe('Others');
    expect((await CatalogProduct.findOne({ sku: 'SM-ACTIVE-1' })).subcategory).toBe('Key Chains');
    expect((await CatalogProduct.findOne({ sku: 'SM-ACTIVE-LIFE' })).subcategory).toBe('Lifestyle Accessories');

    const second = await moveLifestyleAccessoryDraftsToOthers();
    expect(second.draftsUpdated).toBe(0);
  });

  it('seeds child categories without rewriting products, apparel names, or Key Chains', async () => {
    const accessories = await Category.create({
      name: 'Accessories',
      slug: 'accessories',
      parentId: null,
      depth: 0,
      status: 'active',
    });
    await Category.create({
      name: 'Key Chains',
      slug: 'key-chains',
      parentId: accessories._id,
      depth: 1,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-KEEP-MUG',
      name: 'Mug',
      category: 'Accessories',
      subcategory: 'Drinkware',
      basePriceInr: 100,
      status: 'active',
    });

    await ensureCatalogCategories();

    const drinkware = await Category.findOne({ name: 'Drinkware', parentId: accessories._id });
    const drinkwareLeaves = await Category.find({ parentId: drinkware._id }).sort({ sortOrder: 1 });
    expect(drinkware.depth).toBe(1);
    expect(drinkwareLeaves.map((row) => row.name)).toEqual(['Mugs', 'Tumblers', 'Bottles']);
    expect(drinkwareLeaves.every((row) => row.depth === 2)).toBe(true);

    const stationery = await Category.findOne({ name: 'Stationery', parentId: accessories._id });
    const stationeryLeaves = await Category.find({ parentId: stationery._id }).sort({ sortOrder: 1 });
    expect(stationeryLeaves.map((row) => row.name)).toEqual([
      'Diaries',
      'Pens & Pencils',
      'Card Holders',
      'ID Cards',
      'Notepads',
      'Desk Organisers',
    ]);

    const bags = await Category.findOne({ name: 'Bags', parentId: accessories._id });
    const bagLeaves = await Category.find({ parentId: bags._id }).sort({ sortOrder: 1 });
    expect(bagLeaves.map((row) => row.name)).toEqual(['Totes', 'Laptop Bags', 'Backpacks']);

    const product = await CatalogProduct.findOne({ sku: 'SM-KEEP-MUG' });
    expect(product.category).toBe('Accessories');
    expect(product.subcategory).toBe('Drinkware');
    expect(product.childCategory || '').toBe('');

    const keyChains = await Category.findOne({ name: 'Key Chains' });
    expect(String(keyChains.parentId)).toBe(String(accessories._id));

    const apparel = await Category.findOne({ name: 'Apparel', parentId: null });
    const apparelChildren = await Category.find({ parentId: apparel._id });
    expect(apparelChildren.map((row) => row.name)).toContain('Polo Shirts');
    expect(apparelChildren.map((row) => row.name)).not.toContain('Polos');

    const kits = await Category.findOne({ name: 'Kits', parentId: null });
    const kitChildren = await Category.find({ parentId: kits._id }).sort({ sortOrder: 1 });
    expect(kitChildren.map((row) => row.name)).toEqual(['Pre-designed kits', 'Customised kits']);
  });

  it('reparents a category, updates descendant depth, and leaves product strings', async () => {
    const apparel = await authed('post', '/api/v1/platform/categories').send({ name: 'Apparel' });
    const nested = await authed('post', '/api/v1/platform/categories').send({
      name: 'Apparel',
      parentId: apparel.body._id,
    });
    const shirts = await authed('post', '/api/v1/platform/categories').send({
      name: 'T-Shirts',
      parentId: apparel.body._id,
    });
    const crew = await authed('post', '/api/v1/platform/categories').send({
      name: 'Crew',
      parentId: shirts.body._id,
    });
    await CatalogProduct.create({
      sku: 'SM-TEE-KEEP',
      name: 'Tee',
      category: 'Apparel',
      subcategory: 'T-Shirts',
      childCategory: '',
      basePriceInr: 100,
      status: 'active',
    });

    const self = await authed('patch', `/api/v1/platform/categories/${apparel.body._id}`).send({
      parentId: apparel.body._id,
    });
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe('INVALID_PARENT');

    const cycle = await authed('patch', `/api/v1/platform/categories/${apparel.body._id}`).send({
      parentId: crew.body._id,
    });
    expect(cycle.status).toBe(422);
    expect(cycle.body.error.code).toBe('INVALID_PARENT');

    const moved = await authed('patch', `/api/v1/platform/categories/${shirts.body._id}`).send({
      parentId: nested.body._id,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.depth).toBe(2);
    expect(String(moved.body.parentId)).toBe(String(nested.body._id));
    expect((await Category.findById(crew.body._id)).depth).toBe(3);

    const product = await CatalogProduct.findOne({ sku: 'SM-TEE-KEEP' });
    expect(product.category).toBe('Apparel');
    expect(product.subcategory).toBe('T-Shirts');
    expect(product.childCategory || '').toBe('');

    const rooted = await authed('patch', `/api/v1/platform/categories/${shirts.body._id}`).send({
      parentId: null,
    });
    expect(rooted.status).toBe(200);
    expect(rooted.body.parentId).toBeNull();
    expect(rooted.body.depth).toBe(0);
    expect((await Category.findById(crew.body._id)).depth).toBe(1);
  });

  it('moves Apparel subcategories under child Apparel and archives sus', async () => {
    const root = await Category.create({
      name: 'Apparel',
      slug: 'apparel',
      parentId: null,
      depth: 0,
      status: 'active',
    });
    const child = await Category.create({
      name: 'Apparel',
      slug: 'apparel',
      parentId: root._id,
      depth: 1,
      status: 'active',
      sortOrder: 6,
    });
    await Category.create({
      name: 'T-Shirts',
      slug: 't-shirts',
      parentId: root._id,
      depth: 1,
      sortOrder: 0,
      status: 'active',
    });
    await Category.create({
      name: 'sus',
      slug: 'sus',
      parentId: root._id,
      depth: 1,
      sortOrder: 7,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-APP-KEEP',
      name: 'Tee',
      category: 'Apparel',
      subcategory: 'T-Shirts',
      childCategory: '',
      basePriceInr: 100,
      status: 'active',
    });

    const first = await reparentApparelUnderChild();
    expect(first.movedNames).toEqual(['T-Shirts']);
    expect(first.susArchived).toBe(true);

    const shirts = await Category.findOne({ name: 'T-Shirts' });
    expect(String(shirts.parentId)).toBe(String(child._id));
    expect(shirts.depth).toBe(2);
    expect((await Category.findOne({ name: 'sus' })).status).toBe('archived');

    const product = await CatalogProduct.findOne({ sku: 'SM-APP-KEEP' });
    expect(product.category).toBe('Apparel');
    expect(product.subcategory).toBe('T-Shirts');
    expect(product.childCategory || '').toBe('');

    const second = await reparentApparelUnderChild();
    expect(second.moved).toBe(0);
    expect(second.susArchived).toBe(false);
  });

  it('migrates Apparel product labels and leaves other products unchanged', async () => {
    const root = await Category.create({
      name: 'Apparel',
      slug: 'apparel-root',
      parentId: null,
      depth: 0,
      status: 'active',
    });
    const child = await Category.create({
      name: 'Apparel',
      slug: 'apparel-child',
      parentId: root._id,
      depth: 1,
      status: 'active',
    });
    await Category.create({
      name: 'T-Shirts',
      slug: 't-shirts',
      parentId: child._id,
      depth: 2,
      status: 'active',
    });
    await Category.create({
      name: 'Polo Shirts',
      slug: 'polo-shirts',
      parentId: child._id,
      depth: 2,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-APP-TEE',
      name: 'Tee',
      category: 'Apparel',
      subcategory: 'T-Shirts',
      childCategory: '',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-APP-POLO',
      name: 'Polo',
      category: 'Apparel',
      subcategory: 'Polo Shirts',
      childCategory: '',
      basePriceInr: 100,
      status: 'active',
    });
    await CatalogProduct.create({
      sku: 'SM-ACC-KEEP',
      name: 'Mug',
      category: 'Accessories',
      subcategory: 'Drinkware',
      childCategory: '',
      basePriceInr: 100,
      status: 'active',
    });

    const first = await migrateApparelProductLabels();
    expect(first.productsUpdated).toBe(2);
    expect(first.byChildCategory).toEqual({ 'T-Shirts': 1, 'Polo Shirts': 1 });

    const tee = await CatalogProduct.findOne({ sku: 'SM-APP-TEE' });
    expect(tee.category).toBe('Apparel');
    expect(tee.subcategory).toBe('Apparel');
    expect(tee.childCategory).toBe('T-Shirts');
    const saved = await updateProduct(tee._id, {
      category: tee.category,
      subcategory: tee.subcategory,
      childCategory: tee.childCategory,
    });
    expect(saved.product.childCategory).toBe('T-Shirts');

    const mug = await CatalogProduct.findOne({ sku: 'SM-ACC-KEEP' });
    expect(mug.category).toBe('Accessories');
    expect(mug.subcategory).toBe('Drinkware');
    expect(mug.childCategory || '').toBe('');

    const second = await migrateApparelProductLabels();
    expect(second.productsUpdated).toBe(0);

    const rolled = await rollbackApparelProductLabels();
    expect(rolled.productsRestored).toBe(2);
    const restored = await CatalogProduct.findOne({ sku: 'SM-APP-TEE' });
    expect(restored.category).toBe('Apparel');
    expect(restored.subcategory).toBe('T-Shirts');
    expect(restored.childCategory || '').toBe('');
  });
});
