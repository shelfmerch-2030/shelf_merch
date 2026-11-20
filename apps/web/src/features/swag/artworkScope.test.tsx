// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mapCatalogProduct, mapCollection } from '@/services/mappers';
import { CollectionInlineCard } from './CollectionInlineCard';
import { DesignedProductThumb } from './DesignedProductThumb';
import { collectBakeLayers, resolveProductArtworkLayers, savedDesignPreview, bakeMockupLayers } from './mockup-bake';
import { bakeCollectionDesignMockups } from './bakeCollectionDesign';
vi.mock('./mockup-bake', async original => ({ ...await original<typeof import('./mockup-bake')>(),
  bakeMockupLayers: vi.fn().mockResolvedValue('data:image/png;base64,baked'),
  exportDesignOnly: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,print', widthIn: 2, heightIn: 2, dpi: 300, widthPx: 600, heightPx: 600 }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const catalog = mapCatalogProduct({ _id: 'p1', name: 'Brandable polo', maskImageUrl: '/catalog.png', basePriceInr: 500,
  physicalDimensions: { width: 20, height: 24 }, printAreas: [{ key: 'front', xIn: 5, yIn: 5, widthIn: 2, heightIn: 2 }] });
const collection = mapCollection({ _id: 'collection', name: 'Scoped design', artworkUrl: '/shared-new-logo.png',
  productRefs: [{ catalogProductId: 'p1', name: catalog.nm, inheritArtwork: false }] }, '', new Map([['p1', catalog]]));
const product = collection.products[0];
it('maps explicit unbranded intent and suppresses shared artwork in cards and product detail', () => {
  expect(product.inheritArtwork).toBe(false);
  const card = render(<CollectionInlineCard collection={collection} />);
  expect(screen.queryByAltText('Artwork')).not.toBeInTheDocument();
  expect(card.container.querySelector('img[src="/shared-new-logo.png"]')).toBeNull();
  card.unmount();
  const detail = render(<DesignedProductThumb product={product} artworkUrl={collection.artworkUrl} />);
  expect(detail.container.querySelector('img[src="/shared-new-logo.png"]')).toBeNull();
  expect(savedDesignPreview(product, collection.artworkUrl).artworkUrl).toBeUndefined();
});
it('keeps legacy shared-logo inheritance unchanged when the explicit policy is absent', () => {
  expect(resolveProductArtworkLayers(catalog, '/legacy-logo.png')).toHaveLength(1);
  expect(resolveProductArtworkLayers(catalog, '/legacy-logo.png')[0].artUrl).toBe('/legacy-logo.png');
  expect(resolveProductArtworkLayers(product, '/shared-new-logo.png')).toEqual([]);
});
it('the dashboard baker does not apply shared artwork to explicitly excluded products', () => {
  expect(collectBakeLayers(product, {}, {}, 0, '/shared-new-logo.png')).toEqual([]);
  expect(collectBakeLayers(product, {}, { 'p1::front': { preview: '/deliberately-added-logo.png' } }, 0, '/shared-new-logo.png'))
    .toEqual([expect.objectContaining({ areaKey: 'front', artUrl: '/deliberately-added-logo.png' })]);
});
it('saving a mixed explicit design does not fail because an excluded brandable product has no artwork', async () => {
  const other = { ...product, id: 'p2' };
  const result = await bakeCollectionDesignMockups({ catalog: [product, other], draft: { picked: [0,1], placements: {},
    areaArts: { 'p1::front': { name: 'Deliberate logo', preview: '/own-logo.png' } }, art: { name: 'Library', preview: '/shared-new-logo.png' } } });
  expect(result.map(row => row.catalogProductId)).toEqual(['p1']);
  expect(bakeMockupLayers).toHaveBeenCalledTimes(2); // selected product front/back only
});
