import type { SingleLocation } from "./types";

export type LocFieldKind =
  | "personName"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "state"
  | "postal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERSON_NAME_RE = /^[a-zA-Z\s'.-]+$/;
const CITY_STATE_RE = /^[a-zA-Z\s.-]+$/;

/** Sanitize input as the user types so fields only accept appropriate characters. */
export function sanitizeLocField(kind: LocFieldKind, value: string): string {
  switch (kind) {
    case "personName":
      return value.replace(/[^a-zA-Z\s'.-]/g, "");
    case "email":
      return value.replace(/\s/g, "");
    case "phone":
      return value.replace(/\D/g, "").slice(0, 10);
    case "city":
    case "state":
      return value.replace(/[^a-zA-Z\s.-]/g, "");
    case "postal":
      return value.replace(/\D/g, "");
    case "address":
    default:
      return value;
  }
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Validate a single location field; returns an error message or null. */
export function validateLocField(key: keyof SingleLocation, loc: SingleLocation): string | null {
  switch (key) {
    case "name": {
      const name = loc.name.trim();
      if (!name) return "Enter the contact name";
      if (!PERSON_NAME_RE.test(name)) return "Contact name should contain letters only";
      return null;
    }
    case "email": {
      const email = loc.email.trim();
      if (!email) return "Enter the notification email";
      if (!email.includes("@")) return "Email must include @";
      if (!EMAIL_RE.test(email)) return "Enter a valid email address";
      return null;
    }
    case "phone": {
      const digits = phoneDigits(loc.phone);
      if (!digits) return "Enter the phone number";
      if (!/^\d{10}$/.test(digits)) return "Phone number must be exactly 10 digits";
      return null;
    }
    case "line1":
      return loc.line1.trim() ? null : "Enter the delivery address";
    case "line2":
      return null;
    case "city": {
      const city = loc.city.trim();
      if (!city) return "Enter the city";
      if (!CITY_STATE_RE.test(city)) return "City should contain letters only";
      return null;
    }
    case "state": {
      const state = loc.state.trim();
      if (!state) return "Enter the state";
      if (!CITY_STATE_RE.test(state)) return "State should contain letters only";
      return null;
    }
    case "pincode": {
      const pin = loc.pincode.trim();
      if (!pin) return "Enter the PIN / postal code";
      if (!/^\d{4,10}$/.test(pin)) return "PIN / postal code should contain numbers only";
      return null;
    }
    case "country":
      return loc.country.trim() ? null : "Select a country";
    default:
      return null;
  }
}

/** Returns the first validation error, or null when the location is valid. */
export function validateSingleLocation(loc: SingleLocation): string | null {
  const fields: (keyof SingleLocation)[] = [
    "name",
    "email",
    "phone",
    "line1",
    "city",
    "state",
    "pincode",
    "country",
  ];
  for (const key of fields) {
    const error = validateLocField(key, loc);
    if (error) return error;
  }
  return null;
}

export function locFieldKindForKey(key: keyof SingleLocation): LocFieldKind | undefined {
  switch (key) {
    case "name":
      return "personName";
    case "email":
      return "email";
    case "phone":
      return "phone";
    case "line1":
    case "line2":
      return "address";
    case "city":
      return "city";
    case "state":
      return "state";
    case "pincode":
      return "postal";
    default:
      return undefined;
  }
}