import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { configureSwagForCaller } from '../src/modules/copilot/swagDesignWorkflow.js';
import { buildBrandedProductListings, mockupUrlFromCollections } from '../src/modules/storefront/brandedShopProducts.js';
import { publishCollectionToShop, syncCollectionPublishTargets, unpublishCollectionFromShop } from '../src/modules/shops/shopCatalogSync.js';

beforeAll(connectTestDb); afterAll(disconnectTestDb);
let tenant, account, products, collection, stores, ctx;
beforeEach(async () => {
  await clearTestDb(); tenant = await makeTenant(); account = await makeUser(tenant, 'company_admin');
  products = await CatalogProduct.create(['Bliss Mug', 'Corporate Polo', 'Cozy Mug', 'Plain product'].map((name, index) => ({
    sku: `CONSISTENCY-${index}`, name, status: 'active', basePriceInr: 500, primaryImageUrl: `/catalog-${index}.png`,
    variants: [{ sku: `CONSISTENCY-V-${index}`, stock: 5 }],
  })));
  collection = await Collection.create({ tenantId: tenant._id, createdBy: account.user._id, code: 'SYNTHETIC-CONSISTENCY', name: 'Synthetic saved collection',
    artworkUrl: '/saved-logo.png', status: 'ready', productRefs: products.map((product, index) => ({ catalogProductId: product._id, name: product.name,
      ...(index < 3 ? { mockupUrl: `/collection-a/${product._id}/v1.png`, mockupBackUrl: `/collection-a/${product._id}/back-v1.png`,
        designOnlyImageUrl: `/production-${index}.png`, placement: { xPct: 50, yPct: 50, wPct: 20, rot: 0 },
        placements: [{ key: index === 1 ? 'left' : 'front', xPct: 50, yPct: 50, wPct: 20, rot: 0, artworkUrl: `/area-art-${index}.png` }] } : {}),
    })) });
  stores = await Shop.create(['one', 'two'].map(name => ({ tenantId: tenant._id, name, slug: `synthetic-${name}`, status: 'draft' })));
  const conversation = await CopilotConversation.create({ tenantId: tenant._id, userId: account.user._id });
  ctx = { authInfo: { extra: { tenantId: String(tenant._id), userId: String(account.user._id), role: 'company_admin' } }, copilotConversationId: String(conversation._id) };
});
it('publishing to multiple shops preserves exact saved design and production references', async () => {
  const before = JSON.stringify(collection.productRefs);
  await syncCollectionPublishTargets(collection._id, tenant._id, stores.map(store => String(store._id)));
  const reloaded = await Collection.findOne({ _id: collection._id, tenantId: tenant._id });
  expect(JSON.stringify(reloaded.productRefs)).toBe(before);
  for (const store of stores) {
    const listings = await buildBrandedProductListings(await Shop.findOne({ _id: store._id, tenantId: tenant._id }));
    expect(listings).toHaveLength(4);
    for (const ref of reloaded.productRefs) {
      const listing = listings.find(row => row._id === `${collection._id}:${ref.catalogProductId}`);
      expect(listing.mockupUrl).toBe(ref.mockupUrl || '');
      expect(listing.mockupBackUrl).toBe(ref.mockupBackUrl || '');
      expect(listing.placements.map(p => p.artworkUrl)).toEqual(ref.placements.map(p => p.artworkUrl));
    }
  }
});
it('Copilot rehydrates the same per-product design identities used by the storefront', async () => {
  const state = await configureSwagForCaller(ctx, { revision: 0, collectionId: String(collection._id) });
  await publishCollectionToShop(stores[0]._id, tenant._id, collection);
  const listings = await buildBrandedProductListings(await Shop.findOne({ _id: stores[0]._id, tenantId: tenant._id }));
  for (const design of state.designs) {
    const listing = listings.find(row => row.catalogProductId === design.productId);
    expect(design.mockupUrl).toBe(listing.mockupUrl);
    expect(design.mockupBackUrl).toBe(listing.mockupBackUrl);
  }
});
it('regenerated mockups are returned after unpublish, update and republish without a stale copy', async () => {
  await publishCollectionToShop(stores[0]._id, tenant._id, collection);
  await unpublishCollectionFromShop(stores[0]._id, tenant._id, collection);
  collection = await Collection.findOne({ _id: collection._id, tenantId: tenant._id });
  collection.productRefs[0].mockupUrl = '/collection-a/updated-v2.png'; await collection.save();
  await publishCollectionToShop(stores[0]._id, tenant._id, collection);
  const listing = (await buildBrandedProductListings(await Shop.findOne({ _id: stores[0]._id, tenantId: tenant._id }))).find(row => row.catalogProductId === String(products[0]._id));
  expect(listing.mockupUrl).toBe('/collection-a/updated-v2.png');
});
it('two collections containing the same catalog family keep independent branded images', async () => {
  const other = await Collection.create({ tenantId: tenant._id, code: 'OTHER', name: 'Different design', status: 'ready',
    productRefs: [{ catalogProductId: products[0]._id, mockupUrl: '/collection-b/same-product.png' }] });
  await publishCollectionToShop(stores[0]._id, tenant._id, collection);
  await publishCollectionToShop(stores[0]._id, tenant._id, other);
  const listings = await buildBrandedProductListings(await Shop.findOne({ _id: stores[0]._id, tenantId: tenant._id }));
  expect(listings.find(row => row._id === `${collection._id}:${products[0]._id}`).mockupUrl).toBe(collection.productRefs[0].mockupUrl);
  expect(listings.find(row => row._id === `${other._id}:${products[0]._id}`).mockupUrl).toBe('/collection-b/same-product.png');
  expect(mockupUrlFromCollections([collection, other], String(other._id), String(products[0]._id))).toBe('/collection-b/same-product.png');
});
it('legacy and uncustomized products keep blank custom references and their own catalog fallback', async () => {
  collection.artworkUrl = ''; collection.productRefs = [{ catalogProductId: products[3]._id, name: products[3].name }]; await collection.save();
  await publishCollectionToShop(stores[0]._id, tenant._id, collection);
  const [listing] = await buildBrandedProductListings(await Shop.findOne({ _id: stores[0]._id, tenantId: tenant._id }));
  expect(listing).toMatchObject({ mockupUrl: '', mockupBackUrl: '', primaryImageUrl: '/catalog-3.png', placements: [] });
});
it('a foreign tenant cannot hydrate the saved collection or receive its branded listings', async () => {
  const foreign = await makeTenant(); const foreignAccount = await makeUser(foreign, 'company_admin');
  const conversation = await CopilotConversation.create({ tenantId: foreign._id, userId: foreignAccount.user._id });
  const foreignCtx = { authInfo: { extra: { tenantId: String(foreign._id), userId: String(foreignAccount.user._id), role: 'company_admin' } }, copilotConversationId: String(conversation._id) };
  await expect(configureSwagForCaller(foreignCtx, { revision: 0, collectionId: String(collection._id) })).rejects.toThrow();
  await publishCollectionToShop(stores[0]._id, tenant._id, collection);
  const foreignStore = await Shop.create({ tenantId: foreign._id, name: 'Foreign', slug: 'synthetic-foreign', activeListingKeys: [`${collection._id}:${products[0]._id}`] });
  expect(await buildBrandedProductListings(foreignStore)).toEqual([]);
});
