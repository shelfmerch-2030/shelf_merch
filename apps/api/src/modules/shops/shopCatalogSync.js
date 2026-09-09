import mongoose from 'mongoose';
import { Shop } from './shop.model.js';
import { Collection } from '../collections/collection.model.js';
import { collectionsForShopFilter, isCollectionLinkedToShop } from '../collections/collectionQueries.js';
import { listingKey, listingKeysFromCollection, parseListingKey } from './listingKeys.js';

function ensureListingFields(shop) {
  if (!Array.isArray(shop.activeListingKeys)) shop.activeListingKeys = [];
  if (!Array.isArray(shop.featuredListingKeys)) shop.featuredListingKeys = [];
}

/** Legacy additive merge — used when bootstrapping from older flows. */
export async function addCatalogProductsToShop(shopId, tenantId, catalogProductIds) {
  const ids = [...new Set(catalogProductIds.map(String).filter(Boolean))];
  if (!ids.length) return;

  const shop = await Shop.findOne({ _id: shopId, tenantId });
  if (!shop) return;

  ensureListingFields(shop);
  const existing = new Set((shop.selectedCatalogProductIds || []).map(String));
  const toAdd = ids.filter((id) => !existing.has(id));
  if (!toAdd.length) return;

  shop.selectedCatalogProductIds = [
    ...(shop.selectedCatalogProductIds || []),
    ...toAdd.map((id) => new mongoose.Types.ObjectId(id)),
  ];
  await shop.save();
}

async function loadPublishedCollections(shopId, tenantId) {
  return Collection.find({
    tenantId,
    status: { $ne: 'archived' },
    ...collectionsForShopFilter(shopId),
  });
}

function syncLegacyCatalogIds(shop, activeKeys) {
  const catalogIds = [
    ...new Set(
      activeKeys.map((k) => parseListingKey(k)?.catalogProductId).filter(Boolean),
    ),
  ];
  shop.selectedCatalogProductIds = catalogIds.map((id) => new mongoose.Types.ObjectId(id));
}

/** Build listing keys from legacy selectedCatalogProductIds when activeListingKeys is empty. */
export async function bootstrapActiveListingKeys(shop, tenantId) {
  ensureListingFields(shop);
  if (shop.activeListingKeys.length) return shop;

  const allowed = new Set((shop.selectedCatalogProductIds || []).map(String).filter(Boolean));
  if (!allowed.size) return shop;

  const collections = await loadPublishedCollections(shop._id, tenantId);
  const keys = [];
  for (const col of collections) {
    for (const ref of col.productRefs || []) {
      const catalogProductId = ref.catalogProductId ? String(ref.catalogProductId) : '';
      if (!catalogProductId || !allowed.has(catalogProductId)) continue;
      keys.push(listingKey(col._id, catalogProductId));
    }
  }
  if (keys.length) {
    shop.activeListingKeys = keys;
    await shop.save();
  }
  return shop;
}

/**
 * Publish a collection to a shop: link shop, record publish date, activate all listings.
 */
export async function publishCollectionToShop(shopId, tenantId, collection) {
  const shop = await Shop.findOne({ _id: shopId, tenantId });
  if (!shop) return null;

  ensureListingFields(shop);
  const shopKey = String(shopId);

  let nextIds = [...(collection.shopIds || [])];
  if (!nextIds.length && collection.shopId) nextIds = [collection.shopId];
  if (!nextIds.map(String).includes(shopKey)) {
    nextIds.push(shop._id);
    collection.shopIds = nextIds;
    if (!collection.shopId) collection.shopId = shop._id;
  }

  if (!Array.isArray(collection.shopPublish)) collection.shopPublish = [];
  if (!collection.shopPublish.some((p) => String(p.shopId) === shopKey)) {
    collection.shopPublish.push({ shopId: shop._id, publishedAt: new Date() });
  }
  await collection.save();

  const keys = listingKeysFromCollection(collection);
  const active = new Set(shop.activeListingKeys.map(String));
  for (const k of keys) active.add(k);
  shop.activeListingKeys = [...active];
  syncLegacyCatalogIds(shop, shop.activeListingKeys);
  await shop.save();
  return shop;
}

/**
 * Remove a collection from a shop only — does not archive/delete the global collection.
 */
export async function unpublishCollectionFromShop(shopId, tenantId, collection) {
  const shop = await Shop.findOne({ _id: shopId, tenantId });
  if (!shop) return null;

  ensureListingFields(shop);
  const shopKey = String(shopId);
  const colKey = String(collection._id);

  collection.shopIds = (collection.shopIds || []).filter((id) => String(id) !== shopKey);
  if (String(collection.shopId) === shopKey) {
    collection.shopId = collection.shopIds[0] ?? null;
  }
  collection.shopPublish = (collection.shopPublish || []).filter(
    (p) => String(p.shopId) !== shopKey,
  );
  await collection.save();

  const prefix = `${colKey}:`;
  shop.activeListingKeys = shop.activeListingKeys.filter((k) => !String(k).startsWith(prefix));
  shop.featuredListingKeys = shop.featuredListingKeys.filter((k) => !String(k).startsWith(prefix));
  syncLegacyCatalogIds(shop, shop.activeListingKeys);
  await shop.save();
  return shop;
}

/** Validate listing keys belong to collections published on this shop. */
export async function filterValidListingKeys(shopId, tenantId, keys) {
  const unique = [...new Set(keys.map(String).filter(Boolean))];
  if (!unique.length) return [];

  const collections = await loadPublishedCollections(shopId, tenantId);
  const valid = new Set();
  for (const col of collections) {
    for (const k of listingKeysFromCollection(col)) valid.add(k);
  }
  return unique.filter((k) => valid.has(k));
}

/** Shop Catalog save — update active/inactive listings only; never touch collections. */
export async function syncActiveListingKeys(shop, tenantId, activeListingKeys) {
  ensureListingFields(shop);
  const valid = await filterValidListingKeys(shop._id, tenantId, activeListingKeys);
  shop.activeListingKeys = valid;
  shop.featuredListingKeys = (shop.featuredListingKeys || []).filter((k) =>
    valid.includes(String(k)),
  );
  syncLegacyCatalogIds(shop, valid);
  await shop.save();
  return shop;
}

/** @deprecated Legacy catalog-product visibility — prefer syncActiveListingKeys. */
export async function syncShopCatalogVisibility(shop, tenantId, activeCatalogProductIds) {
  const activeIds = [...new Set(activeCatalogProductIds.map(String).filter(Boolean))];
  shop.selectedCatalogProductIds = activeIds.map((id) => new mongoose.Types.ObjectId(id));

  const collections = await Collection.find({
    tenantId,
    status: { $ne: 'archived' },
    'productRefs.catalogProductId': { $in: activeIds },
  });

  const shopKey = String(shop._id);
  for (const collection of collections) {
    if (isCollectionLinkedToShop(collection, shopKey)) continue;
    let nextIds = [...(collection.shopIds || [])];
    if (!nextIds.length && collection.shopId) nextIds = [collection.shopId];
    if (!nextIds.map(String).includes(shopKey)) {
      await publishCollectionToShop(shop._id, tenantId, collection);
    }
  }

  await bootstrapActiveListingKeys(shop, tenantId);
  const allowed = new Set(activeIds);
  shop.activeListingKeys = (shop.activeListingKeys || []).filter((k) => {
    const parsed = parseListingKey(k);
    return parsed && allowed.has(parsed.catalogProductId);
  });
  syncLegacyCatalogIds(shop, shop.activeListingKeys);
  await shop.save();
  return shop;
}

/** Sync which shops a collection is published to (multi-select publish modal). */
export async function syncCollectionPublishTargets(collectionId, tenantId, targetShopIds) {
  let collection = await Collection.findOne({ _id: collectionId, tenantId });
  if (!collection) return null;

  const target = new Set(targetShopIds.map(String).filter(Boolean));

  const linkedShopIds = () => {
    const ids = [...(collection.shopIds || [])];
    if (!ids.length && collection.shopId) ids.push(collection.shopId);
    return ids.map(String);
  };

  const added = [];
  try {
    for (const shopId of target) {
      if (!linkedShopIds().includes(shopId)) {
        await publishCollectionToShop(shopId, tenantId, collection);
        collection = await Collection.findOne({ _id: collectionId, tenantId });
        added.push(shopId);
      }
    }
  } catch (err) {
    for (const shopId of added) {
      try {
        collection = await Collection.findOne({ _id: collectionId, tenantId });
        if (collection) await unpublishCollectionFromShop(shopId, tenantId, collection);
      } catch {
        // Best-effort rollback of shops added in this call.
      }
    }
    throw err;
  }

  for (const shopId of linkedShopIds()) {
    if (!target.has(shopId)) {
      await unpublishCollectionFromShop(shopId, tenantId, collection);
      collection = await Collection.findOne({ _id: collectionId, tenantId });
    }
  }

  return collection;
}

/** Remove a collection from every linked shop (listing keys + publish links). */
export async function unlinkCollectionFromAllShops(collection, tenantId) {
  let current = collection;
  if (!current) return null;

  const linkedShopIds = () => {
    const ids = [...(current.shopIds || [])];
    if (!ids.length && current.shopId) ids.push(current.shopId);
    return ids.map(String);
  };

  for (const shopId of [...linkedShopIds()]) {
    await unpublishCollectionFromShop(shopId, tenantId, current);
    current = await Collection.findOne({ _id: current._id, tenantId });
    if (!current) break;
  }

  return current;
}
