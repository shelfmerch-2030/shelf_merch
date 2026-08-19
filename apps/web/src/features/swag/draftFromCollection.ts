import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiCollection, UiProduct } from "@/services/mappers";
import {
  areaPlacementKey,
  listPrintAreas,
  placementKey,
  primaryAreaKey,
  printAreaKey,
  type Placement,
} from "./mockup-bake";
import type { SwagDraft } from "./swagDraft";

/** Build wizard draft state from an existing draft collection. */
export function draftFromCollection(collection: UiCollection, catalog: UiProduct[]): SwagDraft {
  const picked = collection.products
    .map((p) => catalog.findIndex((c) => c.id && c.id === p.id))
    .filter((i) => i >= 0);

  const artworkUrl = resolveMediaUrl(collection.artworkUrl);
  const step: SwagDraft["step"] = picked.length === 0 ? 1 : 2;

  const placements: Record<string, Placement> = {};
  collection.products.forEach((product, idx) => {
    const catalogIndex = catalog.findIndex((c) => c.id && c.id === product.id);
    const draftIdx = catalogIndex >= 0 ? picked.indexOf(catalogIndex) : idx;
    const i = draftIdx >= 0 ? draftIdx : idx;
    const catalogProduct = catalogIndex >= 0 ? catalog[catalogIndex] : product;
    const productKey = placementKey(catalogProduct, i);
    const areas = listPrintAreas(catalogProduct);
    const areaMap = product.areaPlacements;

    if (areaMap && Object.keys(areaMap).length) {
      for (const [areaKey, pl] of Object.entries(areaMap)) {
        placements[areaPlacementKey(catalogProduct, i, areaKey)] = pl;
      }
      const primary = primaryAreaKey(catalogProduct);
      if (areaMap[primary]) placements[productKey] = areaMap[primary];
      else if (product.placement) placements[productKey] = product.placement;
      return;
    }

    if (product.placement) {
      const primary = primaryAreaKey(catalogProduct);
      placements[areaPlacementKey(catalogProduct, i, primary)] = product.placement;
      placements[productKey] = product.placement;
      // If catalog has multiple areas but only one saved placement, seed primary only.
      if (areas.length > 1) {
        areas.forEach((a, ai) => {
          const key = printAreaKey(catalogProduct, a, ai);
          if (key === primary) return;
          // leave unset so user can place per area
        });
      }
    }
  });

  return {
    step: collection.name.trim() ? step : 0,
    name: collection.name,
    picked,
    art: artworkUrl ? { preview: artworkUrl, name: "Existing artwork.png" } : null,
    areaArts: {},
    placements,
    placementEpoch: 0,
  };
}
