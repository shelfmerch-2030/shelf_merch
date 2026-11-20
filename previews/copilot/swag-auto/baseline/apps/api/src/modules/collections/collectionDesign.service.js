import crypto from 'node:crypto';
import { Collection } from './collection.model.js';
import { isCollectionLinkedToAnyShop, mergeProductRefsPreservingDesign } from './collectionQueries.js';
import { ApiError } from '../../utils/errors.js';

/** Shared dashboard design persistence; publishing remains a separate operation. */
export async function createCollectionDesign({ tenantId, createdBy, input, session = null }) {
  const shopId = input.shopId || null;
  const [collection] = await Collection.create([{
    tenantId, shopId, shopIds: shopId ? [shopId] : [],
    code: `C${crypto.randomInt(100_000_000, 999_999_999)}`,
    name: input.name, productRefs: input.productRefs,
    preferredColors: input.preferredColors || [], artworkUrl: input.artworkUrl || '',
    status: input.artworkUrl ? 'ready' : 'draft', createdBy,
    isShopSpecific: input.isShopSpecific || false,
  }], { session });
  return collection;
}

export function updateCollectionDesign(collection, input) {
  if (input.name || input.productRefs) {
    if (collection.status !== 'draft' && !(collection.status === 'ready' && !isCollectionLinkedToAnyShop(collection))) {
      throw new ApiError(400, 'Only draft collections can be edited', 'COLLECTION_NOT_DRAFT');
    }
    if (input.name) collection.name = input.name;
    if (input.productRefs) collection.productRefs = mergeProductRefsPreservingDesign(collection.productRefs, input.productRefs);
    if (input.removeArtwork === true) {
      collection.artworkUrl = '';
      collection.productRefs = collection.productRefs.map(ref => ({
        catalogProductId: ref.catalogProductId, brand: ref.brand, name: ref.name, group: ref.group,
      }));
      collection.status = 'draft';
    }
  }
}
