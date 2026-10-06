import { type Dispatch, useState } from "react";
import { SquarePen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FullscreenOverlay } from "@/components/tenant/FullscreenOverlay";
import {
  BANNER_THEMES,
  SHOP_BANNER_PRESETS,
  bannerBackgroundStyle,
  bannerDisplayUrl,
  type BannerSource,
} from "./banner";
import { BannerCustomUpload } from "./BannerCustomUpload";
import { ShopHomePreview } from "./ShopHomePreview";
import type { ShopDraft, ShopDraftAction } from "./shopDraft";

type BannerDraft = {
  bannerTheme: string;
  bannerPreset: string;
  bannerImageUrl: string;
};

function bannerDraftFrom(shop: ShopDraft): BannerDraft {
  return {
    bannerTheme: shop.bannerTheme,
    bannerPreset: shop.bannerPreset,
    bannerImageUrl: shop.bannerImageUrl,
  };
}

export function ShopBuilderStep({
  draft,
  dispatch,
  onExit,
  onPublish,
  publishing,
  publishLabel = "Save & publish",
}: {
  draft: ShopDraft;
  dispatch: Dispatch<ShopDraftAction>;
  onExit: () => void;
  onPublish: () => void;
  publishing: boolean;
  /** Top-bar confirm label (create uses Save & publish; draft publish uses Publish). */
  publishLabel?: string;
}) {
  const [bannerOpen, setBannerOpen] = useState(false);
  const [pendingBanner, setPendingBanner] = useState<BannerDraft>(() => bannerDraftFrom(draft));
  const source: BannerSource = {
    bannerTheme: draft.bannerTheme,
    bannerPreset: draft.bannerPreset,
    bannerImageUrl: draft.bannerImageUrl,
    logoUrl: draft.logoUrl,
  };
  const theme = BANNER_THEMES[draft.bannerTheme] || BANNER_THEMES.light;
  const imageUrl = bannerDisplayUrl(source);
  const hasImage = Boolean(imageUrl);
  const isEmptyBanner = !hasImage && !draft.logoUrl;

  return (
    <FullscreenOverlay style={{ background: "var(--bg)" }}>
      <div
        style={{
          height: 60,
          background: "var(--ink)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          flex: "none",
        }}
      >
        <button
          type="button"
          className="lnk"
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
          onClick={onExit}
        >
          Exit
        </button>
        <span
          style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 18, fontStyle: "italic" }}
        >
          Shelf Merch
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={publishing}
          onClick={onPublish}
        >
          {publishing ? "Publishing…" : publishLabel}
        </button>
      </div>

      <div className="scroll shop-builder-scroll fade-in" style={{ flex: 1 }}>
        <ShopHomePreview
          shopName={draft.name}
          logoUrl={draft.logoUrl || undefined}
          currency={draft.currency}
          banner={
            <div
              className={`shop-builder-banner${hasImage || isEmptyBanner ? " has-preset" : ""}${isEmptyBanner ? " is-empty" : ""}`}
            >
              {hasImage ? (
                <img src={imageUrl} alt="" className="shop-builder-banner-img h-[500px]" />
              ) : isEmptyBanner ? (
                <img
                  src="/shop-banners/default-welcome.png"
                  alt=""
                  className="shop-builder-banner-img"
                />
              ) : (
                <div
                  className={`shop-builder-banner-solid${theme.dots ? " shopbanner-merch" : ""}`}
                  style={bannerBackgroundStyle(source)}
                  aria-hidden
                />
              )}

              <div className="shop-builder-banner-content">
                {!hasImage && !isEmptyBanner ? (
                  <div className="shop-builder-banner-title" style={{ color: theme.text }}>
                    {draft.name || "Your shop name"}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="shop-builder-banner-edit-center"
                onClick={() => {
                  setPendingBanner(bannerDraftFrom(draft));
                  setBannerOpen(true);
                }}
              >
                <SquarePen size={15} strokeWidth={2} />
                Edit banner
              </button>
            </div>
          }
        />
      </div>

      <Dialog
        open={bannerOpen}
        onOpenChange={(open) => {
          if (!open) setBannerOpen(false);
        }}
      >
        <DialogContent className="sm-modal sm-banner-modal">
          <div className="modal-pad">
            <DialogHeader>
              <DialogTitle>Edit banner</DialogTitle>
            </DialogHeader>
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 12px" }}>
              Choose a library banner, solid pattern, or upload your own image.
            </p>

            <BannerCustomUpload
              imageUrl={pendingBanner.bannerImageUrl}
              onChange={(bannerImageUrl) =>
                setPendingBanner((s) => ({
                  ...s,
                  bannerImageUrl,
                  ...(bannerImageUrl
                    ? { bannerPreset: "", bannerTheme: s.bannerTheme || "light" }
                    : {}),
                }))
              }
            />

            <div className="lbl" style={{ marginTop: 16 }}>
              Banner library
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 10,
                marginTop: 8,
              }}
            >
              {SHOP_BANNER_PRESETS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`optcard banner-preset-card ${!pendingBanner.bannerImageUrl && pendingBanner.bannerPreset === id ? "on" : ""}`}
                  aria-pressed={!pendingBanner.bannerImageUrl && pendingBanner.bannerPreset === id}
                  onClick={() =>
                    setPendingBanner((s) => ({
                      ...s,
                      bannerPreset: id,
                      bannerTheme: "light",
                      bannerImageUrl: "",
                    }))
                  }
                >
                  <img
                    src={`/shop-banners/${id}.png`}
                    alt={label}
                    loading="lazy"
                    className="banner-preset-thumb"
                    width={160}
                    height={52}
                  />
                  <span className="banner-preset-label">{label}</span>
                </button>
              ))}
            </div>
            <div className="lbl" style={{ marginTop: 16 }}>
              Solid
            </div>
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 8 }}
            >
              <button
                type="button"
                className={`optcard banner-preset-card ${!pendingBanner.bannerImageUrl && pendingBanner.bannerPreset === "solid-pattern" ? "on" : ""}`}
                aria-pressed={
                  !pendingBanner.bannerImageUrl && pendingBanner.bannerPreset === "solid-pattern"
                }
                onClick={() =>
                  setPendingBanner((s) => ({
                    ...s,
                    bannerPreset: "solid-pattern",
                    bannerTheme: "dark",
                    bannerImageUrl: "",
                  }))
                }
              >
                <img
                  src="/shop-banners/solid-pattern.png"
                  alt="Pattern"
                  loading="lazy"
                  className="banner-preset-thumb"
                  width={160}
                  height={52}
                />
                <span className="banner-preset-label">Pattern</span>
              </button>
            </div>

            <div className="row" style={{ marginTop: 22 }}>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => setBannerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-brand btn-block"
                onClick={() => {
                  dispatch({ type: "set", patch: pendingBanner });
                  setBannerOpen(false);
                }}
              >
                Ok
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </FullscreenOverlay>
  );
}
