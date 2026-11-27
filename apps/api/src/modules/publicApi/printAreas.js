import { assertFetchableUrl } from '../orderSources/adapters/safeFetch.js';
import { readImageInfo } from '../../utils/imageInfo.js';
import {
  normalizePlaceholder,
  physicalFrameForView,
  placeholderToStagePixels,
  stagePixelsToArtworkPlacement,
} from '../../lib/printCoords.js';

/**
 * Print areas for the public API, and artwork placement on them.
 *
 * Clients place artwork in INCHES relative to one of our print areas (origin = the area's top-left):
 *   { area: "front", artwork_url, width_in, height_in?, left_in?, top_in? }
 * We validate it (area exists, fits, resolution, aspect) and store it in the same print-area-relative
 * placement format branded listings use, so production views render it exactly.
 */

export const MIN_EFFECTIVE_DPI = 100;
export const ASPECT_TOLERANCE = 0.03;
const FIT_TOLERANCE_IN = 0.05;
const HEADER_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const round = (n, d = 3) => Math.round(Number(n) * 10 ** d) / 10 ** d;
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Product print areas with stable, unique public keys. Same scheme as the web's printAreaStableKey
 * (features/swag/mockup-bake.ts): the first area keeps its key; later duplicates become `<key>__<index>`,
 * so production views pair stored placements with the right area.
 */
export function publicPrintAreas(product) {
  const raws = product.printAreas ?? [];
  const baseOf = (raw, i) => String(raw?.key || '').trim() || slug(raw?.label) || `area_${i + 1}`;
  const firstIndex = new Map();
  raws.forEach((raw, i) => {
    if (!firstIndex.has(baseOf(raw, i))) firstIndex.set(baseOf(raw, i), i);
  });
  return raws.map((raw, i) => {
    const phys = physicalFrameForView(product.physicalDimensions, raw.key);
    const ph = normalizePlaceholder(raw, phys);
    const base = baseOf(raw, i);
    return {
      key: firstIndex.get(base) === i ? base : `${base}__${i}`,
      label: raw.label || ph.label || base,
      widthIn: ph.widthIn,
      heightIn: ph.heightIn,
      dpi: ph.dpi || Number(product.dpi) || 300,
      methods: raw.methods ?? [],
      phys,
      ph,
    };
  });
}

/** Public catalog representation of print areas. */
export function serializePrintAreas(product) {
  return publicPrintAreas(product).map((a) => ({
    key: a.key,
    label: a.label,
    width_in: a.widthIn,
    height_in: a.heightIn,
    dpi: a.dpi,
    methods: a.methods,
  }));
}

/**
 * Fetch just enough of an artwork file to know its format and pixel size.
 * → { format, width?, height? } or { error: { code, message } }
 */
export async function fetchArtworkInfo(url, { fetchImpl = fetch } = {}) {
  try {
    await assertFetchableUrl(url);
  } catch (err) {
    return { error: { code: 'artwork_url_invalid', message: err.message } };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` }, redirect: 'manual', signal: controller.signal });
    if (res.status >= 300 && res.status < 400) {
      return { error: { code: 'artwork_redirect', message: 'artwork_url redirects — send the final, direct file URL' } };
    }
    if (!res.ok) return { error: { code: 'artwork_unreachable', message: `artwork_url returned HTTP ${res.status}` } };
    // Read only the first chunk(s) — enough for any header we parse.
    const chunks = [];
    let size = 0;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      while (size < HEADER_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        size += value.length;
      }
      reader.cancel().catch(() => {});
    } else {
      chunks.push(Buffer.from(await res.arrayBuffer()));
    }
    const info = readImageInfo(Buffer.concat(chunks));
    if (!info) {
      return { error: { code: 'artwork_unsupported_format', message: 'artwork must be a PNG, JPEG, WebP or PDF file (SVG is not print-ready)' } };
    }
    return info;
  } catch (err) {
    return { error: { code: 'artwork_unreachable', message: `Could not download artwork_url: ${err.name === 'AbortError' ? 'timed out' : err.message}` } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate one line's print_areas against its product and build stored placements.
 * → { placements: [...], errors: [{ param, code, message }] }
 */
export function buildPlacements({ product, printAreas, artworkInfoByUrl, paramPrefix }) {
  const areas = publicPrintAreas(product);
  const errors = [];
  const placements = [];
  const fail = (j, field, code, message) => errors.push({ param: `${paramPrefix}.print_areas[${j}]${field ? `.${field}` : ''}`, code, message });

  if (!areas.length) {
    errors.push({ param: `${paramPrefix}.print_areas`, code: 'print_areas_unavailable', message: `${product.name} has no print areas — send artwork_url on the line instead` });
    return { placements, errors };
  }
  const used = new Set();
  printAreas.forEach((req, j) => {
    const key = String(req.area).trim().toLowerCase();
    const area = areas.find((a) => a.key.toLowerCase() === key) ?? areas.find((a) => slug(a.label) === slug(req.area));
    if (!area) {
      return fail(j, 'area', 'print_area_not_found', `${product.name} has no print area "${req.area}" (available: ${areas.map((a) => a.key).join(', ')})`);
    }
    if (used.has(area.key)) return fail(j, 'area', 'duplicate_print_area', `Print area "${area.key}" is listed twice`);
    used.add(area.key);

    const info = artworkInfoByUrl.get(req.artwork_url);
    if (!info || info.error) return fail(j, 'artwork_url', info?.error?.code ?? 'artwork_unreachable', info?.error?.message ?? 'Could not read artwork_url');

    const widthIn = Number(req.width_in);
    let heightIn = req.height_in != null ? Number(req.height_in) : null;
    const hasPixels = info.width > 0 && info.height > 0;
    if (heightIn == null) {
      if (!hasPixels) return fail(j, 'height_in', 'height_required', 'height_in is required for PDF artwork');
      heightIn = round((widthIn * info.height) / info.width);
    } else if (hasPixels) {
      const expected = (widthIn * info.height) / info.width;
      if (Math.abs(heightIn - expected) / expected > ASPECT_TOLERANCE) {
        return fail(
          j,
          'height_in',
          'artwork_aspect_mismatch',
          `The artwork is ${info.width}×${info.height} px, so at ${widthIn} in wide it prints ${round(expected, 2)} in tall, not ${heightIn} in. Crop the file to the printed shape, or omit height_in.`,
        );
      }
    }

    const leftIn = req.left_in != null ? Number(req.left_in) : round((area.widthIn - widthIn) / 2);
    const topIn = req.top_in != null ? Number(req.top_in) : round((area.heightIn - heightIn) / 2);
    if (leftIn < -FIT_TOLERANCE_IN || topIn < -FIT_TOLERANCE_IN || leftIn + widthIn > area.widthIn + FIT_TOLERANCE_IN || topIn + heightIn > area.heightIn + FIT_TOLERANCE_IN) {
      return fail(
        j,
        null,
        'artwork_out_of_bounds',
        `A ${widthIn}×${round(heightIn, 2)} in print at ${round(leftIn, 2)} in from left / ${round(topIn, 2)} in from top does not fit the ${area.label} area (${area.widthIn}×${area.heightIn} in)`,
      );
    }

    const effectiveDpi = hasPixels ? Math.floor(Math.min(info.width / widthIn, info.height / heightIn)) : null;
    if (effectiveDpi != null && effectiveDpi < MIN_EFFECTIVE_DPI) {
      return fail(
        j,
        'artwork_url',
        'artwork_low_resolution',
        `The artwork is ${info.width}×${info.height} px — only ${effectiveDpi} DPI at ${widthIn}×${round(heightIn, 2)} in (minimum ${MIN_EFFECTIVE_DPI}; ${area.dpi} recommended). Send a larger file or print it smaller.`,
      );
    }

    // Inches within the area → stage pixels → the print-area-relative placement production renders.
    const stage = placeholderToStagePixels(area.ph, area.phys);
    const pxPerInX = stage.w / area.widthIn;
    const pxPerInY = stage.h / area.heightIn;
    const cx = stage.x + (leftIn + widthIn / 2) * pxPerInX;
    const cy = stage.y + (topIn + heightIn / 2) * pxPerInY;
    const pl = stagePixelsToArtworkPlacement(cx, cy, widthIn * pxPerInX, 0, stage);

    placements.push({
      key: area.key,
      ...pl,
      artworkUrl: req.artwork_url,
      widthIn: round(widthIn),
      heightIn: round(heightIn),
      leftIn: round(leftIn),
      topIn: round(topIn),
      effectiveDpi,
      artworkWidthPx: hasPixels ? info.width : null,
      artworkHeightPx: hasPixels ? info.height : null,
      artworkFormat: info.format,
    });
  });
  return { placements, errors };
}
