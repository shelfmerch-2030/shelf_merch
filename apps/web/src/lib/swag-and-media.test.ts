import { describe, it, expect } from "vitest";
import { mediaUrlForCanvas, resolveMediaUrl } from "@/lib/mediaUrl";
import {
  designPlacementOnMockup,
  imageContainRect,
  inchesToPx,
  parentToPrintLocal,
  physicalFrameStageRect,
  printLocalToParent,
  pxToInches,
  resolvePhysical,
  DEFAULT_PHYSICAL,
} from "@/lib/printCoords";
import {
  slugifyShopName,
  shopRedeemPath,
  shopSlugFromHostname,
  shopStorefrontPath,
} from "@/lib/shopRedeemUrl";
import { storeProductAsUi } from "@/features/swag/DesignedProductThumb";
import { mockupStageFit } from "@/features/swag/MockupCanvas";
import { pickPrintArea, printAreaStableKey } from "@/features/swag/mockup-bake";
import type { UiProduct } from "@/services/mappers";

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

  it("maps print-area local coords around Konva's top-left rotation origin", () => {
    const origin = { x: 100, y: 200 };
    const identity = printLocalToParent(40, 10, origin.x, origin.y, 0);
    expect(identity.x).toBeCloseTo(140, 5);
    expect(identity.y).toBeCloseTo(210, 5);

    const rotated = printLocalToParent(40, 0, origin.x, origin.y, -90);
    expect(rotated.x).toBeCloseTo(100, 5);
    expect(rotated.y).toBeCloseTo(160, 5);

    const roundTrip = parentToPrintLocal(rotated.x, rotated.y, origin.x, origin.y, -90);
    expect(roundTrip.x).toBeCloseTo(40, 5);
    expect(roundTrip.y).toBeCloseTo(0, 5);
  });

  it("preserves placeholder rotation when placing a design on a mockup", () => {
    const placed = designPlacementOnMockup({
      mockupWidthPx: 1000,
      mockupHeightPx: 1200,
      placeholder: { xIn: 9.363, yIn: 14.892, widthIn: 4.753, heightIn: 5.262, rotationDeg: -18 },
      physicalDimensions: { width: 20, height: 24 },
    });
    expect(placed.rotationDeg).toBe(-18);
    expect(placed.w).toBeGreaterThan(0);
    expect(placed.h).toBeGreaterThan(0);
  });
});

describe("mockupStageFit", () => {
  it("centers the logical mockup stage inside a wider first-paint container", () => {
    const fit = mockupStageFit(1000, 600);

    expect(fit?.fit).toBeCloseTo(1, 5);
    expect(fit?.drawnW).toBeCloseTo(800, 5);
    expect(fit?.drawnH).toBeCloseTo(600, 5);
    expect(fit?.offsetX).toBeCloseTo(100, 5);
    expect(fit?.offsetY).toBeCloseTo(0, 5);
  });

  it("scales the mockup stage down before the image loader redraws", () => {
    const fit = mockupStageFit(400, 400);

    expect(fit?.fit).toBeCloseTo(0.5, 5);
    expect(fit?.drawnW).toBeCloseTo(400, 5);
    expect(fit?.drawnH).toBeCloseTo(300, 5);
    expect(fit?.offsetX).toBeCloseTo(0, 5);
    expect(fit?.offsetY).toBeCloseTo(50, 5);
  });

  it("does not expose the raw stage before a usable container is measured", () => {
    expect(mockupStageFit(0, 400)).toBeNull();
    expect(mockupStageFit(400, 0)).toBeNull();
  });
});

describe("shopRedeemUrl", () => {
  it("slugifies shop names and builds public paths", () => {
    expect(slugifyShopName("Salesforce HQ")).toBe("salesforce-hq");
    expect(shopRedeemPath("salesforce")).toBe("/s/salesforce");
    expect(shopStorefrontPath("abc123")).toBe("/shop/abc123");
  });

  it("treats main app hosts as non-shops and keeps customer subdomains", () => {
    const domain = "shelfmerch.io";
    expect(shopSlugFromHostname("staging.shelfmerch.io", domain)).toBeNull();
    expect(shopSlugFromHostname("shelfmerch.io", domain)).toBeNull();
    expect(shopSlugFromHostname("www.shelfmerch.io", domain)).toBeNull();
    expect(shopSlugFromHostname("localhost", domain)).toBeNull();
    expect(shopSlugFromHostname("127.0.0.1", domain)).toBeNull();
    expect(shopSlugFromHostname("acme.shelfmerch.io", domain)).toBe("acme");
    expect(shopSlugFromHostname("salesforce.shelfmerch.io", domain)).toBe("salesforce");
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

describe("printAreaStableKey", () => {
  const box = { xPct: 10, yPct: 10, widthPct: 12, heightPct: 14 };
  const front1 = { key: "front", label: "Front", widthIn: 2, heightIn: 2.2, box };
  const front2 = {
    key: "front",
    label: "Front",
    widthIn: 2.006,
    heightIn: 2.317,
    xIn: 8,
    yIn: 6,
    box,
  };
  const back = { key: "back", label: "Back", widthIn: 4, heightIn: 4, box };

  it("keeps a unique catalog key as-is", () => {
    expect(printAreaStableKey(front1, 0, [front1, back])).toBe("front");
    expect(printAreaStableKey(back, 1, [front1, back])).toBe("back");
  });

  it("disambiguates duplicate Front keys so every placeholder can be selected", () => {
    const areas = [front1, front2];
    expect(printAreaStableKey(front1, 0, areas)).toBe("front");
    expect(printAreaStableKey(front2, 1, areas)).toBe("front__1");
  });

  it("resolves each duplicate key to its own print area", () => {
    const product = { printAreas: [front1, front2] } as UiProduct;
    expect(pickPrintArea(product, "front")?.heightIn).toBe(2.2);
    expect(pickPrintArea(product, "front__1")?.heightIn).toBe(2.317);
  });
});
