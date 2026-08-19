/**
 * Inch-accurate print-area coordinates — mirror of apps/web/src/lib/printCoords.ts.
 * Keep formulas identical so admin, designer, export, and server never drift.
 */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const CANVAS_PADDING = 40;
export const EFFECTIVE_W = CANVAS_WIDTH - 2 * CANVAS_PADDING;
export const EFFECTIVE_H = CANVAS_HEIGHT - 2 * CANVAS_PADDING;

export const DEFAULT_PHYSICAL = { width: 20, height: 24, length: 18 };
export const TYPICAL_CHEST_WIDTH_IN = 18;
export const DEFAULT_DPI = 300;
export const DEFAULT_PLACEHOLDER_IN = 6;

export function resolvePhysical(phys) {
  return {
    width: positive(phys?.width, DEFAULT_PHYSICAL.width),
    height: positive(phys?.height, DEFAULT_PHYSICAL.height),
    length: positive(phys?.length, DEFAULT_PHYSICAL.length),
  };
}

export function physicalFrameForView(phys, viewKey) {
  const p = resolvePhysical(phys);
  const key = String(viewKey || '').toLowerCase();
  if (key === 'left' || key === 'right' || key.includes('side')) {
    return { width: p.length ?? DEFAULT_PHYSICAL.length, height: p.height, length: p.length };
  }
  return p;
}

export function calculatePxPerInch(physW, physH, effectiveW = EFFECTIVE_W, effectiveH = EFFECTIVE_H) {
  const w = Math.max(Number(physW) || 0, 1e-6);
  const h = Math.max(Number(physH) || 0, 1e-6);
  return Math.min(effectiveW / w, effectiveH / h);
}

export function inchesToPx(inches, pxPerInch) {
  return inches * pxPerInch;
}

export function pxToInches(px, pxPerInch) {
  return px / Math.max(pxPerInch, 1e-6);
}

export function inchesToPrintPixels(inches, dpi = DEFAULT_DPI) {
  return Math.round(Number(inches) * Math.max(Number(dpi) || DEFAULT_DPI, 1));
}

export function printExportSize(widthIn, heightIn, dpi = DEFAULT_DPI) {
  return {
    widthPx: inchesToPrintPixels(widthIn, dpi),
    heightPx: inchesToPrintPixels(heightIn, dpi),
  };
}

export function editorToPrintDrawScale(dpi, pxPerInch) {
  return Math.max(Number(dpi) || DEFAULT_DPI, 1) / Math.max(pxPerInch, 1e-6);
}

/** object-fit: contain rect for a mockup inside the padded canvas. */
export function imageContainRect(imageNaturalWidth, imageNaturalHeight, opts = {}) {
  const canvasWidth = opts.canvasWidth ?? CANVAS_WIDTH;
  const canvasHeight = opts.canvasHeight ?? CANVAS_HEIGHT;
  const padding = opts.padding ?? CANVAS_PADDING;
  const effW = canvasWidth - 2 * padding;
  const effH = canvasHeight - 2 * padding;
  const iw = Math.max(Number(imageNaturalWidth) || 1, 1);
  const ih = Math.max(Number(imageNaturalHeight) || 1, 1);
  const scale = Math.min(effW / iw, effH / ih);
  const w = iw * scale;
  const h = ih * scale;
  return {
    x: padding + (effW - w) / 2,
    y: padding + (effH - h) / 2,
    w,
    h,
  };
}

/**
 * Displayed mockup bounds. Image keeps natural contain size; inches map onto it.
 */
export function physicalFrameStageRect(phys, opts = {}) {
  const canvasWidth = opts.canvasWidth ?? CANVAS_WIDTH;
  const canvasHeight = opts.canvasHeight ?? CANVAS_HEIGHT;
  const padding = opts.padding ?? CANVAS_PADDING;
  const frame = resolvePhysical(phys);
  const host =
    opts.imageNaturalWidth && opts.imageNaturalHeight
      ? imageContainRect(opts.imageNaturalWidth, opts.imageNaturalHeight, opts)
      : {
          x: padding,
          y: padding,
          w: canvasWidth - 2 * padding,
          h: canvasHeight - 2 * padding,
        };
  const pxPerInchX = host.w / Math.max(frame.width, 1e-6);
  const pxPerInchY = host.h / Math.max(frame.height, 1e-6);
  return {
    frameX: host.x,
    frameY: host.y,
    frameW: host.w,
    frameH: host.h,
    pxPerInchX,
    pxPerInchY,
    pxPerInch: Math.min(pxPerInchX, pxPerInchY),
    padding,
    canvasWidth,
    canvasHeight,
  };
}

export function placeholderToStagePixels(ph, phys, opts = {}) {
  const { frameX, frameY, pxPerInchX, pxPerInchY, pxPerInch } = physicalFrameStageRect(phys, opts);
  const visualScale = ph.scale && ph.scale > 0 ? ph.scale : 1;
  return {
    x: frameX + ph.xIn * pxPerInchX,
    y: frameY + ph.yIn * pxPerInchY,
    w: ph.widthIn * pxPerInchX * visualScale,
    h: ph.heightIn * pxPerInchY * visualScale,
    pxPerInch,
  };
}

export function placeholderToLegacyBoxPct(ph, phys, opts = {}) {
  const canvasWidth = opts.canvasWidth ?? CANVAS_WIDTH;
  const canvasHeight = opts.canvasHeight ?? CANVAS_HEIGHT;
  const stage = placeholderToStagePixels(ph, phys, opts);
  return {
    xPct: roundPct((stage.x / canvasWidth) * 100),
    yPct: roundPct((stage.y / canvasHeight) * 100),
    widthPct: roundPct((stage.w / canvasWidth) * 100),
    heightPct: roundPct((stage.h / canvasHeight) * 100),
  };
}

export function defaultCenteredPlaceholder(phys, sizeIn = DEFAULT_PLACEHOLDER_IN) {
  const frame = resolvePhysical(phys);
  const side = Math.min(sizeIn, frame.width, frame.height);
  return {
    xIn: roundIn((frame.width - side) / 2),
    yIn: roundIn((frame.height - side) / 2),
    widthIn: roundIn(side),
    heightIn: roundIn(side),
  };
}

export function normalizePlaceholder(raw, phys) {
  const frame = resolvePhysical(phys);
  const box = raw?.box || {};
  let xIn = num(raw?.xIn);
  let yIn = num(raw?.yIn);
  let widthIn = num(raw?.widthIn);
  let heightIn = num(raw?.heightIn);

  if (!(widthIn > 0 && heightIn > 0)) {
    const maxWcm = num(raw?.maxWidthCm);
    const maxHcm = num(raw?.maxHeightCm);
    if (maxWcm > 0 && maxHcm > 0) {
      widthIn = maxWcm / 2.54;
      heightIn = maxHcm / 2.54;
      const hasPos = num(box.xPct) > 0 || num(box.yPct) > 0;
      xIn = hasPos ? (num(box.xPct) / 100) * frame.width : (frame.width - widthIn) / 2;
      yIn = hasPos ? (num(box.yPct) / 100) * frame.height : (frame.height - heightIn) / 2;
    } else if (num(box.widthPct) > 0 && num(box.heightPct) > 0) {
      xIn = (num(box.xPct) / 100) * frame.width;
      yIn = (num(box.yPct) / 100) * frame.height;
      widthIn = (num(box.widthPct) / 100) * frame.width;
      heightIn = (num(box.heightPct) / 100) * frame.height;
    } else {
      const d = defaultCenteredPlaceholder(frame);
      xIn = d.xIn;
      yIn = d.yIn;
      widthIn = d.widthIn;
      heightIn = d.heightIn;
    }
  }

  const ph = {
    key: String(raw?.key || ''),
    label: String(raw?.label || raw?.name || ''),
    mockupImageUrl: String(raw?.mockupImageUrl || ''),
    xIn: roundIn(xIn),
    yIn: roundIn(yIn),
    widthIn: roundIn(Math.max(widthIn, 0.1)),
    heightIn: roundIn(Math.max(heightIn, 0.1)),
    rotationDeg: num(raw?.rotationDeg),
    scale: num(raw?.scale) > 0 ? num(raw?.scale) : 1,
    lockSize: Boolean(raw?.lockSize),
    shapeType: raw?.shapeType === 'polygon' ? 'polygon' : 'rect',
    polygonPoints: Array.isArray(raw?.polygonPoints) ? raw.polygonPoints : undefined,
    dpi: Math.max(1, Math.round(num(raw?.dpi) || DEFAULT_DPI)),
    methods: Array.isArray(raw?.methods) ? raw.methods : [],
  };

  const legacyBox = placeholderToLegacyBoxPct(ph, frame);
  return {
    ...ph,
    box: legacyBox,
    maxWidthCm: roundCm(ph.widthIn * 2.54),
    maxHeightCm: roundCm(ph.heightIn * 2.54),
  };
}

/**
 * Place a print-DPI design PNG onto a mockup image using inch geometry.
 * Returns { x, y, w, h } in mockup image pixels (fill fit into placeholder).
 */
export function designPlacementOnMockup({
  mockupWidthPx,
  mockupHeightPx,
  placeholder,
  physicalDimensions,
  viewKey,
}) {
  const frame = physicalFrameForView(physicalDimensions, viewKey);
  // Map physical frame uniformly into the mockup bitmap (contain).
  const ppi = Math.min(mockupWidthPx / frame.width, mockupHeightPx / frame.height);
  const offsetX = (mockupWidthPx - frame.width * ppi) / 2;
  const offsetY = (mockupHeightPx - frame.height * ppi) / 2;
  const scale = placeholder.scale && placeholder.scale > 0 ? placeholder.scale : 1;
  return {
    x: offsetX + placeholder.xIn * ppi,
    y: offsetY + placeholder.yIn * ppi,
    w: placeholder.widthIn * ppi * scale,
    h: placeholder.heightIn * ppi * scale,
    pxPerInch: ppi,
    rotationDeg: placeholder.rotationDeg || 0,
  };
}

/** Map print-area local coords into parent space (Konva top-left rotation). */
export function printLocalToParent(localX, localY, originX, originY, rotationDeg = 0) {
  const rad = ((rotationDeg || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: originX + localX * c - localY * s,
    y: originY + localX * s + localY * c,
  };
}

export function parentToPrintLocal(parentX, parentY, originX, originY, rotationDeg = 0) {
  return printLocalToParent(parentX - originX, parentY - originY, 0, 0, -(rotationDeg || 0));
}

/**
 * Artwork placement. Print-area % is preferred; canvas % is mirrored for legacy readers.
 */
export function hasPrintRelativePlacement(pl) {
  return (
    !!pl &&
    Number.isFinite(pl.printCxPct) &&
    Number.isFinite(pl.printCyPct) &&
    Number.isFinite(pl.printWPct)
  );
}

export function placementToStagePixels(pl, printStage, canvasW = CANVAS_WIDTH, canvasH = CANVAS_HEIGHT) {
  if (hasPrintRelativePlacement(pl)) {
    return {
      cx: printStage.x + (pl.printCxPct / 100) * printStage.w,
      cy: printStage.y + (pl.printCyPct / 100) * printStage.h,
      w: (pl.printWPct / 100) * printStage.w,
      rot: pl.rot || 0,
    };
  }
  return {
    cx: (pl.xPct / 100) * canvasW,
    cy: (pl.yPct / 100) * canvasH,
    w: (pl.wPct / 100) * canvasW,
    rot: pl.rot || 0,
  };
}

export function stagePixelsToArtworkPlacement(
  cx,
  cy,
  w,
  rot,
  printStage,
  canvasW = CANVAS_WIDTH,
  canvasH = CANVAS_HEIGHT,
) {
  const printCxPct = printStage.w > 0 ? ((cx - printStage.x) / printStage.w) * 100 : 50;
  const printCyPct = printStage.h > 0 ? ((cy - printStage.y) / printStage.h) * 100 : 50;
  const printWPct = printStage.w > 0 ? (w / printStage.w) * 100 : 90;
  return {
    printCxPct: roundPct(printCxPct),
    printCyPct: roundPct(printCyPct),
    printWPct: roundPct(printWPct),
    xPct: roundPct((cx / canvasW) * 100),
    yPct: roundPct((cy / canvasH) * 100),
    wPct: roundPct((w / canvasW) * 100),
    rot: Math.round(rot || 0),
  };
}

export function placementPrintFractions(pl, printStage, canvasW = CANVAS_WIDTH, canvasH = CANVAS_HEIGHT) {
  if (hasPrintRelativePlacement(pl)) {
    return {
      cx: pl.printCxPct / 100,
      cy: pl.printCyPct / 100,
      w: pl.printWPct / 100,
      rot: pl.rot || 0,
    };
  }
  const artCx = (pl.xPct / 100) * canvasW;
  const artCy = (pl.yPct / 100) * canvasH;
  const artW = (pl.wPct / 100) * canvasW;
  return {
    cx: printStage.w > 0 ? (artCx - printStage.x) / printStage.w : 0.5,
    cy: printStage.h > 0 ? (artCy - printStage.y) / printStage.h : 0.5,
    w: printStage.w > 0 ? artW / printStage.w : 0.9,
    rot: pl.rot || 0,
  };
}

function positive(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function roundIn(n) {
  return Math.round(n * 1000) / 1000;
}

function roundPct(n) {
  return Math.round(n * 100) / 100;
}

function roundCm(n) {
  return Math.round(n * 10) / 10;
}
