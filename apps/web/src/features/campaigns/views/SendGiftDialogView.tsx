import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShopBanner } from "@/features/shops/banner";
import type { SendGiftVm } from "../controllers/useCampaignsController";

const titleStyle = { fontSize: 20, fontFamily: "var(--disp)" } as const;
const descStyle = { fontSize: 14, margin: "8px 0 0" } as const;
const actionRowStyle = { gap: 10, marginTop: 24 } as const;
const actionBtnStyle = { flex: 1, justifyContent: "center" } as const;

/** "Send Gift" chooser: pick points or a kit, then shop / kit to send. */
export function SendGiftDialogView({
  open,
  view,
  availableKits,
  availableShops,
  onOpenChange,
  onPickKitView,
  onStartSendPoints,
  onSelectShopForPoints,
  onBackToChoose,
  onSelectKit,
  onCreateKit,
  onCreateShop,
  canCreateKit,
  canCreateShop,
}: SendGiftVm) {
  const modalWidth = view === "choose" ? 440 : 560;
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  useEffect(() => {
    if (view !== "points") setSelectedShopId(null);
  }, [view]);

  const selectedShop = availableShops.find((shop) => shop.id === selectedShopId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm-modal send-gift-modal" style={{ maxWidth: modalWidth }}>
        <div className="modal-pad">
          {view === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle style={titleStyle}>What would you like to send?</DialogTitle>
                <DialogDescription className="muted" style={descStyle}>
                  Choose how you&apos;d like to delight your people. You can fine-tune recipients and
                  branding on the next step.
                </DialogDescription>
              </DialogHeader>
              <div className="row" style={actionRowStyle}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={actionBtnStyle}
                  onClick={onPickKitView}
                >
                  Send a kit
                </button>
                <button
                  type="button"
                  className="btn btn-brand"
                  style={actionBtnStyle}
                  onClick={onStartSendPoints}
                >
                  Send points/credits
                </button>
              </div>
            </>
          ) : view === "points" ? (
            <>
              <DialogHeader>
                <DialogTitle style={titleStyle}>Choose a shop</DialogTitle>
                <DialogDescription className="muted" style={descStyle}>
                  Recipients redeem points from the shop you select. Pick the storefront they should
                  browse and order from.
                </DialogDescription>
              </DialogHeader>

              {availableShops.length > 0 ? (
                <div className="send-gift-shop-list" style={{ marginTop: 20 }}>
                  {availableShops.map((shop) => {
                    const isSelected = shop.id === selectedShopId;
                    return (
                      <button
                        key={shop.id}
                        type="button"
                        className={`send-gift-shop-card${isSelected ? " is-selected" : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedShopId(shop.id)}
                      >
                        <div className="send-gift-shop-thumb" aria-hidden="true">
                          <ShopBanner
                            source={shop}
                            height={72}
                            layout="center"
                            logoSize={32}
                            radius={10}
                          />
                        </div>
                        <div className="send-gift-kit-meta">
                          <div className="send-gift-shop-title-row">
                            <span className="send-gift-kit-name">{shop.name}</span>
                            <span
                              className={`send-gift-status ${shop.live ? "is-live" : "is-draft"}`}
                            >
                              {shop.live ? "Live" : "Draft"}
                            </span>
                          </div>
                          <div className="send-gift-kit-sub">
                            <span className="send-gift-currency-tag">{shop.currency}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="send-gift-kit-empty" style={{ marginTop: 20 }}>
                  <h3>No shops yet</h3>
                  <p>Create a shop before sending points to your recipients.</p>
                </div>
              )}

              <div className="row" style={actionRowStyle}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={actionBtnStyle}
                  onClick={() => {
                    setSelectedShopId(null);
                    onBackToChoose();
                  }}
                >
                  Back
                </button>
                {availableShops.length === 0 && canCreateShop ? (
                  <button
                    type="button"
                    className="btn btn-brand"
                    style={actionBtnStyle}
                    onClick={onCreateShop}
                  >
                    Create a shop
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-brand"
                    style={actionBtnStyle}
                    disabled={!selectedShop}
                    onClick={() => selectedShop && onSelectShopForPoints(selectedShop.id)}
                  >
                    {selectedShop ? `Select ${selectedShop.name}` : "Select shop"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle style={titleStyle}>Choose a kit to send</DialogTitle>
                <DialogDescription className="muted" style={descStyle}>
                  Select one of your existing kits, or create a new kit.
                </DialogDescription>
              </DialogHeader>

              {availableKits.length > 0 ? (
                <div className="send-gift-kit-list" style={{ marginTop: 20 }}>
                  {availableKits.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className="send-gift-kit-card"
                      onClick={() => onSelectKit(k.id)}
                    >
                      <div className="send-gift-kit-meta">
                        <div className="send-gift-kit-name">{k.name}</div>
                        <div className="send-gift-kit-sub">
                          {k.items} item{k.items === 1 ? "" : "s"} · {k.status}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="send-gift-kit-empty" style={{ marginTop: 20 }}>
                  <h3>No kits available</h3>
                  <p>Create a kit before starting this send.</p>
                </div>
              )}

              <div className="row" style={actionRowStyle}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={actionBtnStyle}
                  onClick={onBackToChoose}
                >
                  Back
                </button>
                {canCreateKit ? (
                  <button
                    type="button"
                    className="btn btn-brand"
                    style={actionBtnStyle}
                    onClick={onCreateKit}
                  >
                    <Plus size={15} /> Create kit
                  </button>
                ) : (
                  <button type="button" className="btn btn-brand" style={actionBtnStyle} disabled>
                    Select kit
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
