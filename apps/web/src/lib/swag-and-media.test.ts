import { describe, it, expect } from "vitest";
import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import {
  imageContainRect,
  inchesToPx,
  physicalFrameStageRect,
  pxToInches,
  resolvePhysical,
  DEFAULT_PHYSICAL,
} from "@/lib/printCoords";
import { slugifyShopName, shopRedeemPath, shopStorefrontPath } from "@/lib/shopRedeemUrl";
import { storeProductAsUi } from "@/features/swag/DesignedProductThumb";

describe("mediaUrl", () => {
  it("normalizes relative upload paths and leaves absolute URLs", () => {
    expect(resolveMediaUrl("/uploads/a.png")).toBe("/uploads/a.png");
    expect(resolveMediaUrl("uploads/a.png")).toBe("/uploads/a.png");
    expect(resolveMediaUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    expect(resolveMediaUrl("")).toBe("");
  });

  it("proxies cross-origin URLs for canvas pixel reads", () => {
    const proxied = mediaUrlForCanvas("https://cdn.example/mask.png");
    expect(proxied).toContain("/api/v1/media/proxy?url=");
    expect(proxied).toContain(encodeURIComponent("https://cdn.example/mask.png"));
    expect(mediaUrlForCanvas("/uploads/mask.png")).toBe("/uploads/mask.png");
  });
});

describe("printCoords", () => {
  it("resolves physical defaults and contain-fit geometry", () => {
    expect(resolvePhysical(null)).toEqual(DEFAULT_PHYSICAL);
    expect(resolvePhysical({ width: 12, height: 16 }).width).toBe(12);

    const rect = imageContainRect(1000, 500);
    expect(rect.w / rect.h).toBeCloseTo(2, 5);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBeGreaterThan(0);
  });

  it("round-trips inches through stage pixels", () => {
    const frame = physicalFrameStageRect({ width: 20, height: 24 });
    const px = inchesToPx(6, frame.pxPerInch);
    expect(pxToInches(px, frame.pxPerInch)).toBeCloseTo(6, 5);
  });
});

describe("shopRedeemUrl", () => {
  it("slugifies shop names and builds public paths", () => {
    expect(slugifyShopName("Salesforce HQ")).toBe("salesforce-hq");
    expect(shopRedeemPath("salesforce")).toBe("/s/salesforce");
    expect(shopStorefrontPath("abc123")).toBe("/shop/abc123");
  });
});

describe("storeProductAsUi", () => {
  it("maps storefront product rows onto mockup thumbnail fields", () => {
    const ui = storeProductAsUi({
      catalogProductId: "prod1",
      name: "Welcome Tee",
      brand: "Rubix",
      group: "tee",
      maskImageUrl: "/uploads/mask.png",
      baseImageUrl: "/uploads/base.png",
      primaryImageUrl: "/uploads/photo.png",
      mockupUrl: "/uploads/mock.png",
      placement: { xPct: 0.5, yPct: 0.4, wPct: 0.3, rot: 0 },
    });

    expect(ui.id).toBe("prod1");
    expect(ui.nm).toBe("Welcome Tee");
    expect(ui.maskImageUrl).toBe("/uploads/mask.png");
    expect(ui.photoUrl).toBe("/uploads/photo.png");
    expect(ui.areaPlacements?.area_1?.wPct).toBe(0.3);
  });
});
