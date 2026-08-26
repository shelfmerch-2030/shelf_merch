import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { UiCollection, UiProduct } from "@/services/mappers";
import { ShopBanner } from "@/features/shops/banner";
import { useAddProductToShop } from "./model";

export type AddToShopTarget = { collection: UiCollection; product?: UiProduct };

/** Pick a shop, then add a single design (or the whole collection) to it. */
export function AddToShopDialog({
  target,
  onOpenChange,
}: {
  target: AddToShopTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: workspace } = useWorkspace();
  const addToShop = useAddProductToShop();
  const [busy, setBusy] = useState(false);
  const shops = workspace?.shops ?? [];
  const catalog = workspace?.catalogProducts ?? [];

  async function add(shopId: string) {
    if (!target) return;
    const products = target.product ? [target.product] : target.collection.products;
    setBusy(true);
    try {
      for (const product of products) {
        await addToShop.mutateAsync({ shopId, collection: target.collection, product, catalog });
      }
      toast.success(target.product ? "Added to shop" : `Added ${products.length} designs to shop`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to shop");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal add-to-shop-modal">
        <DialogHeader className="add-to-shop-header">
          <DialogTitle>Add to shop</DialogTitle>
          <DialogDescription>
            {target?.product
              ? `Choose a shop to add “${target.product.nm}” to.`
              : "Choose a shop to add this collection's designs to."}
          </DialogDescription>
        </DialogHeader>

        {shops.length === 0 ? (
          <div className="add-to-shop-empty">
            <h3>No shops yet</h3>
            <p className="muted">Create a shop first, then add designs to it.</p>
          </div>
        ) : (
          <div className="add-to-shop-list">
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                className="add-to-shop-row"
                disabled={busy}
                onClick={() => add(shop.id)}
              >
                <div className="add-to-shop-row-thumb">
                  <ShopBanner source={shop} height={72} layout="center" logoSize={30} radius={8} />
                </div>
                <div className="add-to-shop-row-body">
                  <div className="add-to-shop-row-name">{shop.name}</div>
                  <div className="add-to-shop-row-meta">{shop.currency}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
