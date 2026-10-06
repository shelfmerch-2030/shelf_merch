import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Loader2, Pencil, UploadCloud, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UiCollection, UiProduct } from "@/services/mappers";
import { ProductInfoTabs } from "@/features/catalog/views/ProductInfoTabs";
import { productUniqueId } from "@/features/catalog/types";
import { catalogCategoryLabel } from "@/features/shops/types";
import { collectionProductColorNames, defaultWhiteColorIndex, getMockupTintHex, productColorHex, productDescription } from "./colors";
import { DesignedProductThumb } from "./DesignedProductThumb";
import { useUpdateCollectionArtwork } from "./model";
import { bakeMockup } from "./mockup-bake";

const ARTWORK_ACCEPT = ".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg";
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;

type ArtworkDraft = {
  file: File;
  preview: string;
  name: string;
};

function isSupportedArtwork(file: File) {
  const typeOk = ["image/svg+xml", "image/png", "image/jpeg"].includes(file.type);
  const nameOk = /\.(svg|png|jpe?g)$/i.test(file.name);
  return typeOk || nameOk;
}

function readArtwork(file: File): Promise<ArtworkDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        file,
        preview: String(reader.result || ""),
        name: file.name,
      });
    reader.onerror = () => reject(new Error("Could not read artwork"));
    reader.readAsDataURL(file);
  });
}

export type SwagDesignDetailProps = {
  collection: UiCollection;
  product: UiProduct;
  productIndex: number;
  shopId?: string;
  backLink: {
    href: string;
    label?: string;
  };
};

/** Full-page branded design detail (shop or swag context). */
export function SwagDesignDetail({
  collection,
  product,
  productIndex,
  shopId,
  backLink,
}: SwagDesignDetailProps) {
  const title = product.brand ? `${product.brand} ${product.nm}` : product.nm;
  const colorNames = collectionProductColorNames(collection, product);
  const [selColor, setSelColor] = useState(() => defaultWhiteColorIndex(colorNames));
  const [hasUserPickedColor, setHasUserPickedColor] = useState(false);
  const [artDialogOpen, setArtDialogOpen] = useState(false);
  const [artworkDraft, setArtworkDraft] = useState<ArtworkDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const updateArtwork = useUpdateCollectionArtwork();

  useEffect(() => {
    setSelColor(defaultWhiteColorIndex(colorNames));
    setHasUserPickedColor(false);
  }, [collection.id, product.id, product.nm, productIndex, colorNames.join("|")]);
  const previewTintHex = getMockupTintHex(
    colorNames[selColor] ? productColorHex(product, colorNames[selColor]) : undefined,
    hasUserPickedColor,
  );
  const uniqueId = collection.code || productUniqueId(product, productIndex);
  const category = product.category || catalogCategoryLabel(product);

  async function handleArtworkFile(file: File | undefined) {
    if (!file) return;
    if (!isSupportedArtwork(file)) {
      toast.error("Upload a PNG, JPG, or SVG file");
      return;
    }
    if (file.size > MAX_ARTWORK_BYTES) {
      toast.error("Artwork must be under 5 MB");
      return;
    }
    try {
      setArtworkDraft(await readArtwork(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read artwork");
    }
  }

  async function saveArtwork() {
    if (!artworkDraft) {
      toast.error("Choose an artwork first");
      return;
    }

    try {
      const mockups = await Promise.all(
        collection.products.map(async (candidate) => {
          if (!candidate.id) return null;
          const dataUrl = await bakeMockup(candidate, artworkDraft.preview, null, 1000, true);
          return dataUrl ? { catalogProductId: candidate.id, dataUrl } : null;
        }),
      );
      await updateArtwork.mutateAsync({
        collectionId: collection.id,
        artwork: { file: artworkDraft.file },
        mockups: mockups.filter((item): item is { catalogProductId: string; dataUrl: string } =>
          Boolean(item),
        ),
        catalog: collection.products,
      });
      toast.success("Artwork updated");
      setArtDialogOpen(false);
      setArtworkDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update artwork");
    }
  }

  return (
    <div className="pd-page">
      <Link
        to={backLink.href}
        className="lnk"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}
      >
        <ArrowLeft size={15} /> {backLink.label ?? "Back to shop"}
      </Link>

      <div className="pd-header">
        <div className="pd-title-wrap">
          <h1 className="pd-title">{title}</h1>
        </div>
        {shopId ? (
          <div className="pd-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              onClick={() => setArtDialogOpen(true)}
              disabled={updateArtwork.isPending}
            >
              <Pencil size={14} /> Edit design
            </button>
          </div>
        ) : null}
      </div>

      <div className="pd-body">
        <div className="pd-gallery">
          <div className="pd-img" style={{ background: "var(--gray-100)" }}>
            <div className="pd-img-inner pd-img-mockup">
              <DesignedProductThumb
                product={product}
                artworkUrl={collection.artworkUrl}
                tintHex={previewTintHex}
              />
            </div>
            <button type="button" className="pd-zoom" aria-label="Zoom preview" tabIndex={-1}>
              <ZoomIn size={17} />
            </button>
          </div>
        </div>

        <div>
          <table className="pd-meta">
            <tbody>
              {colorNames.length > 0 && (
                <tr>
                  <th scope="row">Color</th>
                  <td>
                    <div className="pd-swatches">
                      {colorNames.map((name, i) => (
                        <button
                          key={name}
                          type="button"
                          title={name}
                          aria-label={name}
                          aria-pressed={selColor === i}
                          className={`pd-sw${selColor === i ? " on" : ""}`}
                          style={{ background: productColorHex(product, name) }}
                          onClick={() => {
                            setHasUserPickedColor(true);
                            setSelColor(i);
                          }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">Unique ID</th>
                <td>{uniqueId}</td>
              </tr>
              <tr>
                <th scope="row">Category</th>
                <td>{category}</td>
              </tr>
              <tr>
                <th scope="row">Notes</th>
                <td className="muted">{collection.name}</td>
              </tr>
            </tbody>
          </table>

          <ProductInfoTabs
            product={product}
            description={product.description?.trim() ? undefined : productDescription(product)}
          />
        </div>
      </div>

      <Dialog
        open={artDialogOpen}
        onOpenChange={(open) => {
          setArtDialogOpen(open);
          if (!open) setArtworkDraft(null);
        }}
      >
        <DialogContent className="sm-modal" style={{ maxWidth: 560 }}>
          <div className="modal-pad">
            <DialogHeader>
              <div className="eyebrow">Artwork</div>
              <DialogTitle>Change artwork</DialogTitle>
              <DialogDescription>
                Upload a new artwork file for this design. Shelf Merch will refresh the product
                mockup after saving.
              </DialogDescription>
            </DialogHeader>

            <input
              ref={fileInputRef}
              type="file"
              accept={ARTWORK_ACCEPT}
              style={{ display: "none" }}
              onChange={(event) => handleArtworkFile(event.currentTarget.files?.[0])}
            />

            <button
              type="button"
              className="upload-tile"
              style={{ marginTop: 20, textAlign: "left" }}
              onClick={() => fileInputRef.current?.click()}
              disabled={updateArtwork.isPending}
            >
              <span className="icon-soft">
                <UploadCloud size={20} />
              </span>
              <span>
                <strong>{artworkDraft ? artworkDraft.name : "Upload artwork"}</strong>
                <small>PNG, JPG, or SVG up to 5 MB</small>
              </span>
            </button>

            {artworkDraft ? (
              <div
                className="soft-panel"
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "var(--gray-50)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={artworkDraft.preview}
                    alt=""
                    style={{ maxWidth: "86%", maxHeight: "86%", objectFit: "contain" }}
                  />
                </div>
                <div>
                  <strong style={{ display: "block" }}>{artworkDraft.name}</strong>
                  <span className="muted">
                    This artwork will replace the current design artwork.
                  </span>
                </div>
              </div>
            ) : null}

            <div className="modal-actions" style={{ marginTop: 22 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setArtDialogOpen(false)}
                disabled={updateArtwork.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveArtwork}
                disabled={!artworkDraft || updateArtwork.isPending}
              >
                {updateArtwork.isPending ? <Loader2 size={16} className="spin" /> : null}
                Update artwork
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
