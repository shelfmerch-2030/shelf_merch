import { useMemo, useState } from "react";
import {
  submitRedemption,
  type KitRedemptionData,
  type KitRedemptionItem,
} from "@/services/api-bridge";
import ProductArtworkMockup from "./store/ProductArtworkMockup";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { productVariantSwatches } from "@/lib/variantColors";
import type { ShippingAddress } from "./store/StoreShell";

type Selection = { size?: string; color?: string };

function KitItemCard({
  item,
  selection,
  onChange,
  curatedPlain,
}: {
  item: KitRedemptionItem;
  selection: Selection;
  onChange: (sel: Selection) => void;
  /** Curated kits: show the product photo only — never overlay kit artwork. */
  curatedPlain?: boolean;
}) {
  const imageCandidates = (
    item.isDrinkware
      ? [item.imageUrl, item.primaryImageUrl, ...(item.imageUrls || []), item.baseImageUrl]
      : [item.maskImageUrl, item.imageUrl, item.primaryImageUrl, ...(item.imageUrls || []), item.baseImageUrl]
  ).filter((u): u is string => Boolean(u));

  const colorSwatches = productVariantSwatches({
    colors: item.colors,
    colorHexByName: item.colorHexByName,
  });

  const plainSrc = resolveMediaUrl(
    item.imageUrl || item.primaryImageUrl || item.imageUrls?.[0] || "",
  );

  const mockupProduct = {
    name: item.name,
    maskImageUrl: item.isDrinkware ? undefined : item.maskImageUrl || item.imageUrl,
    primaryImageUrl: item.imageUrl || item.primaryImageUrl,
    imageUrls: item.imageUrls,
    // Curated redeem must not brand-overlay item photos.
    artworkUrl: curatedPlain ? undefined : item.artworkUrl,
    printAreas: curatedPlain ? [] : item.printAreas,
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        className="img-mockup"
        style={{
          aspectRatio: "1",
          borderRadius: 12,
          background: "#f4f6f4",
          overflow: "hidden",
          marginBottom: 12,
          position: "relative",
        }}
      >
        {curatedPlain ? (
          plainSrc ? (
            <img
              src={plainSrc}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
              <span className="mut3" style={{ fontSize: 12 }}>
                No image
              </span>
            </div>
          )
        ) : (
          <ProductArtworkMockup
            product={mockupProduct}
            imageCandidates={imageCandidates}
            style={{ height: "100%" }}
          />
        )}
      </div>
      {item.brand && (
        <div className="mut3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
          {item.brand}
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{item.name}</div>

      {!curatedPlain && item.requiresColor && colorSwatches.length > 0 && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label className="lbl">Colour *</label>
          <div className="pd-swatches kit-redeem-swatches">
            {colorSwatches.map((c) => (
              <button
                key={c.name}
                type="button"
                className={`pd-sw${selection.color === c.name ? " on" : ""}`}
                style={{ background: c.hex }}
                onClick={() => onChange({ ...selection, color: c.name })}
                title={c.name}
                aria-label={c.name}
                aria-pressed={selection.color === c.name}
              />
            ))}
          </div>
        </div>
      )}

      {!curatedPlain && item.requiresSize && item.sizes.length > 0 && (
        <div className="field">
          <label className="lbl">Size *</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {item.sizes.map((s) => (
              <button
                key={s}
                type="button"
                className={selection.size === s ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
                onClick={() => onChange({ ...selection, size: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_ADDRESS: ShippingAddress = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "IN",
};

export default function KitAcceptPortal({
  token,
  sessionToken,
  kitData,
  recipientName,
  campaignName,
  welcome,
  onAccepted,
}: {
  token: string;
  sessionToken: string;
  kitData: KitRedemptionData;
  recipientName: string;
  campaignName: string;
  welcome?: string;
  onAccepted: (orderNumber: string) => void;
}) {
  const [selections, setSelections] = useState<Record<string, Selection>>(() =>
    Object.fromEntries(kitData.items.map((i) => [i.productId, {}])),
  );
  const variantImages = kitData.variantImages || [];
  const [kitVariantImage, setKitVariantImage] = useState(
    () => (kitData.requiresKitVariant ? variantImages[0] || "" : ""),
  );
  const [address, setAddress] = useState<ShippingAddress>({ ...EMPTY_ADDRESS, name: recipientName });
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);

  const missingSizes = useMemo(
    () => kitData.items.filter((i) => i.requiresSize && !selections[i.productId]?.size),
    [kitData.items, selections],
  );
  const missingColors = useMemo(
    () => kitData.items.filter((i) => i.requiresColor && !selections[i.productId]?.color),
    [kitData.items, selections],
  );

  const isCuratedAccept =
    Boolean(kitData.curatedBundle) ||
    kitData.items.every((i) => i.productId.startsWith("curated:"));

  async function acceptOrder() {
    setError("");
    if (!isCuratedAccept && missingSizes.length) {
      setError(`Please choose a size for: ${missingSizes.map((i) => i.name).join(", ")}`);
      return;
    }
    if (!isCuratedAccept && missingColors.length) {
      setError(`Please choose a colour for: ${missingColors.map((i) => i.name).join(", ")}`);
      return;
    }
    if (isCuratedAccept && kitData.requiresKitVariant && !kitVariantImage) {
      setError("Please choose a kit variant.");
      return;
    }
    const missing = (["name", "phone", "line1", "city", "state", "pincode"] as const).filter(
      (k) => !address[k].trim(),
    );
    if (missing.length) {
      setError("Please complete your shipping address.");
      return;
    }

    setPlacing(true);
    try {
      const items = isCuratedAccept
        ? []
        : kitData.items.map((i) => {
            const sel = selections[i.productId] || {};
            const variant: { size?: string; color?: string } = {};
            if (sel.size) variant.size = sel.size;
            if (sel.color) variant.color = sel.color;
            return {
              productId: i.productId,
              qty: 1,
              ...(Object.keys(variant).length ? { variant } : {}),
            };
          });
      const result = (await submitRedemption(
        token,
        sessionToken,
        {
          items,
          shippingAddress: address,
          ...(isCuratedAccept && kitVariantImage ? { kitVariantImage } : {}),
        },
        `kit-accept-${token}-${Date.now()}`,
      )) as { orderNumber: string };
      onAccepted(result.orderNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place your order");
    } finally {
      setPlacing(false);
    }
  }

  const kitArt = resolveMediaUrl(kitData.kit.artworkUrl);

  return (
    <div className="store" style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div className="eyebrow">Your gift kit</div>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{kitData.kit.name || campaignName}</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 560 }}>
          {welcome ||
            (isCuratedAccept
              ? `Hi ${recipientName} — confirm your shipping address${
                  kitData.requiresKitVariant ? ", choose a kit variant," : ""
                } to accept your gift kit.`
              : `Hi ${recipientName} — confirm your kit items${kitData.items.some((i) => i.requiresSize) ? ", choose sizes where needed" : ""}, then enter your shipping address to accept.`)}
        </p>

        {kitArt && (
          <div className="card" style={{ padding: "16px 20px", marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: "var(--brand-50)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                overflow: "hidden",
                padding: 6,
              }}
            >
              <img src={kitArt} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <div className="mut3" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
                Kit artwork
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Branded across all items</div>
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 17, marginBottom: 14 }}>Items in your kit</h2>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 32,
          }}
        >
          {kitData.items.map((item) => (
            <KitItemCard
              key={item.productId}
              item={item}
              selection={selections[item.productId] || {}}
              onChange={(sel) => setSelections((prev) => ({ ...prev, [item.productId]: sel }))}
              curatedPlain={isCuratedAccept}
            />
          ))}
        </div>

        {isCuratedAccept && variantImages.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, marginBottom: 14 }}>Choose a variant</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 32,
              }}
            >
              {variantImages.map((url, idx) => {
                const selected = kitVariantImage === url;
                return (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    className="card"
                    onClick={() => setKitVariantImage(url)}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                      background: selected ? "var(--surface-2)" : undefined,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "1",
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "var(--gray-100)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <img
                        src={resolveMediaUrl(url)}
                        alt={`Variant ${idx + 1}`}
                        style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
                      />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Variant {idx + 1}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <h2 style={{ fontSize: 17, marginBottom: 14 }}>Shipping address</h2>
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label className="lbl">Full name</label>
              <input
                className="inp"
                value={address.name}
                onChange={(e) => setAddress((a) => ({ ...a, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="lbl">Phone</label>
              <input
                className="inp"
                value={address.phone}
                onChange={(e) => setAddress((a) => ({ ...a, phone: e.target.value }))}
                placeholder="+91…"
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="lbl">Address line 1</label>
              <input
                className="inp"
                value={address.line1}
                onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="lbl">Address line 2 (optional)</label>
              <input
                className="inp"
                value={address.line2}
                onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="lbl">City</label>
              <input
                className="inp"
                value={address.city}
                onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="lbl">State</label>
              <input
                className="inp"
                value={address.state}
                onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="lbl">PIN code</label>
              <input
                className="inp"
                value={address.pincode}
                onChange={(e) => setAddress((a) => ({ ...a, pincode: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn btn-brand"
          style={{ minWidth: 200 }}
          disabled={placing}
          onClick={acceptOrder}
        >
          {placing ? "Placing order…" : "Accept order"}
        </button>
      </div>
    </div>
  );
}
