import { useEffect, useRef, useState, type DragEvent } from "react";
import { Check, CircleHelp, Eye, Info, MoreHorizontal, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mediaUrlForCanvas } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { ProductThumb } from "@/features/shops/ProductThumb";
import { MockupCanvas } from "@/features/swag/MockupCanvas";
import { MockupViewGallery } from "@/features/swag/MockupViewGallery";
import {
  designImgUrlForView,
  listPrintAreas,
  listPrintAreasForView,
  listProductViews,
  placementKey,
  printAreaKey,
  printAreaViewKey,
  type Placement,
  type ProductViewKey,
} from "@/features/swag/mockup-bake";
import {
  defaultWhiteColorIndex,
  getMockupTintHex,
  productColorHex,
  productColorNames,
} from "@/features/swag/colors";
import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import {
  loadArtworkHistory,
  rememberArtwork,
  type PreviousArtwork,
} from "@/features/swag/wizard/artworkHistory";
import { kitPreferredPrintAreaKey } from "../kitPrintArea";
import type { KitArtFile } from "../wizard/kitDraft";

const ART_ACCEPT = /\.(svg|png|jpe?g|ai)$/i;
const ART_MAX = 5 * 1024 * 1024;

type ArtTab = "upload" | "previous";
type PrintQuality = "good" | "poor";

/** Kit branding step — upload on the left; per-product editing opens in a modal. */
export function KitBrandingStep({
  products,
  art,
  placements,
  placementEpoch,
  notes,
  onSetArt,
  onClearArt,
  onResetPlacements,
  onPlacementChange,
  onNotes,
}: {
  stepBadge?: string;
  products: UiProduct[];
  art: KitArtFile | null;
  placements: Record<string, Placement>;
  placementEpoch: number;
  notes: string;
  onSetArt: (art: KitArtFile) => void;
  onClearArt: () => void;
  onResetPlacements: () => void;
  onPlacementChange: (key: string, placement: Placement) => void;
  onNotes: (notes: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ArtTab>("upload");
  const [dragging, setDragging] = useState(false);
  const [staging, setStaging] = useState<KitArtFile | null>(art);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [previousUploads, setPreviousUploads] = useState<PreviousArtwork[]>(() =>
    loadArtworkHistory(),
  );
  const [editIdx, setEditIdx] = useState<number | null>(null);
  /** Products the user has saved from the branding modal (custom placement). */
  const [customizedKeys, setCustomizedKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (art) setStaging(art);
  }, [art]);

  useEffect(() => {
    setCustomizedKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        if (placements[key]) next.add(key);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [placements]);

  function clearStaging() {
    setStaging(null);
    if (art) onClearArt();
    setCustomizedKeys(new Set());
  }

  function onPick(file: File) {
    if (!ART_ACCEPT.test(file.name)) {
      toast.error("Accepted formats: SVG, PNG, JPG, AI");
      return;
    }
    if (file.size > ART_MAX) {
      toast.error("File must be 5 MB or smaller");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setStaging({ name: file.name, preview: String(reader.result), file });
    reader.readAsDataURL(file);
    setTab("upload");
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPick(file);
  }

  function applyArtwork() {
    if (!staging) return;
    onSetArt(staging);
    setCustomizedKeys(new Set());
    rememberArtwork({
      id: staging.preview,
      name: staging.name,
      preview: staging.preview,
      fileType: fileTypeFromName(staging.name),
    });
    setPreviousUploads(loadArtworkHistory());
  }

  function selectPrevious(item: PreviousArtwork) {
    if (staging?.preview === item.preview) {
      setStaging(null);
      if (art?.preview === item.preview) onClearArt();
      return;
    }
    setStaging({
      name: item.name,
      preview: item.preview,
    });
  }

  const editingProduct = editIdx != null ? products[editIdx] : null;
  const editingKey =
    editingProduct && editIdx != null ? placementKey(editingProduct, editIdx) : "";

  return (
    <div className="sw-art-studio">
      <div className="sw-art-layout">
        <header className="sw-art-page-head">
          <h1>Brand your kit</h1>
          <p className="sw-art-page-lead">
            Upload your artwork and place it on each product. You can edit or update your design
            anytime. Our team will mock up every item for approval.{" "}
            <span className="sw-art-page-info" title="Decoration info" aria-label="More information">
              <Info size={11} strokeWidth={2.5} />
            </span>
          </p>
        </header>

        {!art && !bannerDismissed ? (
          <div className="sw-art-alert">
            <span>
              Add your artwork on the left to preview it on every product — all colour variants are
              included. Click a product to fine-tune placement.
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

        <aside className="sw-art-panel">
          <h2 className="sw-art-panel-title">Add New Artwork</h2>

          <div className="sw-art-tabs" role="tablist" aria-label="Artwork source">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "upload"}
              className={`sw-art-tab${tab === "upload" ? " on" : ""}`}
              onClick={() => setTab("upload")}
            >
              Upload from device
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "previous"}
              className={`sw-art-tab${tab === "previous" ? " on" : ""}`}
              onClick={() => setTab("previous")}
            >
              Previous uploads
            </button>
          </div>

          {tab === "upload" ? (
            <div className="sw-art-tab-body sw-art-upload-body">
              {staging ? (
                <ArtworkPickRow
                  preview={staging.preview}
                  name={staging.name}
                  fileType={fileTypeFromName(staging.name)}
                  selected
                  displayOnly
                  onRemove={clearStaging}
                />
              ) : (
                <button
                  type="button"
                  className={`sw-art-upload-area${dragging ? " drag" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <Upload size={18} />
                  <span>Choose a file from your device</span>
                </button>
              )}
            </div>
          ) : (
            <div className="sw-art-prev-scroll">
              <div className="sw-art-tab-body sw-art-prev-list">
                {previousUploads.length ? (
                  previousUploads.map((item) => (
                    <ArtworkPickRow
                      key={item.id}
                      preview={item.preview}
                      name={item.name}
                      fileType={item.fileType}
                      selected={staging?.preview === item.preview}
                      onSelect={() => selectPrevious(item)}
                      onRemove={staging?.preview === item.preview ? clearStaging : undefined}
                    />
                  ))
                ) : (
                  <div className="sw-art-prev-empty mut3">
                    No previous uploads yet. Upload artwork from your device first.
                  </div>
                )}
              </div>
            </div>
          )}

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

          <div className="sw-art-quality-tip">
            <CircleHelp size={14} />
            <span>
              Choose a high-quality file to prevent production delays and ensure the best results.
              Use a logo with a transparent background and ensure all other artwork has a resolution
              of at least 300 DPI.{" "}
              <button type="button" className="lnk sw-art-quality-link">
                Learn more
              </button>
            </span>
          </div>

          <button
            type="button"
            className="btn btn-block sw-art-add-btn"
            disabled={!staging}
            onClick={applyArtwork}
          >
            Add artwork
          </button>

          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label className="lbl" htmlFor="kit-brand-notes">
              Notes to design team{" "}
              <span
                className="mut3"
                style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}
              >
                (optional)
              </span>
            </label>
            <textarea
              id="kit-brand-notes"
              className="inp"
              rows={3}
              placeholder="e.g. White logo on the chest, full-colour on mugs"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              style={{
                resize: "vertical",
                minHeight: 72,
                padding: "10px 12px",
                lineHeight: 1.45,
                marginTop: 8,
              }}
            />
          </div>

          {art ? (
            <button
              type="button"
              className="btn btn-ghost btn-block btn-sm sw-art-reset"
              onClick={() => {
                onResetPlacements();
                setCustomizedKeys(new Set());
                toast.success("Artwork placement reset on all products");
              }}
            >
              Reset placement on all products
            </button>
          ) : null}
        </aside>

        <div className="sw-art-preview-stage">
          {art ? (
            <div className="sw-art-preview-head">
              <div>
                <div className="sw-art-preview-title">Your mockups</div>
                <div className="mut3 sw-art-preview-hint">
                  Click a product to adjust logo placement, size, and colour preview
                </div>
              </div>
              <span className="sw-art-applied-badge">
                <Check size={13} strokeWidth={2.5} />
                Applied to all {products.length} products
              </span>
            </div>
          ) : null}

          <div className="sw-art-preview-scroll">
            <div className="sw-mockups">
              {products.map((p, idx) => {
                const key = placementKey(p, idx);
                const areaKey = kitPreferredPrintAreaKey(p);
                const customized = customizedKeys.has(key);
                return (
                  <div
                    key={key}
                    className={`pcard mockup-card sw-mockup-card${art ? " sw-mockup-card--editable" : ""}`}
                  >
                    {art ? (
                      <button
                        type="button"
                        className="sw-mockup-menu"
                        aria-label={`Edit branding for ${p.nm}`}
                        onClick={() => setEditIdx(idx)}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    ) : null}
                    {art?.preview ? (
                      <button
                        type="button"
                        className="sw-mockup-card-hit"
                        onClick={() => setEditIdx(idx)}
                        aria-label={`Edit branding for ${p.nm}`}
                      >
                        <MockupCanvas
                          product={p}
                          artUrl={art.preview}
                          printAreaKey={areaKey}
                          placement={placements[key]}
                          resetEpoch={placementEpoch}
                          previewMode
                        />
                      </button>
                    ) : (
                      <ProductThumb product={p} branded />
                    )}
                    <div className="meta">
                      {p.brand ? <div className="brand">{p.brand}</div> : null}
                      <div className="nm">{p.nm}</div>
                      {art ? (
                        <div className={`sw-mockup-card-status${customized ? " is-custom" : ""}`}>
                          {customized ? "Customized" : "Default branding"}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editingProduct && art?.preview && editIdx != null ? (
        <ProductBrandingModal
          product={editingProduct}
          productIdx={editIdx}
          artUrl={art.preview}
          placement={placements[editingKey]}
          placementEpoch={placementEpoch}
          open
          onOpenChange={(open) => {
            if (!open) setEditIdx(null);
          }}
          onSave={(next) => {
            onPlacementChange(editingKey, next);
            setCustomizedKeys((prev) => new Set(prev).add(editingKey));
            toast.success(`Saved branding for ${editingProduct.nm}`);
            setEditIdx(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProductBrandingModal({
  product,
  productIdx,
  artUrl,
  placement,
  placementEpoch,
  open,
  onOpenChange,
  onSave,
}: {
  product: UiProduct;
  productIdx: number;
  artUrl: string;
  placement?: Placement;
  placementEpoch: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (placement: Placement) => void;
}) {
  const preferredAreaKey = kitPreferredPrintAreaKey(product);
  const preferredArea = listPrintAreas(product).find(
    (a, i) => printAreaKey(product, a, i) === preferredAreaKey,
  );
  const preferredView = printAreaViewKey(product, preferredArea);
  const views = listProductViews(product);
  const colorNames = productColorNames(product);
  const colorNamesKey = colorNames.join("|");

  const [draftPlacement, setDraftPlacement] = useState<Placement | undefined>(placement);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [view, setView] = useState<ProductViewKey>(preferredView);
  const [colorIdx, setColorIdx] = useState(() => defaultWhiteColorIndex(colorNames));
  const [hasPickedColor, setHasPickedColor] = useState(false);
  const [activeAreaKey, setActiveAreaKey] = useState(preferredAreaKey);

  useEffect(() => {
    if (!open) return;
    setDraftPlacement(placement);
    setMode("edit");
    setView(preferredView);
    setActiveAreaKey(preferredAreaKey);
    setColorIdx(defaultWhiteColorIndex(colorNamesKey ? colorNamesKey.split("|") : []));
    setHasPickedColor(false);
  }, [open, productIdx, placement, preferredView, preferredAreaKey, colorNamesKey]);

  const title = product.brand ? `${product.brand} ${product.nm}` : product.nm;
  const tintHex = getMockupTintHex(
    colorNames[colorIdx] ? productColorHex(product, colorNames[colorIdx]) : undefined,
    hasPickedColor,
  );
  const areasForView = listPrintAreasForView(product, view);
  const allAreas = listPrintAreas(product);
  const areaKeysForView = areasForView.map((a) =>
    printAreaKey(product, a, Math.max(0, allAreas.indexOf(a))),
  );
  const editableOnView = areaKeysForView.includes(activeAreaKey);
  const backMaskMissing = view === "back" && !designImgUrlForView(product, "back");

  const previewProduct: UiProduct = {
    ...product,
    placement: draftPlacement,
    areaPlacements: draftPlacement
      ? {
          ...(product.areaPlacements || {}),
          [preferredAreaKey]: { ...draftPlacement, artworkUrl: artUrl },
        }
      : product.areaPlacements,
    // Prefer live overlay of the uploaded art over any stale baked mockup.
    mockupUrl: undefined,
    mockupBackUrl: undefined,
  };

  function selectView(next: ProductViewKey) {
    setView(next);
    const keys = listPrintAreasForView(product, next).map((a) =>
      printAreaKey(product, a, Math.max(0, allAreas.indexOf(a))),
    );
    if (keys.includes(preferredAreaKey)) {
      setActiveAreaKey(preferredAreaKey);
    } else if (keys[0]) {
      setActiveAreaKey(keys[0]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal sw-brand-modal" style={{ maxWidth: "min(720px,96vw)", width: "100%" }}>
        <div className="modal-pad sw-brand-modal__body">
          <DialogHeader className="sw-brand-modal__head">
            <DialogTitle style={{ fontSize: 18 }}>{title}</DialogTitle>
            <DialogDescription className="sr-only">
              Edit logo placement for {title}
            </DialogDescription>
            <p className="mut3 sw-brand-modal__hint">
              {mode === "preview"
                ? "Final preview — no guides or handles"
                : "Select a placeholder · drag to move · corners to scale · top handle to rotate"}
            </p>
          </DialogHeader>

          <div className="sw-brand-modal__stage">
            {mode === "preview" ? (
              <div className="sw-brand-modal__preview">
                {tintHex ? (
                  <DesignedProductThumb
                    product={previewProduct}
                    artworkUrl={artUrl}
                    tintHex={tintHex}
                    preferBakedMockup={false}
                    view={view}
                    onViewChange={setView}
                    viewTogglePlacement="below"
                  />
                ) : (
                  <MockupViewGallery
                    views={views}
                    activeView={view}
                    onChange={selectView}
                    style={{ width: "100%" }}
                    mediaClassName="sw-brand-modal__canvas-wrap"
                    renderThumb={(v) => (
                      <MockupCanvas
                        product={product}
                        artUrl={artUrl}
                        printAreaKey={preferredAreaKey}
                        placement={draftPlacement}
                        view={v}
                        previewMode
                      />
                    )}
                  >
                    <MockupCanvas
                      product={product}
                      artUrl={artUrl}
                      printAreaKey={preferredAreaKey}
                      placement={draftPlacement}
                      view={view}
                      previewMode
                      fillContainer
                    />
                  </MockupViewGallery>
                )}
              </div>
            ) : (
              <MockupViewGallery
                views={views}
                activeView={view}
                onChange={selectView}
                style={{ width: "100%" }}
                mediaClassName="sw-brand-modal__canvas-wrap"
                renderThumb={(v) => (
                  <MockupCanvas
                    product={product}
                    artUrl={artUrl}
                    printAreaKey={preferredAreaKey}
                    placement={draftPlacement}
                    view={v}
                    previewMode
                  />
                )}
              >
                {backMaskMissing ? (
                  <div className="sw-brand-modal__empty mut3">
                    No back production mask on this catalog product yet.
                  </div>
                ) : editableOnView ? (
                  <MockupCanvas
                    product={product}
                    artUrl={artUrl}
                    printAreaKey={activeAreaKey}
                    activeAreaKey={activeAreaKey}
                    placement={draftPlacement}
                    view={view}
                    resetEpoch={placementEpoch}
                    fillContainer
                    onSelectArea={setActiveAreaKey}
                    onChange={(next) => setDraftPlacement(next)}
                  />
                ) : (
                  <MockupCanvas
                    product={product}
                    artUrl={artUrl}
                    printAreaKey={preferredAreaKey}
                    placement={draftPlacement}
                    view={view}
                    previewMode
                    fillContainer
                  />
                )}
              </MockupViewGallery>
            )}
          </div>

          {colorNames.length > 0 ? (
            <div className="sw-brand-modal__colors">
              <div className="lbl" style={{ marginBottom: 6 }}>
                Colour variants
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {colorNames.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={c}
                    aria-pressed={colorIdx === i}
                    onClick={() => {
                      setHasPickedColor(true);
                      setColorIdx(i);
                    }}
                    className="sw"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: productColorHex(product, c),
                      outline: colorIdx === i ? "2px solid var(--brand)" : "1px solid var(--line)",
                      outlineOffset: 1,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              {mode === "edit" ? (
                <p className="mut3" style={{ marginTop: 8, fontSize: 12 }}>
                  Colour applies in Preview — click Preview to see branding on this variant.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="sw-brand-modal__footer">
            {mode === "preview" ? (
              <button type="button" className="btn btn-ghost" onClick={() => setMode("edit")}>
                Back to edit
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setMode("preview")}
              >
                <Eye size={15} strokeWidth={2.25} aria-hidden />
                Preview
              </button>
            )}
            <div className="sw-brand-modal__footer-right">
              <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-brand"
                onClick={() => {
                  if (!draftPlacement) {
                    toast.error("Adjust the logo placement before saving");
                    return;
                  }
                  onSave(draftPlacement);
                }}
              >
                Save Changes
              </button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
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

  void quality;

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
