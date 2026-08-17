import { inr, PlatformError, PlatformPageHeader } from "../../../platform-ui";
import type { KitWizardVm } from "../controllers/useKitWizardController";

/** Platform kit create/edit wizard. */
export function KitWizardView({
  mode,
  steps,
  campaignTypes,
  step,
  busy,
  error,
  problems,
  id,
  details,
  kit,
  products,
  pickProductId,
  pickVariants,
  pickVariantSku,
  pickQty,
  rules,
  imported,
  heroImage,
  itemImages,
  variantImages,
  productName,
  onBack,
  onStep,
  onSet,
  onSetRule,
  onSaveDetails,
  onPickProduct,
  onPickVariantSku,
  onPickQty,
  onAddItem,
  onDropItem,
  onUploadImages,
  onSelectHero,
  onToggleItemImage,
  onSetItemLabel,
  onToggleVariantImage,
  onSaveImageRoles,
  onPublish,
  onSaveDraft,
}: KitWizardVm) {
  return (
    <>
      <PlatformPageHeader
        title={mode === "edit" ? "Edit kit" : "New kit"}
        subtitle="Curate a predefined gift kit from catalog products, with rules company admins must follow."
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            Back to kits
          </button>
        }
      />

      <div className="row" style={{ gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {steps.map((label, i) => (
          <button
            type="button"
            key={label}
            className="chip"
            style={
              i === step ? { borderColor: "var(--brand)", color: "var(--brand-d)", fontWeight: 700 } : undefined
            }
            disabled={!id && i > 0}
            onClick={() => id && onStep(i)}
          >
            {i + 1}. {imported && i === 1 ? "Bundle" : label}
          </button>
        ))}
      </div>

      {error && <PlatformError message={error} />}

      <div className="card" style={{ padding: 22, maxWidth: 860 }}>
        {step === 0 && (
          <>
            <div className="row" style={{ gap: 14 }}>
              <div className="field" style={{ flex: 2 }}>
                <label className="lbl">Kit name</label>
                <input className="inp" value={details.name} onChange={(e) => onSet("name", e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Packaging</label>
                <select className="inp" value={details.packaging} onChange={(e) => onSet("packaging", e.target.value)}>
                  {(["none", "box", "premium_box"] as const).map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Approx value (₹)</label>
                <input
                  className="inp"
                  type="number"
                  value={details.approxValueInr}
                  onChange={(e) => onSet("approxValueInr", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="field">
              <label className="lbl">Description</label>
              <textarea
                className="inp"
                rows={2}
                value={details.description}
                onChange={(e) => onSet("description", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl">Eligible campaign types</label>
              <div className="row" style={{ flexWrap: "wrap", gap: 0 }}>
                {campaignTypes.map((t) => {
                  const on = (details.eligibleCampaignTypes ?? []).includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      className="chip"
                      style={on ? { borderColor: "var(--brand)", color: "var(--brand-d)" } : undefined}
                      onClick={() =>
                        onSet(
                          "eligibleCampaignTypes",
                          on
                            ? (details.eligibleCampaignTypes ?? []).filter((x) => x !== t)
                            : [...(details.eligibleCampaignTypes ?? []), t],
                        )
                      }
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="card" style={{ padding: 16, background: "var(--surface-2)" }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                Rules
              </div>
              <label className="row" style={{ gap: 9, alignItems: "center", marginBottom: 10, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={!!rules.fixedComposition}
                  onChange={(e) => onSetRule("fixedComposition", e.target.checked)}
                />
                Fixed composition — tenants must use this kit as-is
              </label>
              <label className="row" style={{ gap: 9, alignItems: "center", marginBottom: 14, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={!!rules.customizationAllowed}
                  onChange={(e) => onSetRule("customizationAllowed", e.target.checked)}
                />
                Customization allowed — tenants may add their logo/branding
              </label>
              <div className="row" style={{ gap: 14 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="lbl">Min qty / recipient</label>
                  <input
                    className="inp"
                    type="number"
                    value={rules.minQtyPerRecipient}
                    onChange={(e) => onSetRule("minQtyPerRecipient", Number(e.target.value))}
                  />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="lbl">Max qty / recipient</label>
                  <input
                    className="inp"
                    type="number"
                    value={rules.maxQtyPerRecipient}
                    onChange={(e) => onSetRule("maxQtyPerRecipient", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-brand"
              style={{ marginTop: 18 }}
              disabled={busy || !details.name}
              onClick={onSaveDetails}
            >
              {id ? "Save & continue" : "Create draft & continue"}
            </button>
          </>
        )}

        {step === 1 && imported && (
          <>
            <h3 style={{ marginBottom: 12 }}>Curated bundle</h3>
            <div className="banner info" style={{ marginBottom: 14 }}>
              This kit was imported from {kit?.source?.provider === "shopify" ? "Shopify" : "an external source"}{" "}
              as a complete, pre-set bundle. Its contents are fixed — there are no individual products or variants to
              add here.
            </div>
            <p className="muted" style={{ marginBottom: 14 }}>
              {kit?.description || "No description provided."}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(0)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" onClick={() => onStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 1 && !imported && (
          <>
            <h3 style={{ marginBottom: 12 }}>Kit items</h3>
            {kit?.items?.length ? (
              <table className="tbl" style={{ marginBottom: 14 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>Qty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {kit.items.map((it) => (
                    <tr key={it._id}>
                      <td>{productName(it.catalogProductId)}</td>
                      <td className="muted">{it.variantSku || "—"}</td>
                      <td>{it.qty ?? 1}</td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDropItem(it._id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ marginBottom: 14 }}>
                No items yet. Add catalog products to this kit.
              </p>
            )}
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
              <div className="field" style={{ flex: 2, marginBottom: 0 }}>
                <label className="lbl">Product</label>
                <select className="inp" value={pickProductId} onChange={(e) => onPickProduct(e.target.value)}>
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lbl">Variant</label>
                <select
                  className="inp"
                  value={pickVariantSku}
                  onChange={(e) => onPickVariantSku(e.target.value)}
                  disabled={!pickVariants.length}
                >
                  <option value="">{pickVariants.length ? "Any" : "—"}</option>
                  {pickVariants.map((v) => (
                    <option key={v.sku} value={v.sku}>
                      {[v.size, v.color].filter(Boolean).join(" / ") || v.sku}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ width: 90, marginBottom: 0 }}>
                <label className="lbl">Qty</label>
                <input
                  className="inp"
                  type="number"
                  min={1}
                  value={pickQty}
                  onChange={(e) => onPickQty(Number(e.target.value))}
                />
              </div>
              <button type="button" className="btn btn-soft" disabled={busy || !pickProductId} onClick={onAddItem}>
                Add
              </button>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(0)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" onClick={() => onStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Cover images (optional)</h3>
            <div className="row" style={{ flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              {(kit?.imageUrls ?? []).map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{
                    width: 90,
                    height: 90,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                  }}
                />
              ))}
              {!kit?.imageUrls?.length && <p className="muted">No images yet.</p>}
            </div>
            <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => onUploadImages(e.target.files)} />

            {(kit?.imageUrls?.length ?? 0) > 0 && (
              <>
                <h3 style={{ margin: "24px 0 8px" }}>Hero Image</h3>
                <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
                  Select exactly one image used as the kit cover.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
                  {(kit?.imageUrls ?? []).map((url, idx) => (
                    <label
                      key={`hero-${url}`}
                      className="row"
                      style={{
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        background: heroImage === url ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="heroImage"
                        checked={heroImage === url}
                        onChange={() => onSelectHero(url)}
                      />
                      <img
                        src={url}
                        alt=""
                        style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Image {idx + 1}</span>
                    </label>
                  ))}
                </div>

                <h3 style={{ margin: "24px 0 8px" }}>Included Products</h3>
                <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
                  Select images that represent included products. Optional product names override Item 1, Item 2…
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
                  {(kit?.imageUrls ?? []).map((url, idx) => {
                    const selected = itemImages.find((it) => it.imageUrl === url);
                    return (
                      <div
                        key={`item-${url}`}
                        className="row"
                        style={{
                          gap: 12,
                          alignItems: "center",
                          padding: 10,
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <label className="row" style={{ gap: 12, alignItems: "center", flex: 1, minWidth: 220 }}>
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => onToggleItemImage(url)}
                          />
                          <img
                            src={url}
                            alt=""
                            style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>Image {idx + 1}</span>
                        </label>
                        {selected ? (
                          <input
                            className="inp"
                            style={{ flex: 1, minWidth: 160 }}
                            placeholder="Product name (optional)"
                            value={selected.label || ""}
                            onChange={(e) => onSetItemLabel(url, e.target.value)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <h3 style={{ margin: "24px 0 8px" }}>Variants</h3>
                <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
                  Select colour/appearance variants of this kit. These are not separate kits.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(kit?.imageUrls ?? []).map((url, idx) => (
                    <label
                      key={`variant-${url}`}
                      className="row"
                      style={{
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        background: variantImages.includes(url) ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={variantImages.includes(url)}
                        onChange={() => onToggleVariantImage(url)}
                      />
                      <img
                        src={url}
                        alt=""
                        style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Image {idx + 1}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(1)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={onSaveImageRoles}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Review &amp; publish</h3>
            <p className="muted" style={{ marginBottom: 6 }}>
              {kit?.name} · {imported ? "curated bundle" : `${kit?.items?.length ?? 0} items`} · approx{" "}
              {inr(kit?.approxValueInr ?? 0)} · packaging {kit?.packaging}
            </p>
            {problems.length > 0 && (
              <ul style={{ color: "var(--danger)", margin: "10px 0", paddingLeft: 18 }}>
                {problems.map((p, index) => (
                  <li key={`${p}-${index}`}>{p}</li>
                ))}
              </ul>
            )}
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onStep(2)}>
                Back
              </button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={onPublish}>
                Publish kit
              </button>
              <button type="button" className="btn btn-soft" onClick={onSaveDraft}>
                Save as draft
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
