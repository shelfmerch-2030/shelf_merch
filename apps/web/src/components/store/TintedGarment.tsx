import { useEffect, useRef, useState, type CSSProperties } from "react";
import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";

/**
 * Recolours a garment mask PNG to `hex`, tinting ONLY opaque garment pixels.
 * Transparent background stays clear. Uses canvas (via same-origin / proxied
 * src); falls back to a CSS mask fill when canvas is unavailable.
 */
const MAX_DIM = 1800;
const BG_THRESHOLD = 60;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function dist(r: number, g: number, b: number, c: [number, number, number]) {
  return Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);
}

function isKnockoutMask(img: ImageData): boolean {
  const { data, width: w, height: h } = img;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const corners = [idx(0, 0), idx(w - 1, 0), idx(0, h - 1), idx(w - 1, h - 1)];
  if (!corners.every((i) => data[i + 3] > 200)) return false;
  let nonOpaque = 0;
  let total = 0;
  for (let i = 3; i < data.length; i += 4 * 16) {
    total += 1;
    if (data[i] < 200) nonOpaque += 1;
  }
  return total > 0 && nonOpaque / total > 0.08;
}

function recolorImageData(img: ImageData, target: [number, number, number]) {
  const { data, width: w, height: h } = img;
  const idx = (x: number, y: number) => (y * w + x) * 4;

  let borderTransparent = 0;
  let borderCount = 0;
  for (let x = 0; x < w; x += 1) {
    for (const y of [0, h - 1]) {
      borderCount += 1;
      if (data[idx(x, y) + 3] < 16) borderTransparent += 1;
    }
  }
  const hasAlphaCutout = borderTransparent / Math.max(1, borderCount) > 0.5;

  if (!hasAlphaCutout) {
    const corners = [idx(0, 0), idx(w - 1, 0), idx(0, h - 1), idx(w - 1, h - 1)];
    const bg: [number, number, number] = [0, 0, 0];
    for (const c of corners) {
      bg[0] += data[c];
      bg[1] += data[c + 1];
      bg[2] += data[c + 2];
    }
    bg[0] /= 4; bg[1] /= 4; bg[2] /= 4;

    const stack: number[] = [];
    const seen = new Uint8Array(w * h);
    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (seen[p]) return;
      seen[p] = 1;
      stack.push(x, y);
    };
    for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const y = stack.pop() as number;
      const x = stack.pop() as number;
      const i = idx(x, y);
      if (data[i + 3] < 16 || dist(data[i], data[i + 1], data[i + 2], bg) < BG_THRESHOLD) {
        data[i + 3] = 0;
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
      }
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const shade = 0.42 + luma * 0.9;
    const highlight = Math.max(0, (luma - 0.72) / 0.28) * 46;
    data[i] = Math.min(255, target[0] * shade + highlight);
    data[i + 1] = Math.min(255, target[1] * shade + highlight);
    data[i + 2] = Math.min(255, target[2] * shade + highlight);
  }
}

const contain: CSSProperties = { width: "100%", height: "100%", objectFit: "contain" };
const maskFit: CSSProperties = {
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
};

/** CSS fallback — colour fill clipped to mask alpha, grey shading on top. */
function MaskShadedTint({ src, hex, alt, style }: { src: string; hex: string; alt?: string; style?: CSSProperties }) {
  const mask = `url("${src}")`;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...style }} aria-label={alt}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: hex,
          WebkitMaskImage: mask,
          maskImage: mask,
          ...maskFit,
        }}
      />
      <img
        src={src}
        alt=""
        draggable={false}
        style={{ ...contain, position: "absolute", inset: 0, mixBlendMode: "multiply", pointerEvents: "none" }}
      />
    </div>
  );
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
  const resolved = src ? resolveMediaUrl(src) : "";
  const tintSrc = resolved ? mediaUrlForCanvas(resolved) : "";

  useEffect(() => {
    setFailed(false);
  }, [tintSrc, hex]);

  useEffect(() => {
    if (!tintSrc || !hex) return;
    setFailed(false);
    let cancelled = false;
    const image = new Image();
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
      ctx.drawImage(image, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, w, h);
        if (isKnockoutMask(data)) {
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = hex;
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(image, 0, 0, w, h);
        } else {
          recolorImageData(data, hexToRgb(hex));
          ctx.putImageData(data, 0, 0);
        }
      } catch {
        setFailed(true);
      }
    };
    image.onerror = () => !cancelled && setFailed(true);
    image.src = tintSrc;
    return () => {
      cancelled = true;
    };
  }, [tintSrc, hex]);

  if (!resolved) {
    return (
      <div style={{ display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 12, ...style }}>
        No image
      </div>
    );
  }
  if (!hex) {
    return <img src={resolved} alt={alt} style={{ ...contain, ...style }} />;
  }
  if (failed) {
    return <MaskShadedTint src={tintSrc || resolved} hex={hex} alt={alt} style={style} />;
  }
  return <canvas ref={canvasRef} aria-label={alt} style={{ ...contain, ...style }} />;
}
