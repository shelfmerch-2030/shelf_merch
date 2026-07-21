import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";

/** Per-product artwork placement, stored as % of the square stage. */
export type Placement = { xPct: number; yPct: number; wPct: number; rot: number };

export const DEFAULT_BOX = { xPct: 33, yPct: 30, widthPct: 34, heightPct: 38 };

export function placementKey(prod: UiProduct, idx: number): string {
  return prod?.id || `idx${idx}`;
}

export function resolveMediaSrc(url: string | undefined): string {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

function normMediaPath(url: string | undefined): string {
  if (!url) return "";
  const path = String(url).replace(/^https?:\/\/[^/]+/i, "");
  return path.startsWith("/") ? path : `/${path}`;
}

/** Production mask used behind artwork in design previews and baked mockups (never the marketing photo). */
export function designImgUrl(p: UiProduct): string {
  return p?.maskImageUrl || p?.baseImageUrl || "";
}

/** Pick the print area whose mockup image matches the mask/photo, else the first usable one. */
export function pickPrintArea(p: UiProduct) {
  const areas = p?.printAreas;
  if (!areas?.length) return null;
  const maskUrl = p.maskImageUrl;
  if (maskUrl) {
    const maskNorm = normMediaPath(maskUrl);
    const maskArea = areas.find((a) => normMediaPath(a.mockupImageUrl) === maskNorm);
    if (maskArea) return maskArea;
  }
  if (p.baseImageUrl) {
    const baseNorm = normMediaPath(p.baseImageUrl);
    const match = areas.find((a) => normMediaPath(a.mockupImageUrl) === baseNorm);
    if (match) return match;
  }
  return areas.find((a) => a?.box?.widthPct > 0) || areas[0];
}

export function productHasPrintArea(p: UiProduct): boolean {
  return Boolean(pickPrintArea(p)?.box?.widthPct);
}

/** Default artwork placement — matches Konva / bakeMockup when none is stored. */
export function defaultPlacement(ep: UiProduct, artAspect = 1): Placement {
  const area = pickPrintArea(ep);
  const box = area?.box?.widthPct ? area.box : DEFAULT_BOX;
  const size = 100;
  const bw = (box.widthPct / 100) * size;
  const bh = (box.heightPct / 100) * size;
  const fitW = Math.min(bw * 0.92, (bh * 0.92) / Math.max(artAspect, 0.01));
  return {
    xPct: box.xPct + box.widthPct / 2,
    yPct: box.yPct + box.heightPct / 2,
    wPct: (fitW / size) * 100,
    rot: 0,
  };
}

/** Load an image for canvas compositing (CORS-safe via media proxy when needed). */
export function loadImageEl(src: string, forCanvas = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("no src"));
      return;
    }
    const resolved = forCanvas
      ? mediaUrlForCanvas(src) || resolveMediaSrc(src)
      : resolveMediaSrc(src);
    const im = new Image();
    if (forCanvas) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = resolved;
  });
}

/* ---- POD realism: warp + fabric texture + sheen baked into the artwork ---- */
let fabricTex: HTMLCanvasElement | null = null;
function getFabricTexture(): HTMLCanvasElement {
  if (fabricTex) return fabricTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 128 + (Math.random() * 44 - 22);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.globalAlpha = 0.05;
  x.strokeStyle = "#000";
  for (let i = 0; i < 128; i += 3) {
    x.beginPath();
    x.moveTo(0, i + 0.5);
    x.lineTo(128, i + 0.5);
    x.stroke();
  }
  x.globalAlpha = 1;
  fabricTex = c;
  return c;
}

function warpAmountFor(g: string | undefined): number {
  if (g === "mug" || g === "bottle" || g === "flask") return 1;
  if (g === "cap" || g === "beanie") return 0.5;
  return 0.3;
}

function cylMapX(u: number, k: number): number {
  const maxAng = k * 0.85;
  if (maxAng < 1e-3) return u;
  return 0.5 + (Math.sin((u - 0.5) * 2 * maxAng) / Math.sin(maxAng)) * 0.5;
}

/** Bake warp + fabric texture + sheen into the artwork (placement-independent). */
export function buildRealisticArtwork(
  artImg: HTMLImageElement,
  group: string | undefined,
): HTMLCanvasElement | HTMLImageElement {
  try {
    const maxDim = 1100;
    const nw = artImg.naturalWidth || artImg.width || 0;
    const nh = artImg.naturalHeight || artImg.height || 0;
    if (nw < 2 || nh < 2) return artImg;
    const s = Math.min(1, maxDim / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * s));
    const h = Math.max(1, Math.round(nh * s));
    const base = document.createElement("canvas");
    base.width = w;
    base.height = h;
    const b = base.getContext("2d")!;

    const k = warpAmountFor(group);
    const amp = h * 0.045 * k;
    if (k > 0.05) {
      const strips = 80;
      for (let i = 0; i < strips; i++) {
        const u0 = i / strips;
        const u1 = (i + 1) / strips;
        const um = (i + 0.5) / strips;
        const dx0 = cylMapX(u0, k) * w;
        const dx1 = cylMapX(u1, k) * w;
        const bow = Math.sin(Math.PI * um);
        const dy = amp * bow * 0.5;
        const dh = h - amp * bow;
        b.drawImage(artImg, u0 * nw, 0, (u1 - u0) * nw, nh, dx0 - 0.5, dy, dx1 - dx0 + 1, dh);
      }
    } else {
      b.drawImage(artImg, 0, 0, w, h);
    }

    const tex = getFabricTexture();
    const tc = document.createElement("canvas");
    tc.width = w;
    tc.height = h;
    const tx = tc.getContext("2d")!;
    const pat = tx.createPattern(tex, "repeat")!;
    tx.fillStyle = pat;
    tx.fillRect(0, 0, w, h);
    tx.globalCompositeOperation = "destination-in";
    tx.drawImage(base, 0, 0);
    b.save();
    b.globalCompositeOperation = "overlay";
    b.globalAlpha = 0.18;
    b.drawImage(tc, 0, 0);
    b.restore();

    const lc = document.createElement("canvas");
    lc.width = w;
    lc.height = h;
    const lx = lc.getContext("2d")!;
    const grad = lx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "rgba(255,255,255,0.40)");
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.26)");
    lx.fillStyle = grad;
    lx.fillRect(0, 0, w, h);
    lx.globalCompositeOperation = "destination-in";
    lx.drawImage(base, 0, 0);
    b.save();
    b.globalCompositeOperation = "overlay";
    b.globalAlpha = 0.5;
    b.drawImage(lc, 0, 0);
    b.restore();

    return base;
  } catch {
    return artImg;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * True only when the image is a real transparent garment cutout (a mask with a
 * see-through background), so recolouring touches just the garment. A full
 * opaque product/model photo returns false — tinting it would recolour the
 * model, skin and background, not the garment.
 *
 * We look at the WHOLE image's transparent fraction, not just the border: a
 * garment cutout can fill the frame edge-to-edge (sleeves/hem touching the
 * sides) yet still have a see-through background, whereas an opaque photo has
 * essentially zero transparent pixels.
 */
function isTintableMask(img: HTMLImageElement): boolean {
  try {
    const S = 100;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const x = c.getContext("2d");
    if (!x) return false;
    x.clearRect(0, 0, S, S);
    x.drawImage(img, 0, 0, S, S);
    const d = x.getImageData(0, 0, S, S).data;
    let transparent = 0;
    const total = S * S;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 16) transparent += 1;
    }
    // A cutout has a see-through background (a few % at minimum); an opaque
    // photo has ~none.
    return transparent / total > 0.03;
  } catch {
    return false;
  }
}

/**
 * Luma-multiply recolour of the opaque garment pixels already drawn on `ctx`.
 * Same maths as the store's TintedGarment — preserves fold/shadow shading so a
 * tinted garment keeps its depth. The mask has a transparent background, so we
 * only touch pixels with alpha > 0.
 */
function tintGarmentInPlace(ctx: CanvasRenderingContext2D, size: number, hex: string) {
  const [tr, tg, tb] = hexToRgb(hex);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const luma = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    d[i] = tr * luma;
    d[i + 1] = tg * luma;
    d[i + 2] = tb * luma;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Flatten mask + placed artwork into one PNG data URL. When `tintHex` is given,
 * the garment is recoloured before the artwork is composited — producing a
 * per-colour mockup with the exact same realistic treatment (warp, fabric
 * texture, sheen, multiply @ 0.96) as the default bake, so every colour blends
 * identically.
 */
export async function bakeMockup(
  ep: UiProduct,
  artUrl: string,
  placement: Placement | null,
  size = 1000,
  requireProductBase = false,
  tintHex?: string,
): Promise<string> {
  if (!artUrl) return "";
  try {
    const maskUrl = designImgUrl(ep);
    const [maskImg, artImg] = await Promise.all([
      maskUrl ? loadImageEl(maskUrl, true).catch(() => null) : Promise.resolve(null),
      loadImageEl(artUrl, true),
    ]);
    if (requireProductBase && !maskImg) return "";
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    if (maskImg) {
      const s = Math.min(size / maskImg.naturalWidth, size / maskImg.naturalHeight);
      const w = maskImg.naturalWidth * s;
      const h = maskImg.naturalHeight * s;
      ctx.drawImage(maskImg, (size - w) / 2, (size - h) / 2, w, h);
      // Only recolour a genuine garment cutout — never an opaque model/product
      // photo (that would tint the person and background, not the garment).
      if (tintHex && isTintableMask(maskImg)) tintGarmentInPlace(ctx, size, tintHex);
    }
    const aspect = (artImg.naturalHeight || 1) / (artImg.naturalWidth || 1);
    const pl = placement ?? defaultPlacement(ep, aspect);
    const realArt = buildRealisticArtwork(artImg, ep?.g);
    const w0 = (pl.wPct / 100) * size;
    const h0 = w0 * aspect;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.96;
    ctx.translate((pl.xPct / 100) * size, (pl.yPct / 100) * size);
    ctx.rotate(((pl.rot || 0) * Math.PI) / 180);
    ctx.drawImage(realArt, -w0 / 2, -h0 / 2, w0, h0);
    ctx.restore();
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/** Resolved photo/mockup thumbnail for a product or baked design. */
export function productThumbUrl(p: UiProduct, branded = false): string {
  if (branded && p.mockupUrl) return resolveMediaUrl(p.mockupUrl) || "";
  return resolveMediaUrl(p.imgUrl) || resolveMediaUrl(p.mockupUrl) || "";
}
