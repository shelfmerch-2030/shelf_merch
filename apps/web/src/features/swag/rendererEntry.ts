// Private rendering bundle; never mounted in the customer application.
// Calls the exact mapper, Add Artwork default selector and Save Design baker.
import { mapCatalogProduct, type UiProduct } from "@/services/mappers";
import { preferredDefaultAreaKey } from "./wizard/artworkStepModel";
import { areaPlacementKey, designImgUrl, designImgUrlForView, pickPrintArea, printAreaViewKey, resolvePrintAreaStage, loadImageEl } from "./mockup-bake";
import { bakeCollectionDesignMockups } from "./bakeCollectionDesign";

type Raw = Parameters<typeof mapCatalogProduct>[0];
export function inspect(products: Raw[]) {
  return products.map(raw => {
    const product = mapCatalogProduct(raw);
    const areaKey = preferredDefaultAreaKey(product);
    const area = pickPrintArea(product, areaKey);
    const frame = resolvePrintAreaStage(product, {}, areaKey).phys;
    const rawArea = raw.printAreas?.find((row: Record<string, unknown>) => row.key === area?.key);
    const view = printAreaViewKey(product, area);
    const pixels = Number(area?.widthIn) * Number(area?.heightIn) * (Number(area?.dpi || product.dpi) || 300) ** 2;
    const supported = Boolean(area && area.widthIn! > 0 && area.heightIn! > 0 && product.physicalDimensions
      && Number.isFinite(area.xIn) && Number.isFinite(area.yIn) && pixels > 0 && pixels <= 16_000_000
      && area.xIn! >= 0 && area.yIn! >= 0 && area.xIn! + area.widthIn! <= frame.width
      && area.yIn! + area.heightIn! <= frame.height
      && ['front', 'back'].includes(view) && designImgUrl(product, areaKey)
      && (!area.methods?.length || area.methods.some(method => ['dtf', 'screen_print', 'sublimation', 'uv_print'].includes(method)))
      && rawArea?.shapeType !== 'polygon');
    return { productId: product.id!, name: product.nm, areaKey, areaLabel: area?.label || areaKey, view,
      // Exactly the priority used inside bakeMockupLayers, including when an
      // area-specific image differs from the product's main view image.
      baseUrl: designImgUrlForView(product, view) || designImgUrl(product, areaKey), supported,
      reason: supported ? null : "This product needs a supported rectangular print area, dimensions and product image. Use Edit in Designer." };
  });
}

export async function render(productRaw: Raw, artwork: string, assets: Record<string, string>) {
  const [target] = inspect([productRaw]);
  if (!target.supported) throw new Error(target.reason!);
  const product = mapCatalogProduct(productRaw);
  // Map first, then replace verified asset URLs with server-read bytes. No URL
  // from the job is fetched by this browser or interpreted as a navigation.
  for (const key of ['photoUrl', 'imgUrl', 'maskImageUrl', 'baseImageUrl', 'maskBackImageUrl', 'baseBackImageUrl',
    'maskLeftImageUrl', 'baseLeftImageUrl', 'maskRightImageUrl', 'baseRightImageUrl'] as const) {
    if (product[key]) product[key] = assets[product[key]!] || undefined;
  }
  product.imageUrls = product.imageUrls?.map(url => assets[url]).filter(Boolean);
  product.printAreas = product.printAreas?.map(area => ({ ...area, mockupImageUrl: area.mockupImageUrl ? assets[area.mockupImageUrl] : undefined }));
  const images = await Promise.all([loadImageEl(artwork), loadImageEl(assets[target.baseUrl])]);
  if (images.some(image => image.naturalWidth * image.naturalHeight > 16_000_000)) throw new Error('Image exceeds rendering limit');
  const key = areaPlacementKey(product, 0, target.areaKey);
  // Same Add Artwork draft as the dashboard: one default placeholder, no
  // invented placement. collectBakeLayers resolves the dashboard default.
  const result = await bakeCollectionDesignMockups({ catalog: [product as UiProduct], draft: {
    picked: [0], placements: {}, areaArts: { [key]: { name: 'Approved artwork', preview: artwork } }, art: null,
  } });
  if (result.length !== 1 || !result[0].designOnlyDataUrl || result[0].placements?.length !== 1) throw new Error('Incomplete saved design output');
  return { ...result[0], target };
}
