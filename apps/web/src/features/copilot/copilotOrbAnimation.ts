const TURN_DURATION_MS = 8_000;
const MIN_FRAME_INTERVAL_MS = 30;

export function animateCopilotOrb(image: HTMLImageElement, canvas: HTMLCanvasElement) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let stopDrawing: (() => void) | undefined;

  function syncMotion() {
    stopDrawing?.();
    stopDrawing = undefined;
    if (!reducedMotion.matches && image.complete && image.naturalWidth > 0) {
      stopDrawing = drawRotatingOrb(image, canvas);
    }
  }

  reducedMotion.addEventListener("change", syncMotion);
  image.addEventListener("load", syncMotion);
  syncMotion();

  return () => {
    reducedMotion.removeEventListener("change", syncMotion);
    image.removeEventListener("load", syncMotion);
    stopDrawing?.();
  };
}

function drawRotatingOrb(image: HTMLImageElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = canvas;
  context.drawImage(image, 0, 0, width, height);
  const source = context.getImageData(0, 0, width, height).data;
  const frame = context.createImageData(width, height);
  frame.data.set(source);

  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  // Fit the projected sphere to the orb inside the image's transparent margin.
  const radius = width * 0.46;
  const surface: { pixel: number; horizontal: number; depth: number; row: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      if (!source[pixel + 3]) continue;
      const horizontal = x - centerX;
      const vertical = y - centerY;
      const depth = Math.sqrt(Math.max(0, radius ** 2 - horizontal ** 2 - vertical ** 2));
      surface.push({ pixel, horizontal, depth, row: y * width });
    }
  }

  let request: number;
  let start: number | undefined;
  let lastFrame = -Infinity;

  const tick = (now: number) => {
    start ??= now;
    if (now - lastFrame >= MIN_FRAME_INTERVAL_MS) {
      lastFrame = now;
      const angle = (2 * Math.PI * ((now - start) % TURN_DURATION_MS)) / TURN_DURATION_MS;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      for (const { pixel, horizontal, depth, row } of surface) {
        // Rotate about the vertical axis, sampling the original orb as a mirrored texture.
        const x = Math.round(centerX + horizontal * cosine + depth * sine);
        const sample = (row + x) * 4;
        const color = x >= 0 && x < width && source[sample + 3] >= 128 ? sample : pixel;
        frame.data[pixel] = source[color];
        frame.data[pixel + 1] = source[color + 1];
        frame.data[pixel + 2] = source[color + 2];
      }
      context.putImageData(frame, 0, 0);
      canvas.hidden = false;
    }
    request = window.requestAnimationFrame(tick);
  };

  request = window.requestAnimationFrame(tick);
  return () => {
    window.cancelAnimationFrame(request);
    canvas.hidden = true;
  };
}
