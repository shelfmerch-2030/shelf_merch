import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { TintedGarment } from "@/components/store/TintedGarment";
import type { UiProduct } from "@/services/mappers";
import { DEFAULT_MOCKUP_TINT_HEX, isDefaultMockupTint } from "./colors";
import {
  bakeTintedMockupLayers,
  defaultPlacement,
  designImgUrl,
  listProductViews,
  pickPrintArea,
  printAreaViewKey,
  productThumbUrl,
  resolveProductArtworkLayers,
  type Placement,
  type ProductViewKey,
} from "./mockup-bake";

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Blend the printed artwork into the garment so it reads as ink on fabric
 * rather than a flat sticker. The tinted mask underneath already carries the
 * fabric's folds and shadows (recoloured by luminance); here we let those show
 * through the print by picking a blend mode + opacity from the garment colour:
 *  - Light fabrics → "multiply" so the print picks up the soft fabric shadows.
 *  - Dark fabrics  → "normal" so a full-colour print stays legible, with a
 *                    little transparency so the weave/shadow still reads.
 *  - Warm fabrics  → nudged slightly more opaque so the ink keeps popping.
 */
function artworkFabricFx(tintHex?: string): {
  opacity: number;
  mixBlendMode: CSSProperties["mixBlendMode"];
} {
  if (!tintHex || !/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(tintHex)) {
    return { opacity: 1, mixBlendMode: "normal" };
  }
  const [r, g, b] = hexToRgbTuple(tintHex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; // perceived 0..1
  const warm = (r - b) / 255 > 0.1; // reddish/orange fabrics

  if (lum >= 0.62) {
    // Light garment: integrate the print with the fabric's soft shadows.
    return { opacity: 0.96, mixBlendMode: "multiply" };
  }
  if (lum <= 0.32) {
    // Dark garment: keep the colours bright, let a little texture through.
    return { opacity: warm ? 0.92 : 0.88, mixBlendMode: "normal" };
  }
  // Mid-tone garment: blend, but keep enough opacity to stay readable.
  return { opacity: warm ? 0.94 : 0.9, mixBlendMode: "multiply" };
}

function placementStyle(pl: Placement, artAspect: number): CSSProperties {
  return {
    position: "absolute",
    left: `${pl.xPct}%`,
    top: `${pl.yPct}%`,
    width: `${pl.wPct}%`,
    height: "auto",
    maxWidth: "none",
    maxHeight: "none",
    aspectRatio: `${1 / Math.max(artAspect, 0.01)}`,
    transform: `translate(-50%, -50%) rotate(${pl.rot || 0}deg)`,
    transformOrigin: "center center",
    objectFit: "contain",
    pointerEvents: "none",
    zIndex: 2,
  };
}

/** Square stage matching Konva / bakeMockup — placement % is of this box. */
function MockupStage({
  isolation,
  children,
}: {
  isolation?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="img img-mockup img-mockup-stage"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        overflow: "hidden",
        ...(isolation ? { isolation: "isolate" as const } : null),
      }}
    >
      {children}
    </div>
  );
}

/** Garment fills the square stage the same way bakeMockup letterboxes the mask. */
const STAGE_GARMENT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  margin: 0,
};

/** Live mask + one or more artworks on the full square stage (Konva / bake coordinate system). */
function LiveArtworkComposite({
  product,
  base,
  layers,
}: {
  product: UiProduct;
  base: string;
  layers: Array<{ artUrl: string; placement: Placement; areaKey: string }>;
}) {
  return (
    <MockupStage>
      <img src={base} alt={product.nm} loading="lazy" style={STAGE_GARMENT_STYLE} />
      {layers.map((layer) => (
        <ArtworkOverlay key={layer.areaKey} src={layer.artUrl} placement={layer.placement} product={product} />
      ))}
    </MockupStage>
  );
}

function ArtworkOverlay({
  src,
  placement: savedPlacement,
  product,
  tintHex,
}: {
  src: string;
  placement: Placement;
  product: UiProduct;
  tintHex?: string;
}) {
  const [artAspect, setArtAspect] = useState(1);
  const placement = useMemo(
    () => savedPlacement ?? defaultPlacement(product, artAspect),
    [savedPlacement, product, artAspect],
  );
  const fx = tintHex ? artworkFabricFx(tintHex) : { opacity: 1, mixBlendMode: "normal" as const };
  return (
    <img
      className="art-overlay-img"
      src={src}
      alt="Artwork"
      style={{
        ...placementStyle(placement, artAspect),
        opacity: fx.opacity,
        mixBlendMode: fx.mixBlendMode,
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
        if (aspect > 0) setArtAspect(aspect);
      }}
    />
  );
}

function MaskArtworkComposite({
  product,
  mask,
  layers,
  tintHex,
}: {
  product: UiProduct;
  mask: string;
  layers: Array<{ artUrl: string; placement: Placement; areaKey: string }>;
  tintHex: string;
}) {
  return (
    <MockupStage isolation>
      <TintedGarment src={mask} hex={tintHex} alt={product.nm} style={STAGE_GARMENT_STYLE} />
      {layers.map((layer) => (
        <ArtworkOverlay
          key={layer.areaKey}
          src={layer.artUrl}
          placement={layer.placement}
          product={product}
          tintHex={tintHex}
        />
      ))}
    </MockupStage>
  );
}

/**
 * Live realistic tinted mockup. Whenever the colour swatch changes it bakes the
 * recoloured garment mask plus all print-area artworks — same path as the
 * saved multi-area bake. Falls back to the DOM composite while baking.
 */
function TintedMockupImage({
  product,
  layers,
  tintHex,
  maskUrl,
  fallback,
}: {
  product: UiProduct;
  layers: Array<{ artUrl: string; placement: Placement; areaKey: string }>;
  tintHex: string;
  /** View-specific garment mask (front/back/side) — required so back tint uses the back asset. */
  maskUrl?: string;
  fallback: ReactElement;
}) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const reqRef = useRef(0);
  const layersKey = layers.map((l) => `${l.areaKey}:${l.artUrl}`).join("|");
  const productId = product.id;

  useEffect(() => {
    const req = ++reqRef.current;
    setFailed(false);
    setSrc("");
    bakeTintedMockupLayers(product, layers, tintHex, 1000, maskUrl)
      .then((url) => {
        if (req !== reqRef.current) return;
        if (url) setSrc(url);
        else setFailed(true);
      })
      .catch(() => {
        if (req === reqRef.current) setFailed(true);
      });
    // product/layers are read from this render; identity changes every parent render.
  }, [productId, layersKey, tintHex, maskUrl]);

  if (failed || !src) return fallback;
  return (
    <div className="img img-mockup">
      <img
        src={src}
        alt={product.nm}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </div>
  );
}

/**
 * Saved-design thumbnail. The baked Konva mockup (uploaded at the artwork step)
 * is the source of truth for the default look — it is preferred whenever
 * present. Live compositing remains for tinted colour variants (using every
 * saved print-area artwork) and for products that never got a bake.
 */
export function DesignedProductThumb({
  product,
  artworkUrl,
  tintHex,
  preferBakedMockup = true,
  view: viewProp,
  onViewChange,
  /** Show back on hover instead of Front/Back buttons (Swag collection cards). */
  hoverSwapViews = false,
  /** Force front view and hide Front/Back chips (e.g. Send Kit recipient table). */
  frontOnly = false,
  className,
  style,
}: {
  product: UiProduct;
  artworkUrl?: string;
  /** Garment colour for mask-based previews (store colour picker). Omit for baked default. */
  tintHex?: string;
  /** When true, prefer the saved baked mockup unless a non-white tint is set. */
  preferBakedMockup?: boolean;
  /** Controlled garment view (shop PDP gallery). */
  view?: ProductViewKey;
  onViewChange?: (view: ProductViewKey) => void;
  /** Hover swaps to back when a back asset exists; hides Front/Back chips. */
  hoverSwapViews?: boolean;
  frontOnly?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const bakedFront = resolveMediaUrl(product.mockupUrl);
  const bakedBack = resolveMediaUrl(product.mockupBackUrl);
  const availableViews = listProductViews(product);
  const canShowBack = availableViews.includes("back");
  const canShowFront = availableViews.includes("front");
  const [uncontrolledView, setUncontrolledView] = useState<ProductViewKey>("front");
  const view = frontOnly ? "front" : (viewProp ?? uncontrolledView);
  const setView = (next: ProductViewKey) => {
    if (frontOnly) return;
    onViewChange?.(next);
    if (viewProp == null) setUncontrolledView(next);
  };
  const useHoverSwap = !frontOnly && hoverSwapViews && canShowBack && canShowFront && viewProp == null;

  // Only use the bake that matches the active view — never fall back to the other side.
  const viewBaked = view === "back" ? bakedBack : view === "front" ? bakedFront : "";
  const allLayers = resolveProductArtworkLayers(product, artworkUrl);
  const layers =
    availableViews.length > 1
      ? allLayers.filter((l) => {
          const area = pickPrintArea(product, l.areaKey);
          return printAreaViewKey(product, area) === view;
        })
      : allLayers;
  const overlay =
    layers[0]?.artUrl ||
    // Shared collection artwork is front-only; never overlay it onto non-front views.
    (view !== "front"
      ? ""
      : artworkUrl
        ? resolveMediaUrl(artworkUrl)
        : "");
  const printAreaBase = resolveMediaUrl(pickPrintArea(product, layers[0]?.areaKey)?.mockupImageUrl);
  // Never fall back to the opposite garment view — that made "Back" look like Front on the shop.
  const stageBase =
    view === "back"
      ? resolveMediaUrl(product.baseBackImageUrl)
      : view === "left"
        ? resolveMediaUrl(product.baseLeftImageUrl)
        : view === "right"
          ? resolveMediaUrl(product.baseRightImageUrl)
          : resolveMediaUrl(product.baseImageUrl);
  const resolvedMask =
    view === "back"
      ? resolveMediaUrl(product.maskBackImageUrl)
      : view === "left"
        ? resolveMediaUrl(product.maskLeftImageUrl)
        : view === "right"
          ? resolveMediaUrl(product.maskRightImageUrl)
          : resolveMediaUrl(product.maskImageUrl);
  /** Garment image for live colour tinting — mask/stage first, then Shopify primary. */
  const tintMask =
    resolvedMask ||
    stageBase ||
    printAreaBase ||
    (view === "front"
      ? resolveMediaUrl(product.photoUrl) || resolveMediaUrl(product.imageUrls?.[0])
      : undefined);
  const maskStage = tintMask || resolveMediaUrl(designImgUrl(product, layers[0]?.areaKey));
  const base =
    maskStage ||
    resolveMediaUrl(product.photoUrl) ||
    productThumbUrl(product, false) ||
    productThumbUrl(product, true);

  const isDefaultTint = isDefaultMockupTint(tintHex);
  const showBaked = Boolean(viewBaked && isDefaultTint && preferBakedMockup);
  const liveTintHex = tintHex || DEFAULT_MOCKUP_TINT_HEX;
  const showViewToggle = !frontOnly && availableViews.length > 1 && viewProp == null && !hoverSwapViews;
  const viewLabel = (v: ProductViewKey) =>
    v === "front" ? "Front" : v === "back" ? "Back" : v === "left" ? "Left" : "Right";

  const viewToggle = showViewToggle ? (
    <div
      className="row"
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 2,
        gap: 4,
      }}
    >
      {availableViews.map((v) => {
        return (
          <button
            key={v}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setView(v);
            }}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 6,
              border: view === v ? "1.5px solid var(--brand)" : "1px solid var(--line)",
              background: view === v ? "var(--brand-50)" : "rgba(255,255,255,.92)",
              color: view === v ? "var(--brand-d)" : "var(--ink-2)",
              cursor: "pointer",
            }}
          >
            {viewLabel(v)}
          </button>
        );
      })}
    </div>
  ) : null;

  const baked = viewBaked || "";
  const inner =
    showBaked ? (
      <div className="img img-mockup" style={{ position: "relative" }}>
        {viewToggle}
        <img
          src={baked}
          alt={product.nm}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    ) : !isDefaultTint && tintMask ? (
      // Tint the active view even when it has no print artwork (e.g. blank back).
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {viewToggle}
        <TintedMockupImage
          product={product}
          layers={layers}
          tintHex={liveTintHex}
          maskUrl={tintMask}
          fallback={
            <MaskArtworkComposite
              product={product}
              mask={tintMask}
              layers={layers}
              tintHex={liveTintHex}
            />
          }
        />
      </div>
    ) : layers.length && resolvedMask ? (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {viewToggle}
        <MaskArtworkComposite
          product={product}
          mask={resolvedMask}
          layers={layers}
          tintHex={liveTintHex}
        />
      </div>
    ) : layers.length && maskStage ? (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {viewToggle}
        <LiveArtworkComposite product={product} base={maskStage} layers={layers} />
      </div>
    ) : overlay && resolvedMask ? (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {viewToggle}
        <MaskArtworkComposite
          product={product}
          mask={resolvedMask}
          layers={[
            {
              areaKey: layers[0]?.areaKey || "area_1",
              artUrl: overlay,
              placement: product.placement ?? defaultPlacement(product),
            },
          ]}
          tintHex={liveTintHex}
        />
      </div>
    ) : baked ? (
      <div className="img img-mockup" style={{ position: "relative" }}>
        {viewToggle}
        <img
          src={baked}
          alt={product.nm}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    ) : (
      <div className={`img${base ? " img-mockup" : ""}`} style={{ position: "relative" }}>
        {viewToggle}
        {base ? (
          <img
            src={base}
            alt={product.nm}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        ) : (
          <div
            className="sm-skeleton-img"
            aria-hidden="true"
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
    );

  if (!className && !style && !useHoverSwap) return inner;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        ...(className === "sf-pdp-thumb" ? {} : { height: "100%" }),
        ...style,
      }}
      onMouseEnter={useHoverSwap ? () => setUncontrolledView("back") : undefined}
      onMouseLeave={useHoverSwap ? () => setUncontrolledView("front") : undefined}
    >
      {inner}
    </div>
  );
}

/** Map storefront product rows onto the shared mockup thumbnail shape. */
export function storeProductAsUi(p: {
  _id?: string;
  catalogProductId?: string;
  name: string;
  brand?: string;
  group?: string;
  maskImageUrl?: string;
  baseImageUrl?: string;
  maskBackImageUrl?: string;
  baseBackImageUrl?: string;
  maskLeftImageUrl?: string;
  baseLeftImageUrl?: string;
  maskRightImageUrl?: string;
  baseRightImageUrl?: string;
  mockupUrl?: string;
  mockupBackUrl?: string;
  placement?: UiProduct["placement"];
  placements?: Array<
    NonNullable<UiProduct["placement"]> & { key: string; artworkUrl?: string }
  >;
  printAreas?: UiProduct["printAreas"];
  physicalDimensions?: UiProduct["physicalDimensions"];
  dpi?: UiProduct["dpi"];
  primaryImageUrl?: string;
  imageUrls?: string[];
}): UiProduct {
  const catalogId =
    p.catalogProductId || (p._id?.includes(":") ? p._id.split(":").pop() : p._id) || undefined;
  const photo = resolveMediaUrl(p.primaryImageUrl) || resolveMediaUrl(p.imageUrls?.[0]) || "";
  const mask = resolveMediaUrl(p.maskImageUrl);
  const base = resolveMediaUrl(p.baseImageUrl);

  const areaPlacements: NonNullable<UiProduct["areaPlacements"]> = {};
  if (Array.isArray(p.placements)) {
    for (const row of p.placements) {
      if (!row?.key) continue;
      const art = row.artworkUrl ? resolveMediaUrl(row.artworkUrl) || row.artworkUrl : "";
      areaPlacements[row.key] = {
        xPct: row.xPct,
        yPct: row.yPct,
        wPct: row.wPct,
        rot: row.rot,
        ...(Number.isFinite(row.printCxPct) ? { printCxPct: row.printCxPct } : {}),
        ...(Number.isFinite(row.printCyPct) ? { printCyPct: row.printCyPct } : {}),
        ...(Number.isFinite(row.printWPct) ? { printWPct: row.printWPct } : {}),
        ...(art ? { artworkUrl: art } : {}),
      };
    }
  }
  if (!Object.keys(areaPlacements).length && p.placement) {
    areaPlacements.area_1 = { ...p.placement };
  }

  return {
    id: catalogId,
    g: p.group || "tee",
    brand: p.brand || "",
    nm: p.name,
    price: "",
    sw: 4,
    maskImageUrl: mask,
    baseImageUrl: base,
    maskBackImageUrl: resolveMediaUrl(p.maskBackImageUrl),
    baseBackImageUrl: resolveMediaUrl(p.baseBackImageUrl),
    maskLeftImageUrl: resolveMediaUrl(p.maskLeftImageUrl),
    baseLeftImageUrl: resolveMediaUrl(p.baseLeftImageUrl),
    maskRightImageUrl: resolveMediaUrl(p.maskRightImageUrl),
    baseRightImageUrl: resolveMediaUrl(p.baseRightImageUrl),
    imgUrl: mask || base,
    photoUrl: photo,
    mockupUrl: p.mockupUrl,
    mockupBackUrl: p.mockupBackUrl,
    placement: p.placement,
    areaPlacements: Object.keys(areaPlacements).length ? areaPlacements : undefined,
    printAreas: p.printAreas,
    physicalDimensions: p.physicalDimensions,
    dpi: p.dpi,
  };
}
