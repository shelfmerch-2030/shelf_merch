import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Recolours a garment image to `hex`. The transparency must live in the asset:
 * a mask should be a PNG with its background already removed (alpha cleared
 * outside the garment). The code does NOT try to detect the garment — it just
 * luminance-tints the opaque pixels, so a light/white garment takes the colour
 * strongly while dark areas (and transparent background) barely change.
 *
 * Two modes, chosen by whether the four corners are opaque:
 *  - Template (transparent corners — a cut-out): per opaque pixel, out = colour
 *    × brightness, with a small specular lift on near-white highlights.
 *  - Knockout (opaque corners — flat garment on a solid backdrop): fill with
 *    the colour, then multiply the photo over it.
 *
 * Falls back to a plain <img> with no hex/src or a tainted canvas (cross-origin
 * without CORS).
 */
const MAX_DIM = 1000;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function cornersOpaque(data: Uint8ClampedArray, w: number, h: number) {
  const a = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  return a(0, 0) > 250 && a(w - 1, 0) > 250 && a(0, h - 1) > 250 && a(w - 1, h - 1) > 250;
}

/** Template mode: luminance-multiply tint of opaque pixels (in place). */
function tintTemplate(data: Uint8ClampedArray, target: [number, number, number]) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    let lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    // Lift specular highlights so folds/sheen on white fabric stay natural.
    const boost = lum > 0.97 ? ((lum - 0.97) / 0.03) * 0.6 : 0;
    data[i] = Math.min(255, target[0] * lum + boost * 255);
    data[i + 1] = Math.min(255, target[1] * lum + boost * 255);
    data[i + 2] = Math.min(255, target[2] * lum + boost * 255);
  }
}

export function TintedGarment({
  src,
  hex,
  alt = "",
  style,
}: {
  src?: string;
  hex?: string;
  alt?: string;
  style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src || !hex) return;
    setFailed(false);
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, MAX_DIM / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      try {
        // Read once to choose a mode without tainting the destination context.
        ctx.drawImage(image, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const target = hexToRgb(hex);
        if (cornersOpaque(data.data, w, h)) {
          // Knockout: colour fill, then multiply the photo through it.
          ctx.clearRect(0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = hex;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "multiply";
          ctx.drawImage(image, 0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
        } else {
          // Template: luminance tint of the opaque (garment) pixels.
          tintTemplate(data.data, target);
          ctx.putImageData(data, 0, 0);
        }
      } catch {
        setFailed(true); // tainted canvas (cross-origin without CORS)
      }
    };
    image.onerror = () => !cancelled && setFailed(true);
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, hex]);

  if (!src) {
    return (
      <div style={{ display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 12, ...style }}>
        No image
      </div>
    );
  }
  if (!hex || failed) {
    return <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "contain", ...style }} />;
  }
  return (
    <canvas
      ref={canvasRef}
      aria-label={alt}
      style={{ width: "100%", height: "100%", objectFit: "contain", ...style }}
    />
  );
}
