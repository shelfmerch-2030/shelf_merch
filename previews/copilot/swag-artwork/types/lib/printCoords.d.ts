/**
 * Inch-accurate print-area coordinates — single source of truth for admin,
 * designer, export, and mockup composite. Physical inches drive geometry;
 * editor pixels and print-DPI pixels are derived.
 *
 * See docs/print-coordinate-systems.md
 */
export declare const CANVAS_WIDTH = 800;
export declare const CANVAS_HEIGHT = 600;
export declare const CANVAS_PADDING = 40;
export declare const EFFECTIVE_W: number;
export declare const EFFECTIVE_H: number;
/** Flat garment / product shot that fills most of the mockup frame. */
export declare const DEFAULT_PHYSICAL: {
    readonly width: 20;
    readonly height: 24;
    readonly length: 18;
};
/** Typical adult tee chest width — used for on-canvas scale guidance. */
export declare const TYPICAL_CHEST_WIDTH_IN = 18;
export declare const DEFAULT_DPI = 300;
export declare const DEFAULT_PLACEHOLDER_IN = 6;
/** Warn in the designer when artwork effective DPI falls below this. */
export declare const MIN_EFFECTIVE_DPI = 300;
export type PhysicalDimensions = {
    width: number;
    height: number;
    length?: number;
};
export type PlaceholderInches = {
    id?: string;
    key?: string;
    name?: string;
    label?: string;
    xIn: number;
    yIn: number;
    widthIn: number;
    heightIn: number;
    rotationDeg?: number;
    /** Visual-only scale; does not change print inches or export size. */
    scale?: number;
    /** When true, transform updates `scale` only — inches stay fixed. */
    lockSize?: boolean;
    shapeType?: "rect" | "polygon";
    polygonPoints?: Array<{
        xIn: number;
        yIn: number;
    }>;
};
export type StagePixels = {
    x: number;
    y: number;
    w: number;
    h: number;
    pxPerInch: number;
};
/**
 * Where the product mockup image sits on the editor stage, and how inches map
 * onto that displayed image (image size is never shrunk by physical dims).
 */
export type PhysicalFrameStage = {
    frameX: number;
    frameY: number;
    frameW: number;
    frameH: number;
    /** px per inch along X (frameW / physicalWidth). */
    pxPerInchX: number;
    /** px per inch along Y (frameH / physicalHeight). */
    pxPerInchY: number;
    /** min(pxPerInchX, pxPerInchY) — for DPI warnings / uniform helpers. */
    pxPerInch: number;
    padding: number;
    canvasWidth: number;
    canvasHeight: number;
};
export type CanvasOpts = {
    canvasWidth?: number;
    canvasHeight?: number;
    padding?: number;
    /** When set, inches map onto the object-fit rect of this image. */
    imageNaturalWidth?: number;
    imageNaturalHeight?: number;
    /** How the mockup image fills the padded canvas. Default contain. */
    imageFit?: "contain" | "cover";
};
/** object-fit: contain/cover rect for a mockup inside the padded canvas. */
export declare function imageContainRect(imageNaturalWidth: number, imageNaturalHeight: number, opts?: CanvasOpts): {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function resolvePhysical(phys?: Partial<PhysicalDimensions> | null): PhysicalDimensions;
/**
 * Physical frame for a view. Side views (left/right) use length × height
 * so the inch grid matches the garment silhouette.
 */
export declare function physicalFrameForView(phys: Partial<PhysicalDimensions> | null | undefined, viewKey?: string): PhysicalDimensions;
export declare function calculatePxPerInch(physW: number, physH: number, effectiveW?: number, effectiveH?: number): number;
export declare function inchesToPx(inches: number, pxPerInch: number): number;
export declare function pxToInches(px: number, pxPerInch: number): number;
/** Production export size: inches × print DPI (not editor PX_PER_INCH). */
export declare function inchesToPrintPixels(inches: number, dpi?: number): number;
export declare function printExportSize(widthIn: number, heightIn: number, dpi?: number): {
    widthPx: number;
    heightPx: number;
};
/** Scale factor from editor stage pixels → print-DPI canvas. */
export declare function editorToPrintDrawScale(dpi: number, pxPerInch: number): number;
/**
 * Displayed mockup bounds on the stage. The product image keeps its natural
 * contain/cover size; physical inches map onto that rect (widthIn/physW of image width).
 */
export declare function physicalFrameStageRect(phys: Partial<PhysicalDimensions> | null | undefined, opts?: CanvasOpts): PhysicalFrameStage;
export declare function placeholderToStagePixels(ph: PlaceholderInches, phys: Partial<PhysicalDimensions> | null | undefined, opts?: CanvasOpts): StagePixels;
/** Inverse: stage top-left + size → inches (ignores visual scale for size). */
export declare function stagePixelsToPlaceholderInches(stage: {
    x: number;
    y: number;
    w: number;
    h: number;
}, phys: Partial<PhysicalDimensions> | null | undefined, opts?: CanvasOpts, existing?: Pick<PlaceholderInches, "scale" | "lockSize" | "rotationDeg">): Pick<PlaceholderInches, "xIn" | "yIn" | "widthIn" | "heightIn">;
export declare function defaultCenteredPlaceholder(phys: Partial<PhysicalDimensions> | null | undefined, sizeIn?: number): Pick<PlaceholderInches, "xIn" | "yIn" | "widthIn" | "heightIn">;
/** Derived % box for legacy CSS overlays (relative to full canvas). */
export declare function placeholderToLegacyBoxPct(ph: PlaceholderInches, phys: Partial<PhysicalDimensions> | null | undefined, opts?: CanvasOpts): {
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
};
/**
 * Normalize a stored print area (inches preferred; legacy % / cm supported).
 * Always returns inch fields as the source of truth.
 */
export declare function normalizePlaceholder(raw: Record<string, unknown> | null | undefined, phys: Partial<PhysicalDimensions> | null | undefined): PlaceholderInches & {
    box: {
        xPct: number;
        yPct: number;
        widthPct: number;
        heightPct: number;
    };
    maxWidthCm: number;
    maxHeightCm: number;
};
/**
 * Effective print DPI of artwork given its natural pixel width and on-canvas
 * display width in editor pixels.
 * effectiveDpi = naturalWidth / displayWidthInches
 */
export declare function effectiveArtworkDpi(imageNaturalWidth: number, displayWidthPx: number, pxPerInch: number): number;
/**
 * Place a print-DPI design (or editor artwork) onto a mockup bitmap using inches.
 * Returns top-left + size in mockup image pixels (fill into placeholder).
 */
export declare function designPlacementOnMockup(args: {
    mockupWidthPx: number;
    mockupHeightPx: number;
    placeholder: PlaceholderInches;
    physicalDimensions?: Partial<PhysicalDimensions> | null;
    viewKey?: string;
}): {
    x: number;
    y: number;
    w: number;
    h: number;
    pxPerInch: number;
    rotationDeg: number;
};
/**
 * Map a point in print-area local space (origin = unrotated top-left) into
 * parent space. Rotation matches Konva / CSS `transform-origin: top left`.
 */
export declare function printLocalToParent(localX: number, localY: number, originX: number, originY: number, rotationDeg?: number): {
    x: number;
    y: number;
};
/** Inverse of `printLocalToParent`. */
export declare function parentToPrintLocal(parentX: number, parentY: number, originX: number, originY: number, rotationDeg?: number): {
    x: number;
    y: number;
};
export declare function cmToIn(cm: number): number;
export declare function inToCm(inches: number): number;
/**
 * Artwork placement. Print-area % (`printCxPct` / `printCyPct` / `printWPct`)
 * is the source of truth; canvas % is mirrored for legacy CSS thumbs.
 */
export type ArtworkPlacement = {
    printCxPct?: number;
    printCyPct?: number;
    printWPct?: number;
    xPct: number;
    yPct: number;
    wPct: number;
    rot: number;
};
export type PrintStageRect = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function hasPrintRelativePlacement(pl: Partial<ArtworkPlacement> | null | undefined): pl is ArtworkPlacement & {
    printCxPct: number;
    printCyPct: number;
    printWPct: number;
};
/** Resolve artwork center/size on the editor stage from a placement. */
export declare function placementToStagePixels(pl: ArtworkPlacement, printStage: PrintStageRect, canvasW?: number, canvasH?: number): {
    cx: number;
    cy: number;
    w: number;
    rot: number;
};
/** Persist placement relative to the print area, with canvas % mirrored. */
export declare function stagePixelsToArtworkPlacement(cx: number, cy: number, w: number, rot: number, printStage: PrintStageRect, canvasW?: number, canvasH?: number): ArtworkPlacement;
/** Fractions of the print plate (0–1) — used by bake/export. */
export declare function placementPrintFractions(pl: ArtworkPlacement, printStage: PrintStageRect, canvasW?: number, canvasH?: number): {
    cx: number;
    cy: number;
    w: number;
    rot: number;
};
