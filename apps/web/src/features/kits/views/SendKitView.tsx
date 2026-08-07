import { useRef, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/LoadingState";
import { inr } from "@/components/platform/platform-ui";
import { WizardChrome } from "@/features/swag/wizard/WizardChrome";
import { LocField } from "@/features/send/RecipientPicker";
import { RecipientExperience } from "@/features/send/RecipientExperience";
import { PaymentPanel } from "@/features/send/PaymentPanel";
import type { SendKitVm } from "../controllers/useSendKitController";
import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import { resolveKitItemOptions, getCuratedKitMeta } from "../controllers/useSendKitController";
import { curatedIncludedItems } from "../KitPreviewDialog";
import { usePlatformKits } from "../model";
import type { UiProduct } from "@/services/mappers";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { KitPackagingStep } from "./KitPackagingStep";

const STEPS = ["Items", "Recipients", "Experience", "Packaging", "Checkout"];

const COLOR_MAP: Record<string, string> = {
  black: "#1a1a1a", white: "#f8f8f8", navy: "#001f5b", red: "#c0392b",
  blue: "#2980b9", green: "#27ae60", gray: "#95a5a6", grey: "#95a5a6",
  brown: "#8B4513", beige: "#f5f5dc", yellow: "#f1c40f", orange: "#e67e22",
  purple: "#8e44ad", pink: "#e91e8c", teal: "#1abc9c", maroon: "#800000",
  olive: "#808000", cream: "#fffdd0", charcoal: "#36454f", gold: "#FFD700",
  silver: "#C0C0C0", coral: "#FF6B6B", "royal blue": "#4169e1",
};

function swatchColor(product: UiProduct, colorName: string): string {
  const variantWithHex = product.variants?.find(v => v.color?.toLowerCase() === colorName.toLowerCase() && v.colorHex);
  if (variantWithHex?.colorHex) return variantWithHex.colorHex;

  if (product.colorHexByName) {
    const nameMatch = Object.keys(product.colorHexByName).find(k => k.toLowerCase() === colorName.toLowerCase());
    if (nameMatch && product.colorHexByName[nameMatch]) {
      return product.colorHexByName[nameMatch];
    }
  }

  return COLOR_MAP[colorName.toLowerCase()] ?? colorName.toLowerCase();
}

function ColorSwatch({ color, product }: { color: string; product: UiProduct }) {
  return (
    <span
      title={color}
      style={{
        width: 14, height: 14, borderRadius: "50%",
        background: swatchColor(product, color),
        border: "1.5px solid rgba(0,0,0,.18)",
        display: "inline-block", flexShrink: 0,
      }}
    />
  );
}

function ColorSelect({
  value, colors, onChange, product
}: { value: string; colors: string[]; onChange: (v: string) => void; product: UiProduct }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          border: "1px solid var(--border)", borderRadius: 8,
          padding: "4px 8px", background: "var(--surface)", width: 105,
          height: 32, cursor: "pointer", textAlign: "left",
          justifyContent: "space-between", color: value ? "var(--text)" : "var(--text-muted)",
          outline: "none"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
          {value ? (
            <span
              style={{
                width: 12, height: 12, borderRadius: "50%",
                background: swatchColor(product, value),
                border: "1px solid rgba(0,0,0,0.15)",
                display: "inline-block", flexShrink: 0,
              }}
            />
          ) : (
            <span
              style={{
                width: 12, height: 12, borderRadius: "50%",
                background: "transparent",
                border: "1px dashed var(--border)",
                display: "inline-block", flexShrink: 0,
              }}
            />
          )}
          <span style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {value || "Color"}
          </span>
        </div>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 1000,
            maxHeight: 180, overflowY: "auto", padding: 4
          }}>
            <div
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                padding: "6px 8px", fontSize: 12, cursor: "pointer",
                borderRadius: 6, display: "flex", alignItems: "center", gap: 6,
                background: !value ? "var(--surface-2)" : "transparent"
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: "50%", border: "1px dashed var(--border)", display: "inline-block" }} />
              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Color</span>
            </div>
            {colors.map(c => (
              <div
                key={c}
                onClick={() => { onChange(c); setOpen(false); }}
                style={{
                  padding: "6px 8px", fontSize: 12, cursor: "pointer",
                  borderRadius: 6, display: "flex", alignItems: "center", gap: 6,
                  background: value === c ? "var(--surface-2)" : "transparent"
                }}
              >
                <span
                  style={{
                    width: 12, height: 12, borderRadius: "50%",
                    background: swatchColor(product, c),
                    border: "1px solid rgba(0,0,0,0.15)",
                    display: "inline-block", flexShrink: 0
                  }}
                />
                <span style={{ color: "var(--text)", fontWeight: 505 }}>{c}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SizeSelect({
  value, sizes, onChange,
}: { value: string; sizes: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        border: "1px solid var(--border)", borderRadius: 8,
        padding: "4px 8px", fontSize: 12, background: "var(--surface)",
        outline: "none", cursor: "pointer", minWidth: 90, color: "var(--text)",
        fontWeight: 500, height: 32,
      }}
    >
      <option value="">Size</option>
      {sizes.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

export function SendKitView(vm: SendKitVm) {
  const { draft, dispatch } = vm;
  const [search, setSearch] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [selectedCuratedVariant, setSelectedCuratedVariant] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { data: platformKits } = usePlatformKits();

  if (vm.isLoading) return <LoadingState message="Loading kit…" fullScreen={false} />;
  if (vm.notFound || !vm.kit) {
    return (
      <div className="card" style={{ padding: 16 }}>
        Kit not found.{" "}
        <button type="button" className="lnk" onClick={vm.onExit}>Back to kits</button>
      </div>
    );
  }
  if (vm.isSending) return <LoadingState message="Placing order…" fullScreen={false} />;

  const { totals, kit } = vm;
  const customisedProductPerKit = totals.itemsSubtotal ?? totals.unitPrice ?? 0;
  const customisedKitsLineTotal = customisedProductPerKit * totals.qty;
  const customisedSubtotal = customisedKitsLineTotal + totals.pkgCost;

  const curatedMeta = getCuratedKitMeta(kit);
  const isCurated = !!curatedMeta;

  const curatedItemImages = curatedMeta
    ? curatedIncludedItems(
        curatedMeta,
        platformKits,
        kit?.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : undefined,
      )
    : [];

  const curatedVariantImages = (() => {
    if (!curatedMeta) return [] as string[];
    if (curatedMeta.variantImages?.length) return curatedMeta.variantImages;
    const platformKit = platformKits?.find(
      (k) => String(k._id) === String(curatedMeta.originalId),
    );
    return platformKit?.variantImages || [];
  })();
  const activeCuratedVariant =
    selectedCuratedVariant && curatedVariantImages.includes(selectedCuratedVariant)
      ? selectedCuratedVariant
      : curatedVariantImages[0] || null;

  const kitItems = draft.picked
    .map((idx) => vm.catalog[idx])
    .filter(Boolean)
    .map((p) => {
      const ref = kit.productRefs?.find((r) => r.catalogProductId === p.id);
      const branded: UiProduct = {
        ...p,
        mockupUrl: ref?.mockupUrl || p.mockupUrl,
      };
      return { product: branded, opts: resolveKitItemOptions(p, ref ?? {}) };
    });

  /** Only show when sender must configure real size/color options. */
  const showVariantCols =
    !isCurated &&
    (draft.mode === "surprise" || draft.mode === "single") &&
    kitItems.some(
      ({ opts }) =>
        (opts.requiresSize && opts.sizes.length > 0) ||
        (opts.requiresColor && opts.colors.length > 0),
    );

  const filteredContacts = vm.pickerContacts.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  function handleAddEmails() {
    const raw = emailDraft.trim();
    if (!raw) {
      toast.error("Enter at least one email address");
      return;
    }
    vm.onAddRecipientEmails(raw);
    setEmailDraft("");
    setShowEmailInput(false);
  }

  function handleCsvChange(file: File | undefined) {
    if (!file) return;
    vm.onImportRecipientCsv(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      {vm.step > 0
        ? <button type="button" className="lnk" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={vm.onBack}>Back</button>
        : <span />}
      {vm.step < 4
        ? <button type="button" className="btn btn-dark" onClick={vm.onNext}>Next</button>
        : <span />}
    </div>
  );

  return (
    <WizardChrome title="Send Items" steps={STEPS} activeIndex={vm.step} onExit={vm.onExit} exitLabel="Cancel" footer={footer}>

      {/* ── Step 0: Items ── */}
      {vm.step === 0 && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "10px 0" }}>
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>Review Items</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Review the items included in this kit before continuing.</p>

          {isCurated && curatedMeta ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Editable Kit Name */}
              <div style={{ maxWidth: 480 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Kit Name
                </label>
                <input
                  className="inp"
                  value={vm.kitName}
                  onChange={(e) => vm.setKitName(e.target.value)}
                  style={{ width: "100%", fontSize: 14, height: 38 }}
                />
              </div>

              {/* Read-only Description */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Description
                </label>
                <p style={{ color: "var(--text)", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                  {curatedMeta.description || "No description provided."}
                </p>
              </div>

              {/* Read-only Product Images as cards */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 12 }}>
                  Included Items ({curatedItemImages.length})
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                  {curatedItemImages.map((item, idx) => (
                    <div key={`${item.imageUrl}-${idx}`} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, borderRadius: 12 }}>
                      <div style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "var(--gray-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                          src={resolveMediaUrl(item.imageUrl)}
                          alt={item.label}
                          style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
                        />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {curatedVariantImages.length > 0 ? (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 12 }}>
                    Variants
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                    {curatedVariantImages.map((url, idx) => {
                      const selected = activeCuratedVariant === url;
                      return (
                        <button
                          key={`${url}-${idx}`}
                          type="button"
                          onClick={() => setSelectedCuratedVariant(url)}
                          className="card"
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                            background: selected ? "var(--surface-2)" : undefined,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "var(--gray-100)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
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
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
              {kitItems.map(({ product: p, opts }) => {
                const distinctSizes = (p.variants?.map(v => v.size).filter((v): v is string => Boolean(v)).filter((v, i, a) => a.indexOf(v) === i)) ?? [];
                const distinctColors = (p.variants?.map(v => v.color).filter((v): v is string => Boolean(v)).filter((v, i, a) => a.indexOf(v) === i)) ?? [];
                return (
                  <div key={p.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, borderRadius: 12 }}>
                    <div style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "var(--gray-100)", position: "relative" }}>
                      <DesignedProductThumb
                        product={p}
                        artworkUrl={p.mockupUrl ? undefined : kit.artworkUrl}
                        frontOnly
                      />
                    </div>
                    {p.brand && <div className="mut3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>{p.brand}</div>}
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nm}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Qty: 1 unit</div>
                    <div className="divider" style={{ margin: "2px 0" }} />
                    {distinctSizes.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontWeight: 500 }}>Sizes</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {distinctSizes.map(s => (
                            <span key={s} style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "var(--surface-2)", border: "1px solid var(--border)" }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {distinctColors.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontWeight: 500 }}>Colors</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {distinctColors.map(c => (
                            <div key={c} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                              <ColorSwatch color={c} product={p} />
                              <span style={{ color: "var(--text)" }}>{c}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {distinctSizes.length === 0 && distinctColors.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Standard size/color</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: Recipients ── */}
      {vm.step === 1 && (
        <div className="sk-recip-step">
          <div className="card sk-recip-modes">
            <h3>Choose send mode</h3>
            <p className="sk-recip-modes-lead">
              Select how you would like to deliver this kit to your recipients.
            </p>
            <div className="sk-recip-mode-grid">
              {(
                [
                  {
                    mode: "surprise",
                    title: "Surprise recipient",
                    desc: "Enter recipient details up front so gifts ship directly without requiring their input.",
                  },
                  {
                    mode: "single",
                    title: "Send all kits to a single location",
                    desc: "Ship all units to one office, event venue, or specific address.",
                  },
                  {
                    mode: "redeem",
                    title: "Let recipient choose the variant",
                    desc: "Recipients choose their own size, color & shipping address from a private link.",
                  },
                ] as const
              ).map(({ mode, title, desc }) => (
                <button
                  key={mode}
                  type="button"
                  className={`optcard ${draft.mode === mode ? "on" : ""}`}
                  onClick={() => dispatch({ type: "setMode", mode })}
                >
                  <div className="rd" />
                  <div>
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card sk-recip-panel">
            <h2>Who&apos;s receiving this?</h2>
            <p className="sk-recip-panel-lead">
              {isCurated
                ? "Choose recipients to receive this curated kit."
                : draft.mode === "redeem"
                  ? "Choose who should receive a private link to pick their size, color & address."
                  : showVariantCols
                    ? "Choose recipients and configure variants for each item."
                    : "Choose who should receive this kit."}
            </p>

            {draft.mode === "single" && (
              <div
                className="card"
                style={{ padding: 18, marginBottom: 18, background: "var(--surface-2)", boxShadow: "none" }}
              >
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>Single delivery location</h3>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <LocField
                    label="Contact name"
                    k="name"
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="Notification email"
                    k="email"
                    type="email"
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="Phone (optional)"
                    k="phone"
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <LocField
                    label="Address"
                    k="line1"
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                    block
                  />
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <LocField
                    label="City"
                    k="city"
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="State"
                    k="state"
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <LocField
                    label="PIN / Postal code"
                    k="pincode"
                    loc={draft.singleLocation}
                    onChange={(k, v) => dispatch({ type: "setSingleLoc", key: k, value: v })}
                  />
                  <div className="field" style={{ flex: 1 }}>
                    <label className="lbl">Country</label>
                    <select
                      className="inp"
                      value={draft.singleLocation.country || "IN"}
                      onChange={(e) =>
                        dispatch({ type: "setSingleLoc", key: "country", value: e.target.value })
                      }
                    >
                      <option value="IN">India</option>
                      <option value="AE">UAE</option>
                      <option value="US">USA</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="sk-recip-toolbar">
              <span className="sk-recip-count">{draft.selRecips.length} selected</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={vm.onSelectAllRecips}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => dispatch({ type: "deselectRecips" })}
              >
                Deselect all
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowEmailInput((open) => !open)}
              >
                Input emails
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => csvInputRef.current?.click()}
              >
                Add by CSV
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => handleCsvChange(e.target.files?.[0])}
              />
              <input
                className="inp sk-recip-search"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {showEmailInput ? (
              <div
                className="card"
                style={{ padding: 14, marginBottom: 12, background: "var(--surface-2)" }}
              >
                <label className="lbl">Paste email addresses</label>
                <textarea
                  className="inp"
                  rows={3}
                  placeholder="Separate emails with commas, spaces, or new lines"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                />
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn btn-brand btn-sm" onClick={handleAddEmails}>
                    Add recipients
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setShowEmailInput(false);
                      setEmailDraft("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {filteredContacts.length === 0 ? (
              <div
                className="muted"
                style={{ padding: "28px 16px", textAlign: "center", fontSize: 13 }}
              >
                {vm.pickerContacts.length === 0
                  ? "No recipients yet. Use Input emails or Add by CSV to get started."
                  : "No recipients match your search."}
              </div>
            ) : null}

            <div className="sk-recip-table-wrap">
              <table className="sk-recip-table">
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <th style={stickHeadCheckbox1}></th>
                    <th style={stickHeadName1}>Recipient</th>
                    <th style={stickHeadEmail1}>Email</th>
                    <th style={{ ...stickHeadAddr1, borderRight: "none" }}>
                      Address
                    </th>
                    {showVariantCols && (
                      <th
                        colSpan={kitItems.length || 1}
                        style={{
                          ...thStyle,
                          borderLeft: "2px solid var(--line)",
                          background: "var(--surface-2)",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".05em" }}>
                          Kit items &amp; variants
                        </div>
                        <div
                          style={{
                            fontWeight: 400,
                            fontSize: 11,
                            color: "var(--ink-2)",
                            marginTop: 2,
                            textTransform: "none",
                            letterSpacing: 0,
                          }}
                        >
                          Configure size &amp; color for each recipient
                        </div>
                      </th>
                    )}
                  </tr>
                  {showVariantCols && kitItems.length > 0 && (
                    <tr style={{ background: "#fff" }}>
                      <th style={stickHeadCheckbox2}></th>
                      <th style={stickHeadName2}></th>
                      <th style={stickHeadEmail2}></th>
                      <th style={{ ...stickHeadAddr2, borderRight: "none" }}></th>
                      {kitItems.map(({ product: p }) => (
                        <th
                          key={p.id}
                          style={{
                            ...thStyle,
                            borderLeft: "1px solid var(--line)",
                            minWidth: 200,
                            background: "#fff",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 44,
                                height: 34,
                                borderRadius: 6,
                                overflow: "hidden",
                                background: "var(--surface-2)",
                                flexShrink: 0,
                              }}
                            >
                              <DesignedProductThumb product={p} artworkUrl={kit.artworkUrl} frontOnly />
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>
                              {p.nm}
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filteredContacts.map((contact) => {
                    const isSelected = draft.selRecips.includes(contact.id);
                    const addr = [contact.city, contact.state, contact.country]
                      .filter(Boolean)
                      .join(", ");
                    const bg = isSelected ? "var(--brand-50)" : "#fff";
                    return (
                      <tr
                        key={contact.id}
                        style={{
                          borderTop: "1px solid var(--line)",
                          background: bg,
                          opacity: isSelected ? 1 : 0.72,
                        }}
                      >
                        <td style={cellCheckbox(bg)}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => dispatch({ type: "toggleRecip", id: contact.id })}
                            style={{
                              width: 16,
                              height: 16,
                              accentColor: "var(--brand)",
                              cursor: "pointer",
                            }}
                          />
                        </td>
                        <td style={cellName(bg)}>{contact.name}</td>
                        <td style={cellEmail(bg)}>{contact.email}</td>
                        <td style={{ ...cellAddr(bg), borderRight: "none" }}>
                          {addr || "—"}
                        </td>
                        {showVariantCols &&
                          kitItems.map(({ product: prod, opts }) => {
                            const selection =
                              draft.recipVariants[contact.id]?.[prod.id || ""] || {};
                            return (
                              <td
                                key={prod.id}
                                style={{ ...tdStyle, borderLeft: "1px solid var(--line)" }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 4,
                                    flexWrap: "nowrap",
                                    alignItems: "center",
                                  }}
                                >
                                  {opts.requiresSize && opts.sizes.length > 0 && (
                                    <SizeSelect
                                      value={selection.size || ""}
                                      sizes={opts.sizes}
                                      onChange={(v) =>
                                        dispatch({
                                          type: "setRecipVariant",
                                          contactId: contact.id,
                                          productId: prod.id || "",
                                          key: "size",
                                          value: v,
                                        })
                                      }
                                    />
                                  )}
                                  {opts.requiresColor && opts.colors.length > 0 && (
                                    <ColorSelect
                                      value={selection.color || ""}
                                      colors={opts.colors}
                                      onChange={(v) =>
                                        dispatch({
                                          type: "setRecipVariant",
                                          contactId: contact.id,
                                          productId: prod.id || "",
                                          key: "color",
                                          value: v,
                                        })
                                      }
                                      product={prod}
                                    />
                                  )}
                                  {!opts.requiresSize && !opts.requiresColor && (
                                    <span style={{ fontSize: 12, color: "var(--ink-2)" }}>—</span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {draft.mode === "surprise" && vm.surpriseMissing.length > 0 && (
              <div className="banner" style={{ marginTop: 14 }}>
                <b>{vm.surpriseMissing.length} recipient(s) missing a shipping address.</b> Surprise
                sends need addresses up front.
              </div>
            )}
            <div className="sk-recip-foot">
              {draft.selRecips.length} recipient{draft.selRecips.length !== 1 ? "s" : ""} selected
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Experience ── */}
      {vm.step === 2 && (
        <RecipientExperience
          shopName={vm.shopName}
          mode={draft.mode}
          itemCount={draft.picked.length}
          from={draft.from}
          message={draft.msg}
          onFrom={from => dispatch({ type: "setFrom", from })}
          onMessage={msg => dispatch({ type: "setMsg", msg })}
          when={draft.when}
          onWhen={when => dispatch({ type: "setWhen", when })}
          schedule={draft.schedule}
          onSchedule={(key, value) => dispatch({ type: "setSchedule", key, value })}
          preview={draft.preview}
          onPreview={preview => dispatch({ type: "setPreview", preview })}
          extraLeft={
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Printed card note</h3>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Printed on a card tucked inside every kit.</p>
              <textarea className="inp" rows={3} value={draft.note} onChange={e => dispatch({ type: "setNote", note: e.target.value })} />
              <div className="card" style={{ padding: 14, background: "var(--surface-2)", marginTop: 12 }}>
                <div className="mut3" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Card preview</div>
                <div style={{ fontFamily: "var(--disp)", fontStyle: "italic", fontSize: 14 }}>{draft.note}</div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>The {vm.account} team</div>
              </div>
            </div>
          }
        />
      )}

      {/* ── Step 3: Packaging ── */}
      {vm.step === 3 && (
        <KitPackagingStep
          kitName={kit.name}
          itemCount={draft.picked.length}
          packaging={draft.pkg}
          onPackaging={(pkg) => dispatch({ type: "setPkg", pkg })}
          stepBadge="Step 4 of 5"
        />
      )}

      {/* ── Step 4: Checkout ── */}
      {vm.step === 4 && (
        <>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Checkout</h1>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <PaymentPanel
              wallet={vm.wallet}
              wallets={vm.wallets}
              selected={draft.pay}
              onSelect={pay => dispatch({ type: "setPay", pay })}
              selectedWalletId={vm.selectedWalletId}
              onWalletSelect={vm.onWalletSelect}
              walletAvailable={vm.walletAvailable}
            />
            <div className="card" style={{ padding: 22, height: "fit-content" }}>
              <h3 style={{ fontSize: 18, marginBottom: 12 }}>Order summary</h3>
              {!vm.isCuratedKit ? (
                <>
                  <SumRow k="Price per kit" v={inr(customisedProductPerKit)} />
                  <SumRow
                    k={`${totals.qty} kit${totals.qty === 1 ? "" : "s"} × ${inr(customisedProductPerKit)}`}
                    v={inr(customisedKitsLineTotal)}
                  />
                  {totals.pkgPerKit > 0 ? (
                    <SumRow k="Packaging" v={inr(totals.pkgCost)} />
                  ) : null}
                  <SumRow k="Subtotal" v={inr(customisedSubtotal)} large />
                  <SumRow
                    k={`GST (${Math.round((totals.kitGstRate ?? 0.18) * 100)}%)`}
                    v={inr(totals.tax)}
                  />
                  <div className="divider" />
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <b style={{ fontSize: 18, display: "block" }}>Grand Total</b>
                    </div>
                    <b className="num" style={{ fontSize: 22, fontFamily: "var(--disp)" }}>{inr(totals.total)}</b>
                  </div>
                </>
              ) : (
                <>
                  <SumRow k="Price per kit" v={inr(totals.unitPrice)} />
                  <SumRow
                    k={`${totals.qty} kit${totals.qty === 1 ? "" : "s"} × ${inr(totals.unitPrice)}`}
                    v={inr(totals.unitPrice * totals.qty)}
                  />
                  {totals.pkgPerKit > 0 ? (
                    <SumRow k="Packaging" v={inr(totals.pkgCost)} />
                  ) : null}
                  <SumRow k="Subtotal" v={inr(totals.sub)} large />
                  <SumRow
                    k={`GST (${Math.round((totals.kitGstRate ?? 0.18) * 100)}%)`}
                    v={inr(totals.tax)}
                  />
                  <div className="divider" />
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <b style={{ fontSize: 18, display: "block" }}>Grand Total</b>
                    </div>
                    <b className="num" style={{ fontSize: 22, fontFamily: "var(--disp)" }}>{inr(totals.total)}</b>
                  </div>
                </>
              )}
              <button
                type="button"
                className="btn btn-brand btn-block btn-lg"
                style={{ marginTop: 14 }}
                disabled={vm.isSending}
                onClick={vm.onPayAndSend}
              >
                Pay &amp; send
              </button>
            </div>
          </div>
        </>
      )}
    </WizardChrome>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 11,
  fontWeight: 700, letterSpacing: ".06em", color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px", verticalAlign: "middle",
};

const stickHeadCheckbox1: React.CSSProperties = { ...thStyle, position: "sticky", left: 0, zIndex: 20, background: "var(--surface-2)", width: 40, minWidth: 40 };
const stickHeadName1: React.CSSProperties = { ...thStyle, position: "sticky", left: 40, zIndex: 20, background: "var(--surface-2)", width: 140, minWidth: 140 };
const stickHeadEmail1: React.CSSProperties = { ...thStyle, position: "sticky", left: 180, zIndex: 20, background: "var(--surface-2)", width: 180, minWidth: 180 };
const stickHeadAddr1: React.CSSProperties = { ...thStyle, position: "sticky", left: 360, zIndex: 20, background: "var(--surface-2)", width: 160, minWidth: 160, borderRight: "2px solid var(--line)" };

const stickHeadCheckbox2: React.CSSProperties = { ...thStyle, position: "sticky", left: 0, zIndex: 20, background: "#fff", width: 40, minWidth: 40 };
const stickHeadName2: React.CSSProperties = { ...thStyle, position: "sticky", left: 40, zIndex: 20, background: "#fff", width: 140, minWidth: 140 };
const stickHeadEmail2: React.CSSProperties = { ...thStyle, position: "sticky", left: 180, zIndex: 20, background: "#fff", width: 180, minWidth: 180 };
const stickHeadAddr2: React.CSSProperties = { ...thStyle, position: "sticky", left: 360, zIndex: 20, background: "#fff", width: 160, minWidth: 160, borderRight: "2px solid var(--line)" };

const cellCheckbox = (bg: string): React.CSSProperties => ({
  ...tdStyle, position: "sticky", left: 0, zIndex: 10, background: bg, width: 40, minWidth: 40
});
const cellName = (bg: string): React.CSSProperties => ({
  ...tdStyle, position: "sticky", left: 40, zIndex: 10, background: bg, width: 140, minWidth: 140, fontWeight: 600,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink)",
});
const cellEmail = (bg: string): React.CSSProperties => ({
  ...tdStyle, position: "sticky", left: 180, zIndex: 10, background: bg, width: 180, minWidth: 180, color: "var(--ink-2)", fontSize: 12,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
});
const cellAddr = (bg: string): React.CSSProperties => ({
  ...tdStyle, position: "sticky", left: 360, zIndex: 10, background: bg, width: 160, minWidth: 160, color: "var(--ink-2)", fontSize: 12, borderRight: "2px solid var(--line)",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
});

function SumRow({
  k,
  v,
  emphasis,
  large,
}: {
  k: string;
  v: string;
  emphasis?: boolean;
  large?: boolean;
}) {
  const labelStyle = large
    ? { fontSize: 16, fontWeight: 800 as const, color: "var(--ink)" }
    : emphasis
      ? { fontSize: 14, fontWeight: 700 as const, color: "var(--ink)" }
      : { fontSize: 13 };
  const valueStyle = large
    ? { fontWeight: 800 as const, fontSize: 18 }
    : emphasis
      ? { fontWeight: 700 as const, fontSize: 15 }
      : { fontWeight: 600 as const, fontSize: 13 };

  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        padding: large ? "10px 0" : emphasis ? "9px 0" : "7px 0",
      }}
    >
      <span className={emphasis || large ? undefined : "muted"} style={labelStyle}>{k}</span>
      <span className="num" style={valueStyle}>{v}</span>
    </div>
  );
}
