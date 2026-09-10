import type { ShippingAddress } from "@/components/store/StoreShell";

export const EMPTY_KIT_REDEEM_ADDRESS: ShippingAddress = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "IN",
};

const REQUIRED_FIELDS = ["name", "phone", "line1", "city", "state", "pincode"] as const;

/** Same required-trim checks used by the Redeem Kit address form. */
export function validateKitRedeemAddress(address: ShippingAddress): string | null {
  const missing = REQUIRED_FIELDS.filter((key) => !String(address[key] || "").trim());
  if (missing.length) return "Please complete your shipping address.";
  return null;
}

export function KitRedeemAddressForm({
  address,
  onChange,
  heading = "Shipping address",
  supportingText,
  error,
}: {
  address: ShippingAddress;
  onChange: (next: ShippingAddress) => void;
  heading?: string;
  supportingText?: string;
  error?: string;
}) {
  function patch(partial: Partial<ShippingAddress>) {
    onChange({ ...address, ...partial });
  }

  return (
    <>
      {heading ? (
        <h2 style={{ fontSize: 17, marginBottom: supportingText ? 8 : 14 }}>{heading}</h2>
      ) : null}
      {supportingText ? (
        <p className="muted" style={{ marginBottom: 14, maxWidth: 560 }}>
          {supportingText}
        </p>
      ) : null}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="field">
            <label className="lbl">Full name</label>
            <input
              className="inp"
              value={address.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="lbl">Phone</label>
            <input
              className="inp"
              value={address.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              placeholder="+91…"
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="lbl">Address line 1</label>
            <input
              className="inp"
              value={address.line1}
              onChange={(e) => patch({ line1: e.target.value })}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="lbl">Address line 2 (optional)</label>
            <input
              className="inp"
              value={address.line2}
              onChange={(e) => patch({ line2: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="lbl">City</label>
            <input
              className="inp"
              value={address.city}
              onChange={(e) => patch({ city: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="lbl">State</label>
            <input
              className="inp"
              value={address.state}
              onChange={(e) => patch({ state: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="lbl">PIN code</label>
            <input
              className="inp"
              value={address.pincode}
              onChange={(e) => patch({ pincode: e.target.value })}
            />
          </div>
        </div>
      </div>
      {error ? (
        <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}
    </>
  );
}
