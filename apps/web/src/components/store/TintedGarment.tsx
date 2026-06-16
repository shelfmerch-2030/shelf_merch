import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Recolours a garment by compositing two layers:
 *  - `base`  — the photo shown to customers (lifestyle or flat); never globally tinted.
 *  - `src`   — a garment-REGION mask: the garment area in white/opaque, everything else
 *              transparent (or black). Defines *where* to recolour.
 *
 * Only the pixels the mask marks as garment are recoloured (using the base photo's own
 * luminance for fold/shadow realism); skin, jeans, background stay exactly as photographed.
 *
 * Modes:
 *  - Composite (base + src + hex): recolour the base's garment region only.
 *  - Mask-only (src + hex, no base): luminance-tint the cut-out itself (flat garment assets).
 *  - No hex / tainted canvas: plain <img> of `base ?? src`.
 */
const MAX_DIM = 1000;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Mask-only luminance tint of the opaque cut-out pixels (in place). */
function tintMaskOnly(data: Uint8ClampedArray, target: [number, number, number]) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    const l = luma(data[i], data[i + 1], data[i + 2]) / 255;
    const boost = l > 0.97 ? ((l - 0.97) / 0.03) * 0.6 * 255 : 0;
    data[i] = Math.min(255, target[0] * l + boost);
    data[i + 1] = Math.min(255, target[1] * l + boost);
    data[i + 2] = Math.min(255, target[2] * l + boost);
  }
}

export function TintedGarment({
  base,
  src,
  hex,
  alt = "",
  style,
}: {
  base?: string;
  src?: string;
  hex?: string;
  alt?: string;
  style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const display = base || src; // what a plain <img> falls back to

  useEffect(() => {
    if (!hex || (!base && !src)) return;
    setFailed(false);
    let cancelled = false;

    (async () => {
      try {
        const target = hexToRgb(hex);
        const maskImg = src ? await loadImage(src) : null;
        const baseImg = base ? await loadImage(base) : null;
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ref = baseImg ?? maskImg!;
        const scale = Math.min(1, MAX_DIM / Math.max(ref.naturalWidth, ref.naturalHeight));
        const w = Math.max(1, Math.round(ref.naturalWidth * scale));
        const h = Math.max(1, Math.round(ref.naturalHeight * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (baseImg && maskImg) {
          // Composite: recolour only the base pixels the mask marks as garment.
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(baseImg, 0, 0, w, h);
          const out = ctx.getImageData(0, 0, w, h);

          const scratch = document.createElement("canvas");
          scratch.width = w;
          scratch.height = h;
          const sctx = scratch.getContext("2d");
          if (!sctx) return;
          sctx.drawImage(maskImg, 0, 0, w, h);
          const mask = sctx.getImageData(0, 0, w, h).data;

          const d = out.data;
          for (let i = 0; i < d.length; i += 4) {
            const isGarment = mask[i + 3] > 64 && luma(mask[i], mask[i + 1], mask[i + 2]) > 96;
            if (!isGarment) continue;
            const l = luma(d[i], d[i + 1], d[i + 2]) / 255;
            const boost = l > 0.97 ? ((l - 0.97) / 0.03) * 0.6 * 255 : 0;
            d[i] = Math.min(255, target[0] * l + boost);
            d[i + 1] = Math.min(255, target[1] * l + boost);
            d[i + 2] = Math.min(255, target[2] * l + boost);
          }
          ctx.putImageData(out, 0, 0);
        } else {
          // Mask-only: tint the cut-out itself.
          const only = maskImg ?? baseImg!;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(only, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h);
          tintMaskOnly(data.data, target);
          ctx.putImageData(data, 0, 0);
        }
      } catch {
        if (!cancelled) setFailed(true); // tainted canvas or load error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, src, hex]);

  if (!display) {
    return (
      <div style={{ display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 12, ...style }}>
        No image
      </div>
    );
  }
  if (!hex || failed) {
    return <img src={display} alt={alt} style={{ width: "100%", height: "100%", objectFit: "contain", ...style }} />;
  }
  return (
    <canvas
      ref={canvasRef}
      aria-label={alt}
      style={{ width: "100%", height: "100%", objectFit: "contain", ...style }}
    />
  );
}
