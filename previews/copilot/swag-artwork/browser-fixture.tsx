import React from 'react';
import { createRoot } from 'react-dom/client';
import { CollectionInlineCard } from '../../../apps/web/src/features/swag/CollectionInlineCard';
import { DesignedProductThumb } from '../../../apps/web/src/features/swag/DesignedProductThumb';
import { savedDesignPreview } from '../../../apps/web/src/features/swag/mockup-bake';
import { ProductThumb } from '../../../apps/web/src/features/shops/ProductThumb';
import { SwagSavedPreviews } from '../../../apps/web/src/features/copilot/SwagSavedPreviews';
import { mapCatalogProduct, mapCollection } from '../../../apps/web/src/services/mappers';
import { toFeaturedPreviewProduct } from '../../../apps/web/src/features/shops/ShopHomePreview';

// Synthetic pixel fixture: verifies actual browser URL selection/loading, not
// production artwork appearance or an automatic artwork-application flow.
const png = '/synthetic-hoodie.png?asset=';
let root: ReturnType<typeof createRoot>;
export function renderFixtures(version = 'v1') {
  if (!root) {
    document.getElementById('root')!.style.display = 'none';
    const container = document.createElement('main'); container.id = 'mockup-browser-fixture'; document.body.append(container);
    root = createRoot(container);
  }
  const products = ['Bliss Mug', 'Corporate Polo', 'Cozy Mug'].map((name, index) => mapCatalogProduct({
    _id: `fixture-${index}`, name, group: 'polo', basePriceInr: 500, primaryImageUrl: `${png}catalog-${index}`, maskImageUrl: `${png}mask-${index}`,
    physicalDimensions: { width: 20, height: 24 }, printAreas: [{ key: 'front', widthIn: 2, heightIn: 2 }, { key: 'back', widthIn: 3, heightIn: 3 }],
  }));
  const value = mapCollection({ _id: 'isolated-fixture', name: `Saved mockup consistency ${version}`, artworkUrl: `${png}shared-logo`,
    productRefs: products.map(product => ({ catalogProductId: product.id, name: product.nm, mockupUrl: `${png}saved-${product.id}-${version}`,
      placements: [{ key: 'front', xPct: 50, yPct: 50, wPct: 20, rot: 0, artworkUrl: `${png}per-area-logo` }] })),
  }, '', new Map(products.map(product => [product.id!, product])));
  root.render(<><h1>Synthetic saved image consistency</h1>
    <section data-surface="collections"><h2>Collection / Published Collections</h2><CollectionInlineCard collection={value} /></section>
    <section data-surface="designer"><h2>Saved design review</h2><div style={{ display: 'flex' }}>{value.products.map(product => <div key={product.id} style={{ width: 150, height: 150 }}><DesignedProductThumb product={product} {...savedDesignPreview(product, value.artworkUrl)} /></div>)}</div></section>
    <section data-surface="management"><h2>Shop management thumbnails</h2><div style={{ display: 'flex' }}>{value.products.map(product => <div key={product.id} style={{ width: 150, height: 150 }}><ProductThumb product={product} branded /></div>)}</div></section>
    <section data-surface="copilot"><h2>Copilot saved previews</h2><SwagSavedPreviews source={{ products: value.products.map(product => ({ id: product.id, name: product.nm })), designs: value.products.map(product => ({ productId: product.id, mockupUrl: product.mockupUrl })) }} /></section>
  </>);
  return { version, expected: value.products.map(product => product.mockupUrl), storefrontHome: value.products.map(product => toFeaturedPreviewProduct(product).imageUrl) };
}
