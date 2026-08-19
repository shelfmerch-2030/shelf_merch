import { useEffect, useRef, useState, type DragEvent } from "react";
import { Check, CircleHelp, Info, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { mediaUrlForCanvas } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { MockupCanvas, buildMockupLayers } from "../MockupCanvas";
import { MockupViewGallery } from "../MockupViewGallery";
import {
  areaPlacementKey,
  designImgUrl,
  designImgUrlForView,
  listPrintAreas,
  listPrintAreasForView,
  listProductViews,
  placementKey,
  primaryAreaKey,
  printAreaKey,
  printAreaViewKey,
  type Placement,
  type ProductViewKey,
} from "../mockup-bake";
import type { ArtFile } from "../swagDraft";
import { rememberArtwork, type PreviousArtwork } from "./artworkHistory";

const ART_ACCEPT = /\.(svg|png|jpe?g|ai)$/i;
const ART_MAX = 5 * 1024 * 1024;

type PrintQuality = "good" | "poor";
type Focus = { productIdx: number; areaKey: string; view: ProductViewKey };

function productHasArtwork(
  product: UiProduct,
  idx: number,
  areaArts: Record<string, ArtFile>,
): boolean {
  const areas = listPrintAreas(product);
  const list = areas.length ? areas : [null];
  return list.some((a, i) =>
    Boolean(areaArts[areaPlacementKey(product, idx, printAreaKey(product, a, i))]),
  );
}

function defaultAreaKey(product: UiProduct, view: ProductViewKey = "front"): string {
  const areas = listPrintAreasForView(product, view);
  if (areas.length) {
    const all = listPrintAreas(product);
    const a = areas[0];
    return printAreaKey(product, a, Math.max(0, all.indexOf(a)));
  }
  if (view === "front") return primaryAreaKey(product);
  return "";
}

function defaultView(product: UiProduct): ProductViewKey {
  return listProductViews(product)[0] || "front";
}

export function ArtworkStep({
  products,
  art: _art,
  areaArts,
  placements,
  placementEpoch,
  previousUploads,
  onSetArt,
  onClearArt,
  onSetAreaArt,
  onSetAreaArts,
  onClearAreaArt,
  onResetPlacements,
  onPlacementChange,
}: {
  products: UiProduct[];
  art: ArtFile | null;
  areaArts: Record<string, ArtFile>;
  placements: Record<string, Placement>;
  placementEpoch: number;
  previousUploads: PreviousArtwork[];
  onSetArt: (art: ArtFile) => void;
  onClearArt: () => void;
  onSetAreaArt: (key: string, art: ArtFile) => void;
  onSetAreaArts: (keys: string[], art: ArtFile) => void;
  onClearAreaArt: (key: string) => void;
  onResetPlacements: () => void;
  onPlacementChange: (key: string, placement: Placement) => void;
}) {
  void _art;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  /** Null until a product/placeholder is available; auto-seeds to first product. */
  const [focus, setFocus] = useState<Focus | null>(null);

  useEffect(() => {
    if (!products.length) return;
    if (!focus) {
      const p0 = products[0];
      const view = defaultView(p0);
      setFocus({ productIdx: 0, areaKey: defaultAreaKey(p0, view), view });
      return;
    }
    const p = products[Math.min(focus.productIdx, products.length - 1)] || products[0];
    const views = listProductViews(p);
    const view = views.includes(focus.view) ? focus.view : views[0] || "front";
    const keys = listPrintAreasForView(p, view).map((a) => {
      const all = listPrintAreas(p);
      return printAreaKey(p, a, Math.max(0, all.indexOf(a)));
    });
    const nextKey = keys.includes(focus.areaKey)
      ? focus.areaKey
      : keys[0] || defaultAreaKey(p, view);
    const nextIdx = Math.min(focus.productIdx, products.length - 1);
    if (nextIdx !== focus.productIdx || nextKey !== focus.areaKey || view !== focus.view) {
      setFocus({ productIdx: nextIdx, areaKey: nextKey, view });
    }
  }, [products, focus]);

  const designedCount = products.reduce(
    (n, p, idx) => n + (productHasArtwork(p, idx, areaArts) ? 1 : 0),
    0,
  );

  const focusIdx = focus ? Math.min(focus.productIdx, products.length - 1) : 0;
  const focusedProduct = products[focusIdx] || null;
  const productViews = focusedProduct ? listProductViews(focusedProduct) : (["front"] as ProductViewKey[]);
  const activeView: ProductViewKey = focus?.view || "front";
  const focusedAreas = focusedProduct
    ? listPrintAreasForView(focusedProduct, activeView)
    : [];
  const allFocusedAreas = focusedProduct ? listPrintAreas(focusedProduct) : [];
  const focusedArea =
    focus && focusedProduct
      ? focusedAreas.find(
          (a) =>
            printAreaKey(focusedProduct, a, Math.max(0, allFocusedAreas.indexOf(a))) === focus.areaKey,
        ) || focusedAreas[0]
      : null;
  const focusedAreaLabel = focusedArea?.label || focus?.areaKey || "print area";
  const focusedDraftKey =
    focus && focusedProduct
      ? areaPlacementKey(focusedProduct, focusIdx, focus.areaKey)
      : "";
  const focusedAreaArt = focusedDraftKey ? areaArts[focusedDraftKey] : null;
  const canUpload = Boolean(focus && focusedDraftKey && focusedProduct && focus.areaKey);
  const backMaskMissing =
    activeView === "back" &&
    focusedProduct &&
    !designImgUrlForView(focusedProduct, "back");

  function selectProduct(idx: number) {
    const p = products[idx];
    if (!p) return;
    const views = listProductViews(p);
    const view =
      focus?.view && views.includes(focus.view) ? focus.view : views[0] || "front";
    const keys = listPrintAreasForView(p, view).map((a) => {
      const all = listPrintAreas(p);
      return printAreaKey(p, a, Math.max(0, all.indexOf(a)));
    });
    const keep =
      focus?.areaKey && keys.includes(focus.areaKey)
        ? focus.areaKey
        : keys[0] || defaultAreaKey(p, view);
    setFocus({ productIdx: idx, areaKey: keep, view });
  }

  function selectView(view: ProductViewKey) {
    if (!focusedProduct || focus == null) return;
    const keys = listPrintAreasForView(focusedProduct, view).map((a) => {
      const all = listPrintAreas(focusedProduct);
      return printAreaKey(focusedProduct, a, Math.max(0, all.indexOf(a)));
    });
    setFocus({
      productIdx: focus.productIdx,
      view,
      areaKey: keys[0] || defaultAreaKey(focusedProduct, view),
    });
  }

  function remember(file: ArtFile) {
    rememberArtwork({
      id: file.preview,
      name: file.name,
      preview: file.preview,
      fileType: fileTypeFromName(file.name),
    });
  }

  function assignToFocused(file: ArtFile) {
    if (!focus || !focusedDraftKey) {
      toast.error("Select a print-area placeholder on the mockup first");
      return;
    }
    onSetAreaArt(focusedDraftKey, file);
    remember(file);
    toast.success(`Artwork added to ${focusedAreaLabel}`);
  }

  function onPick(file: File) {
    if (!canUpload) {
      toast.error("Select a print-area placeholder on the mockup first");
      return;
    }
    if (!ART_ACCEPT.test(file.name)) {
      toast.error("Accepted formats: SVG, PNG, JPG, AI");
      return;
    }
    if (file.size > ART_MAX) {
      toast.error("File must be 5 MB or smaller");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      assignToFocused({ name: file.name, preview: String(reader.result), file });
    };
    reader.readAsDataURL(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPick(file);
  }

  function applyPrevious(item: PreviousArtwork) {
    assignToFocused({ name: item.name, preview: item.preview });
  }

  function applyToAllAreasOnProduct(file: ArtFile) {
    if (!focusedProduct || focus == null) return;
    const areas = listPrintAreas(focusedProduct);
    const list = areas.length ? areas : [null];
    const keys = list.map((a, i) =>
      areaPlacementKey(focusedProduct, focus.productIdx, printAreaKey(focusedProduct, a, i)),
    );
    onSetAreaArts(keys, file);
    remember(file);
    toast.success(`Artwork applied to all ${keys.length} print areas`);
  }

  function applyToEveryArea(file: ArtFile) {
    const keys: string[] = [];
    products.forEach((p, idx) => {
      const areas = listPrintAreas(p);
      const list = areas.length ? areas : [null];
      list.forEach((a, i) => keys.push(areaPlacementKey(p, idx, printAreaKey(p, a, i))));
    });
    onSetAreaArts(keys, file);
    onSetArt(file);
    remember(file);
    toast.success(`Artwork applied to ${keys.length} print areas`);
  }

  const layers =
    focusedProduct && focus
      ? buildMockupLayers(focusedProduct, {
          idx: focusIdx,
          areaArts,
          placements,
          activeAreaKey: focus.areaKey,
          view: activeView,
        })
      : [];

  return (
    <div className="sw-art-studio sw-art-studio--canvas">
      <header className="sw-art-studio-head">
        <div>
          <h1>Add artwork to your products</h1>
          <p className="sw-art-page-lead">
            Select a product, click a placeholder on the mockup, then upload artwork. DTF decoration
            ·{" "}
            <span className="sw-art-page-info" title="Decoration info" aria-label="More information">
              <Info size={11} strokeWidth={2.5} />
            </span>
          </p>
        </div>
        <div className="sw-art-progress" aria-live="polite">
          <span className="sw-art-progress-count">
            {designedCount} / {products.length}
          </span>
          <span className="sw-art-progress-label">Products Designed</span>
        </div>
      </header>

      {!designedCount && !bannerDismissed ? (
        <div className="sw-art-alert sw-art-alert--bar">
          <span>
            Tip: click a dashed print-area box on the mockup, then upload artwork for that
            placeholder. You can leave products blank and continue anytime.
          </span>
          <button
            type="button"
            className="sw-art-alert-close"
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="sw-art-canvas-layout">
        {/* LEFT — products */}
        <aside className="sw-art-products" aria-label="Selected products">
          <div className="sw-art-products-title">Products</div>
          <div className="sw-art-products-list">
            {products.map((p, idx) => {
              const designed = productHasArtwork(p, idx, areaArts);
              const selected = focusIdx === idx;
              const thumb = p.photoUrl || designImgUrl(p) || p.imgUrl || "";
              return (
                <button
                  key={placementKey(p, idx)}
                  type="button"
                  className={`sw-art-product-card${selected ? " is-selected" : ""}${designed ? " is-designed" : ""}`}
                  onClick={() => selectProduct(idx)}
                  aria-pressed={selected}
                >
                  <span className="sw-art-product-thumb">
                    {thumb ? <img src={thumb} alt="" /> : <span className="sw-art-product-thumb-empty" />}
                  </span>
                  <span className="sw-art-product-copy">
                    <span className="sw-art-product-name">{p.nm}</span>
                    <span className={`sw-art-product-badge${designed ? " on" : ""}`}>
                      {designed ? (
                        <>
                          <Check size={11} strokeWidth={2.75} aria-hidden /> Designed
                        </>
                      ) : (
                        "Not Designed"
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* CENTER — large canvas */}
        <section className="sw-art-canvas-stage" aria-label="Design canvas">
          {focusedProduct && focus ? (
            <div key={placementKey(focusedProduct, focusIdx)} className="sw-art-canvas-frame">
              <div className="sw-art-canvas-meta">
                <div>
                  {focusedProduct.brand ? (
                    <div className="sw-art-canvas-brand">{focusedProduct.brand}</div>
                  ) : null}
                  <div className="sw-art-canvas-name">{focusedProduct.nm}</div>
                </div>
                <div className="mut3 sw-art-canvas-hint">
                  Click a placeholder · drag to move · corners to scale
                </div>
              </div>
              {backMaskMissing ? (
                <div className="mut3" style={{ marginBottom: 10, fontSize: 13 }}>
                  No back production mask on this catalog product yet — upload one in the platform
                  product wizard to design the back view.
                </div>
              ) : null}
              <MockupViewGallery
                views={productViews}
                activeView={activeView}
                onChange={selectView}
                style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}
                mediaClassName="sw-art-canvas-board"
                mediaStyle={{
                  flex: 1,
                  minHeight: 0,
                  padding: 0,
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                renderThumb={(view) => {
                  const thumbLayers = buildMockupLayers(focusedProduct, {
                    idx: focusIdx,
                    areaArts,
                    placements,
                    view,
                  });
                  return (
                    <MockupCanvas product={focusedProduct} layers={thumbLayers} view={view} />
                  );
                }}
              >
                <div className="sw-art-canvas-slot">
                  {backMaskMissing ? (
                    <div className="sw-art-canvas-empty">Back view image unavailable</div>
                  ) : (
                    <MockupCanvas
                      product={focusedProduct}
                      layers={layers}
                      activeAreaKey={focus.areaKey}
                      view={activeView}
                      resetEpoch={placementEpoch}
                      fillContainer
                      onSelectArea={(areaKey) => {
                        const area = listPrintAreas(focusedProduct).find(
                          (a, i) => printAreaKey(focusedProduct, a, i) === areaKey,
                        );
                        setFocus({
                          productIdx: focusIdx,
                          areaKey,
                          view: printAreaViewKey(focusedProduct, area),
                        });
                      }}
                      onChange={(next, areaKey) => {
                        onPlacementChange(
                          areaPlacementKey(focusedProduct, focusIdx, areaKey),
                          next,
                        );
                      }}
                    />
                  )}
                </div>
              </MockupViewGallery>
            </div>
          ) : (
            <div className="sw-art-canvas-empty">Select a product to start designing</div>
          )}
        </section>

        {/* RIGHT — artwork panel */}
        <aside className="sw-art-panel sw-art-panel--side" aria-label="Artwork">
          <h2 className="sw-art-panel-title">Artwork</h2>

          <div className={`sw-art-selected-box${canUpload ? " is-ready" : ""}`}>
            <div className="mut3 sw-art-selected-label">Selected placeholder</div>
            {canUpload && focusedProduct ? (
              <>
                <div className="sw-art-selected-title">
                  {focusedProduct.nm} · {focusedAreaLabel}
                </div>
                {focusedArea?.widthIn && focusedArea?.heightIn ? (
                  <div className="mut3 sw-art-selected-dims">
                    {Number(focusedArea.widthIn).toFixed(2)}″ ×{" "}
                    {Number(focusedArea.heightIn).toFixed(2)}″
                    {focusedArea.dpi ? ` · ${focusedArea.dpi} DPI` : ""}
                    {Number(focusedArea.rotationDeg)
                      ? ` · ${Math.round(Number(focusedArea.rotationDeg))}°`
                      : ""}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="sw-art-selected-empty">
                Click a print-area box on the mockup to select it
              </div>
            )}
          </div>

          <div className="sw-art-tab-body sw-art-upload-body">
            {focusedAreaArt ? (
              <ArtworkPickRow
                preview={focusedAreaArt.preview}
                name={focusedAreaArt.name}
                fileType={fileTypeFromName(focusedAreaArt.name)}
                selected
                displayOnly
                onRemove={() => {
                  if (!focusedDraftKey) return;
                  onClearAreaArt(focusedDraftKey);
                  toast.success("Removed artwork from this print area");
                }}
              />
            ) : null}

            <button
              type="button"
              className={`sw-art-upload-area${dragging ? " drag" : ""}`}
              disabled={!canUpload}
              onClick={() => {
                if (!canUpload) {
                  toast.error("Select a print-area placeholder on the mockup first");
                  return;
                }
                fileRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (canUpload) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              style={{ opacity: canUpload ? 1 : 0.55, cursor: canUpload ? "pointer" : "not-allowed" }}
            >
              <Upload size={18} />
              <span>
                {focusedAreaArt
                  ? `Replace artwork for ${focusedAreaLabel}`
                  : canUpload
                    ? `Upload artwork for ${focusedAreaLabel}`
                    : "Select a placeholder first"}
              </span>
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.ai,image/svg+xml,image/png,image/jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />

          {previousUploads.length > 0 ? (
            <div className="sw-art-prev-block">
              <div className="mut3 sw-art-prev-heading">Previous uploads</div>
              <div className="sw-art-prev-scroll">
                <div className="sw-art-tab-body sw-art-prev-list">
                  {previousUploads.map((item) => (
                    <ArtworkPickRow
                      key={item.id}
                      preview={item.preview}
                      name={item.name}
                      fileType={item.fileType}
                      selected={focusedAreaArt?.preview === item.preview}
                      onSelect={() => {
                        if (!canUpload) {
                          toast.error("Select a print-area placeholder on the mockup first");
                          return;
                        }
                        applyPrevious(item);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="sw-art-quality-tip">
            <CircleHelp size={14} />
            <span>
              Choose a high-quality file to prevent production delays and ensure the best results.
              Use a logo with a transparent background and ensure all other artwork has a resolution
              of at least 300 DPI.
            </span>
          </div>

          {focusedAreaArt ? (
            <div className="col sw-art-apply-actions">
              <button
                type="button"
                className="btn btn-soft btn-block btn-sm"
                disabled={!focusedProduct}
                onClick={() => applyToAllAreasOnProduct(focusedAreaArt)}
              >
                Use on all areas on this product
              </button>
              {products.length > 1 || focusedAreas.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-block btn-sm"
                  onClick={() => applyToEveryArea(focusedAreaArt)}
                >
                  Use on every print area
                </button>
              ) : null}
            </div>
          ) : null}

          {Object.keys(areaArts).length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-block btn-sm sw-art-reset"
              onClick={() => {
                onClearArt();
                onResetPlacements();
                toast.success("Cleared artwork from all print areas");
              }}
            >
              Clear all area artwork
            </button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function ArtworkPickRow({
  preview,
  name,
  fileType,
  selected,
  displayOnly,
  onSelect,
  onRemove,
}: {
  preview: string;
  name?: string;
  fileType: string;
  selected: boolean;
  displayOnly?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
}) {
  const [quality, setQuality] = useState<PrintQuality | null>(null);

  useEffect(() => {
    let cancelled = false;
    assessPrintQuality(preview).then((q) => {
      if (!cancelled) setQuality(q);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  return (
    <div
      className={`sw-art-pick-row${selected ? " on" : ""}${displayOnly ? " static" : ""}${onRemove ? " has-delete" : ""}`}
    >
      <div className="sw-art-pick-main-wrap">
        {displayOnly ? (
          <div className="sw-art-pick-main">
            <span className="sw-art-pick-thumb">
              <img src={preview} alt="" />
            </span>
            <span className="sw-art-pick-meta">
              {name ? <span className="sw-art-pick-name">{name}</span> : null}
              {/* <span className="sw-art-pick-quality">
                Print Quality:{" "}
                <strong className={quality === "poor" ? "poor" : quality === "good" ? "good" : ""}>
                  {quality === "poor"
                    ? "Poor Quality"
                    : quality === "good"
                      ? "Good Quality"
                      : "Checking…"}
                </strong>
              </span> */}
              <span className="mut3 sw-art-pick-type">File Type: {fileType}</span>
            </span>
          </div>
        ) : (
          <button type="button" className="sw-art-pick-main" onClick={onSelect}>
            <span className="sw-art-pick-thumb">
              <img src={preview} alt="" />
            </span>
            <span className="sw-art-pick-meta">
              {name ? <span className="sw-art-pick-name">{name}</span> : null}
              <span className="mut3 sw-art-pick-type">File Type: {fileType}</span>
            </span>
          </button>
        )}
        {onRemove ? (
          <button
            type="button"
            className="sw-art-pick-remove"
            aria-label="Delete artwork"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 size={18} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function fileTypeFromName(name: string) {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext || "PNG";
}

function assessPrintQuality(preview: string): Promise<PrintQuality> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve(img.naturalWidth >= 800 && img.naturalHeight >= 800 ? "good" : "poor");
    };
    img.onerror = () => resolve("poor");
    img.src = mediaUrlForCanvas(preview) || preview;
  });
}
