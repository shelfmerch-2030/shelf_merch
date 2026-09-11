import { useState } from "react";
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

export type KitRedeemAddressField = keyof Pick<
  ShippingAddress,
  "name" | "phone" | "line1" | "line2" | "city" | "state" | "pincode"
>;

const PERSON_NAME_RE = /^[a-zA-Z\s'.-]+$/;
const CITY_STATE_RE = /^[a-zA-Z\s.-]+$/;
const FIELD_ORDER: KitRedeemAddressField[] = [
  "name",
  "phone",
  "line1",
  "city",
  "state",
  "pincode",
];

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="mut3" style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }} role="alert">
      {message}
    </div>
  );
}

/** Sanitize kit redeem address fields as the user types. */
export function sanitizeKitRedeemField(key: KitRedeemAddressField, value: string): string {
  switch (key) {
    case "name":
      return value.replace(/[^a-zA-Z\s'.-]/g, "");
    case "phone":
      return value.replace(/\D/g, "").slice(0, 10);
    case "city":
    case "state":
      return value.replace(/[^a-zA-Z\s.-]/g, "");
    case "pincode":
      return value.replace(/\D/g, "").slice(0, 10);
    case "line1":
    case "line2":
    default:
      return value;
  }
}

/** Validate a single shipping field; returns an error message or null. */
export function validateKitRedeemField(
  key: KitRedeemAddressField,
  address: ShippingAddress,
): string | null {
  switch (key) {
    case "name": {
      const name = address.name.trim();
      if (!name) return "Enter your full name";
      if (!PERSON_NAME_RE.test(name)) return "Full name should contain letters only";
      return null;
    }
    case "phone": {
      const digits = address.phone.replace(/\D/g, "");
      if (!digits) return "Enter your phone number";
      if (!/^\d{10}$/.test(digits)) return "Phone number must be exactly 10 digits";
      return null;
    }
    case "line1": {
      const line1 = address.line1.trim();
      if (!line1) return "Enter your street address";
      if (!/[a-zA-Z0-9]/.test(line1)) return "Enter a valid street address";
      return null;
    }
    case "line2":
      return null;
    case "city": {
      const city = address.city.trim();
      if (!city) return "Enter your city";
      if (!CITY_STATE_RE.test(city)) return "City should contain letters only";
      return null;
    }
    case "state": {
      const state = address.state.trim();
      if (!state) return "Enter your state";
      if (!CITY_STATE_RE.test(state)) return "State should contain letters only";
      return null;
    }
    case "pincode": {
      const pin = address.pincode.trim();
      if (!pin) return "Enter your PIN code";
      if (!/^\d{4,10}$/.test(pin)) return "PIN code should contain 4–10 digits";
      return null;
    }
    default:
      return null;
  }
}

/** Same required + format checks used by the Redeem Kit address form. */
export function validateKitRedeemAddress(address: ShippingAddress): string | null {
  for (const key of FIELD_ORDER) {
    const error = validateKitRedeemField(key, address);
    if (error) return error;
  }
  return null;
}

export function KitRedeemAddressForm({
  address,
  onChange,
  heading = "Shipping address",
  supportingText,
  error,
  showFieldErrors = false,
}: {
  address: ShippingAddress;
  onChange: (next: ShippingAddress) => void;
  heading?: string;
  supportingText?: string;
  error?: string;
  /** When true (e.g. after a failed submit), show all field errors even if not blurred yet. */
  showFieldErrors?: boolean;
}) {
  const [touched, setTouched] = useState<Partial<Record<KitRedeemAddressField, boolean>>>({});

  function patch(key: KitRedeemAddressField, value: string) {
    onChange({ ...address, [key]: sanitizeKitRedeemField(key, value) });
  }

  function markTouched(key: KitRedeemAddressField) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function fieldError(key: KitRedeemAddressField): string | null {
    if (!showFieldErrors && !touched[key]) return null;
    return validateKitRedeemField(key, address);
  }

  function inputClass(key: KitRedeemAddressField): string {
    return fieldError(key) ? "inp inp--invalid" : "inp";
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
              className={inputClass("name")}
              value={address.name}
              onChange={(e) => patch("name", e.target.value)}
              onBlur={() => markTouched("name")}
              aria-invalid={Boolean(fieldError("name"))}
            />
            <FieldError message={fieldError("name")} />
          </div>
          <div className="field">
            <label className="lbl">Phone</label>
            <input
              className={inputClass("phone")}
              value={address.phone}
              onChange={(e) => patch("phone", e.target.value)}
              onBlur={() => markTouched("phone")}
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile"
              aria-invalid={Boolean(fieldError("phone"))}
            />
            <FieldError message={fieldError("phone")} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="lbl">Address line 1</label>
            <input
              className={inputClass("line1")}
              value={address.line1}
              onChange={(e) => patch("line1", e.target.value)}
              onBlur={() => markTouched("line1")}
              aria-invalid={Boolean(fieldError("line1"))}
            />
            <FieldError message={fieldError("line1")} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="lbl">Address line 2 (optional)</label>
            <input
              className="inp"
              value={address.line2}
              onChange={(e) => patch("line2", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl">City</label>
            <input
              className={inputClass("city")}
              value={address.city}
              onChange={(e) => patch("city", e.target.value)}
              onBlur={() => markTouched("city")}
              aria-invalid={Boolean(fieldError("city"))}
            />
            <FieldError message={fieldError("city")} />
          </div>
          <div className="field">
            <label className="lbl">State</label>
            <input
              className={inputClass("state")}
              value={address.state}
              onChange={(e) => patch("state", e.target.value)}
              onBlur={() => markTouched("state")}
              aria-invalid={Boolean(fieldError("state"))}
            />
            <FieldError message={fieldError("state")} />
          </div>
          <div className="field">
            <label className="lbl">PIN code</label>
            <input
              className={inputClass("pincode")}
              value={address.pincode}
              onChange={(e) => patch("pincode", e.target.value)}
              onBlur={() => markTouched("pincode")}
              inputMode="numeric"
              maxLength={10}
              aria-invalid={Boolean(fieldError("pincode"))}
            />
            <FieldError message={fieldError("pincode")} />
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
