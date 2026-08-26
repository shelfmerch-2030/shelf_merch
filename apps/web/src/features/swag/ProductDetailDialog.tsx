import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductInfoTabs } from "@/features/catalog/views/ProductInfoTabs";
import type { UiCollection, UiProduct } from "@/services/mappers";
import {
  collectionProductColorNames,
  defaultWhiteColorIndex,
  getMockupTintHex,
  productColorHex,
} from "./colors";
import { DesignedProductThumb } from "./DesignedProductThumb";

export type DesignTarget = { collection: UiCollection; product: UiProduct; pIdx: number };

/** Read-only design detail with colour variants and an Add-to-shop action. */
export function ProductDetailDialog({
  target,
  onOpenChange,
  onAddToShop,
  canAddToShop = true,
}: {
  target: DesignTarget | null;
  onOpenChange: (open: boolean) => void;
  onAddToShop: (target: DesignTarget) => void;
  canAddToShop?: boolean;
}) {
  const [sel, setSel] = useState(0);
  const [hasUserPickedColor, setHasUserPickedColor] = useState(false);
  useEffect(() => {
    if (target) {
      const names = collectionProductColorNames(target.collection, target.product);
      setSel(defaultWhiteColorIndex(names));
      setHasUserPickedColor(false);
    }
  }, [target]);

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal" style={{ maxWidth: "min(820px,96vw)", width: "100%" }}>
        {target && (
          <Body
            target={target}
            sel={sel}
            setSel={setSel}
            hasUserPickedColor={hasUserPickedColor}
            setHasUserPickedColor={setHasUserPickedColor}
            onAddToShop={onAddToShop}
            canAddToShop={canAddToShop}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  target,
  sel,
  setSel,
  hasUserPickedColor,
  setHasUserPickedColor,
  onAddToShop,
  canAddToShop,
}: {
  target: DesignTarget;
  sel: number;
  setSel: (i: number) => void;
  hasUserPickedColor: boolean;
  setHasUserPickedColor: (picked: boolean) => void;
  onAddToShop: (target: DesignTarget) => void;
  canAddToShop: boolean;
}) {
  const { collection, product } = target;
  const title = product.brand ? `${product.brand} ${product.nm}` : product.nm;
  const names = collectionProductColorNames(collection, product);
  const tintHex = getMockupTintHex(
    names[sel] ? productColorHex(product, names[sel]) : undefined,
    hasUserPickedColor,
  );

  return (
    <div className="modal-pad swag-detail-modal">
      <div className="swag-detail-modal__top">
        <DialogHeader className="swag-detail-modal__titles">
          <div className="eyebrow">{collection.name}</div>
          <DialogTitle style={{ fontSize: 20 }}>{title}</DialogTitle>
          {product.price ? <p className="swag-detail-price">{product.price}</p> : null}
          <DialogDescription className="sr-only">Design detail for {title}</DialogDescription>
        </DialogHeader>
        {canAddToShop ? (
          <button
            type="button"
            className="btn btn-dark swag-detail-modal__cta"
            onClick={() => onAddToShop(target)}
          >
            <Store size={16} /> Add to shop
          </button>
        ) : null}
      </div>

      <div className="swag-detail-modal__grid">
        <div className="swag-detail-modal__media">
          <DesignedProductThumb
            product={product}
            artworkUrl={collection.artworkUrl}
            tintHex={tintHex}
          />
        </div>

        <div className="swag-detail-modal__side">
          {names.length > 0 && (
            <div className="swag-detail-modal__colors">
              <div className="lbl" style={{ marginBottom: 6 }}>
                Colour variants
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {names.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={c}
                    aria-pressed={sel === i}
                    onClick={() => {
                      setHasUserPickedColor(true);
                      setSel(i);
                    }}
                    className="sw"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: productColorHex(product, c),
                      outline: sel === i ? "2px solid var(--brand)" : "1px solid var(--line)",
                      outlineOffset: 1,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <ProductInfoTabs product={product} />
        </div>
      </div>
    </div>
  );
}
