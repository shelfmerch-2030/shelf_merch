import type { UiProduct } from "@/services/mappers";
import { type ArtworkPlacement, type CanvasOpts } from "@/lib/printCoords";
/** Per-product artwork placement — print-area % preferred; canvas % mirrored. */
export type Placement = ArtworkPlacement;
export type MockupUploadItem = {
    catalogProductId: string;
    dataUrl: string;
    /** Optional baked back-view mockup (saved as mockupBackUrl). */
    backDataUrl?: string;
    placement: Placement;
    /** Per print-area placements (Area 1, Area 2, …). */
    placements?: Array<{
        key: string;
        artworkDataUrl?: string;
    } & Placement>;
    designOnlyDataUrl?: string;
    printSpec?: {
        widthIn: number;
        heightIn: number;
        dpi: number;
        widthPx: number;
        heightPx: number;
    };
};
/** Legacy fallback when a product has no inch or % print area yet. */
export declare const DEFAULT_BOX: {
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
};
export declare function productPhysical(p: UiProduct | undefined): any;
export declare function productDpi(p: UiProduct | undefined, areaDpi?: number): number;
/** Resolve placeholder inches + stage pixels for a print area (or primary). */
export declare function resolvePrintAreaStage(p: UiProduct, canvasOpts?: CanvasOpts, areaKey?: string | null): {
    area: any;
    phys: any;
    ph: any;
    stage: any;
    dpi: number;
};
export declare function placementKey(prod: UiProduct, idx: number): string;
/** Catalog `key` or slug(label) — not unique when two Front areas share `key: "front"`. */
export declare function printAreaBaseKey(area: {
    key?: string;
    label?: string;
} | null | undefined, index?: number): string;
/**
 * Stable identity for a print area. When several areas share the same catalog
 * `key` (Edit Catalog used to assign `front` to every front placeholder), later
 * ones are disambiguated as `front__1`, `front__2`, … so Design Swag can show
 * all of them. The first occurrence keeps the original key for existing drafts.
 */
export declare function printAreaStableKey(area: {
    key?: string;
    label?: string;
} | null | undefined, index?: number, siblings?: Array<{
    key?: string;
    label?: string;
} | null | undefined> | null): string;
/** Stable key using the product's full print-area list for uniqueness. */
export declare function printAreaKey(p: UiProduct | undefined, area: {
    key?: string;
    label?: string;
} | null | undefined, index?: number): string;
/** Usable print areas from catalog (inches or legacy box %). */
export declare function listPrintAreas(p: UiProduct | undefined): any[];
export type ProductViewKey = "front" | "back" | "left" | "right";
/** True when the asset is the catalog marketing photo, not a dedicated garment mask. */
export declare function isPhotoProductImage(p: UiProduct | undefined, url: string | undefined): boolean;
/** Which garment view a print area belongs to (from mockup URL and/or key/label). */
export declare function printAreaViewKey(p: UiProduct | undefined, area: {
    key?: string;
    label?: string;
    mockupImageUrl?: string;
} | null | undefined): ProductViewKey;
/** True only when a print area is explicitly tied to a dedicated side mockup asset. */
export declare function printAreaUsesDedicatedSideView(p: UiProduct | undefined, area: {
    key?: string;
    label?: string;
    mockupImageUrl?: string;
} | null | undefined): boolean;
/** Views available for a product (always front; others when mask/stage/areas exist). */
export declare function listProductViews(p: UiProduct | undefined): ProductViewKey[];
/** Print areas that belong to a garment view. */
export declare function listPrintAreasForView(p: UiProduct | undefined, view: ProductViewKey): any[];
/** Production mask / stage image for a garment view. */
export declare function designImgUrlForView(p: UiProduct | undefined, view?: ProductViewKey): string;
/** Draft / upload key for artwork on one print area of one product. */
export declare function areaPlacementKey(prod: UiProduct, idx: number, areaKey: string): string;
export declare function primaryAreaKey(p: UiProduct): string;
export declare function resolveMediaSrc(url: string | undefined): string;
/** Production mask used behind artwork in design previews and baked mockups.
 * Front falls back to the Shopify primary when no mask was uploaded. */
export declare function designImgUrl(p: UiProduct, areaKey?: string | null): string;
/** Same-origin path compare — ignores scheme/host so catalog vs collection refs match. */
/**
 * Production garment image for live colour tinting. Prefers a dedicated mask /
 * stage / print-area mockup; falls back to the Shopify primary when no mask was uploaded.
 */
export declare function resolveGarmentMaskUrl(p: UiProduct | undefined, areaKey?: string | null): string;
/**
 * Pick a print area. When `areaKey` is set, prefer that key/label; otherwise
 * match mask/base mockup, else first usable area.
 */
export declare function pickPrintArea(p: UiProduct, areaKey?: string | null): any;
export declare function productHasPrintArea(p: UiProduct): boolean;
/** Default artwork placement — centered in the inch print area. */
export declare function defaultPlacement(ep: UiProduct, artAspect?: number, areaKey?: string | null): Placement;
/** Load an image for canvas compositing (CORS-safe via media proxy when needed). */
export declare function loadImageEl(src: string, forCanvas?: boolean): Promise<HTMLImageElement>;
/** Bake warp + fabric texture + sheen into the artwork (placement-independent). */
export declare function buildRealisticArtwork(artImg: HTMLImageElement, group: string | undefined): HTMLCanvasElement | HTMLImageElement;
/** Resolve Konva placement for bake/upload — primary area, with legacy product-key fallback. */
export declare function resolvePlacementForBake(product: UiProduct, placements: Record<string, Placement>, idx: number, areaKey?: string | null): Placement;
/** All area placements set for a product in the wizard draft. */
export declare function collectAreaPlacements(product: UiProduct, placements: Record<string, Placement>, idx: number, areaArts?: Record<string, {
    preview?: string;
}>): Array<{
    key: string;
    artworkDataUrl?: string;
} & Placement>;
/**
 * Layers for live colour-tint / storefront composite from saved product refs.
 * Per-area `artworkUrl` is the source of truth (the placeholder chosen in the
 * artwork step). Collection art is a single-area fallback only when nothing
 * was assigned — it must not also land on the primary placeholder.
 */
export declare function resolveProductArtworkLayers(product: UiProduct, fallbackArtworkUrl?: string | null): Array<{
    artUrl: string;
    placement: Placement;
    areaKey: string;
}>;
/**
 * Collection-card / design preview props.
 * Persisted product mockups are the approved default appearance. Per-area
 * references remain available for intentional alternate views and colour tints.
 */
export declare function savedDesignPreview(product: UiProduct, collectionArtworkUrl?: string | null): {
    artworkUrl?: string;
    preferBakedMockup: boolean;
};
/** Bake white default mockups for a picked product list (wizard generate flow). */
export declare function bakeMockupsForProducts(pickedIndices: number[], catalog: UiProduct[], artUrl: string, placements: Record<string, Placement>, options?: {
    resolveAreaKey?: (product: UiProduct) => string;
}): Promise<MockupUploadItem[]>;
/** Flatten mask + one or more area artworks into one PNG data URL (preview quality). */
export declare function bakeMockupLayers(ep: UiProduct, layers: Array<{
    artUrl: string;
    placement: Placement | null;
    areaKey: string;
}>, size?: number, requireProductBase?: boolean, view?: ProductViewKey): Promise<string>;
/**
 * Build bake layers for print areas that actually have artwork.
 * The library image is used only when this product has no per-area assignment,
 * and then only on the primary placeholder — same rule as the artwork step.
 */
export declare function collectBakeLayers(product: UiProduct, placements: Record<string, Placement>, areaArts: Record<string, {
    preview: string;
}>, idx: number, fallbackArtUrl?: string | null): Array<{
    artUrl: string;
    placement: Placement;
    areaKey: string;
}>;
/** Flatten mask + placed artwork into one PNG data URL (preview quality). */
export declare function bakeMockup(ep: UiProduct, artUrl: string, placement: Placement | null, size?: number, requireProductBase?: boolean, areaKey?: string | null): Promise<string>;
/**
 * Design-only production PNG: transparent canvas sized to inches × DPI.
 * Draws artwork clipped to the print placeholder — no garment/mockup.
 */
export declare function exportDesignOnly(ep: UiProduct, artUrl: string, placement: Placement | null, areaKey?: string | null): Promise<{
    dataUrl: string;
    widthPx: number;
    heightPx: number;
    widthIn: number;
    heightIn: number;
    dpi: number;
}>;
export declare function bakeTintedMockupLayers(ep: UiProduct, layers: Array<{
    artUrl: string;
    placement: Placement | null;
    areaKey: string;
}>, tintHex: string, size?: number, 
/** Explicit view mask (back/side). When omitted, derived from the first layer area or front. */
maskUrlOverride?: string): Promise<string>;
/**
 * Live realistic mockup recoloured to a garment colour. Recolours the
 * transparent production mask to `tintHex` (multiply keeps the fabric's
 * folds/shadows, then clip back to the mask alpha so the background stays
 * clear) and bakes the warped/blended artwork on top — the same realistic
 * path as bakeMockup, but tinted per colour swatch. Returns "" when there is
 * no usable garment mask to recolour.
 */
export declare function bakeTintedMockup(ep: UiProduct, artUrl: string, placement: Placement | null, tintHex: string, size?: number, areaKey?: string | null): Promise<string>;
/** Resolved photo/mockup thumbnail for a product or baked design. */
export declare function productThumbUrl(p: UiProduct, branded?: boolean): string;
