export type CheckoutFormValues = {
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export type CheckoutFieldKey = keyof CheckoutFormValues;

const PERSON_NAME_RE = /^[a-zA-Z\s'.-]+$/;
const CITY_STATE_RE = /^[a-zA-Z\s.-]+$/;

const DIAL_CODES: Record<string, string> = {
  IN: "+91",
  US: "+1",
  CA: "+1",
  GB: "+44",
  AE: "+971",
  AU: "+61",
  SG: "+65",
};

export function checkoutPhonePrefix(country: string): string {
  return DIAL_CODES[country] ?? "+";
}

export function sanitizeCheckoutField(key: CheckoutFieldKey, value: string): string {
  switch (key) {
    case "firstName":
    case "lastName":
      return value.replace(/[^a-zA-Z\s'.-]/g, "");
    case "phone":
      return value.replace(/\D/g, "").slice(0, 10);
    case "city":
    case "state":
      return value.replace(/[^a-zA-Z\s.-]/g, "");
    case "pincode":
      return value.replace(/\D/g, "").slice(0, 10);
    default:
      return value;
  }
}

export function validateCheckoutField(
  key: CheckoutFieldKey,
  values: CheckoutFormValues,
): string | null {
  switch (key) {
    case "firstName": {
      const name = values.firstName.trim();
      if (!name) return "Enter your first name";
      if (!PERSON_NAME_RE.test(name)) return "First name should contain letters only";
      return null;
    }
    case "lastName": {
      const name = values.lastName.trim();
      if (!name) return "Enter your last name";
      if (!PERSON_NAME_RE.test(name)) return "Last name should contain letters only";
      return null;
    }
    case "phone": {
      const digits = values.phone.replace(/\D/g, "");
      if (!digits) return "Enter your phone number";
      if (!/^\d{10}$/.test(digits)) return "Phone number must be exactly 10 digits";
      return null;
    }
    case "line1":
      return values.line1.trim() ? null : "Enter your street address";
    case "line2":
      return null;
    case "city": {
      const city = values.city.trim();
      if (!city) return "Enter your city";
      if (!CITY_STATE_RE.test(city)) return "City should contain letters only";
      return null;
    }
    case "state": {
      const state = values.state.trim();
      if (!state) return "Enter your state / province";
      if (!CITY_STATE_RE.test(state)) return "State should contain letters only";
      return null;
    }
    case "pincode": {
      const pin = values.pincode.trim();
      if (!pin) return "Enter your zip / PIN code";
      if (!/^\d{4,10}$/.test(pin)) return "Zip / PIN code should contain numbers only";
      return null;
    }
    case "country":
      return values.country.trim() ? null : "Select a country";
    default:
      return null;
  }
}

export function validateCheckoutForm(values: CheckoutFormValues): string | null {
  const fields: CheckoutFieldKey[] = [
    "firstName",
    "lastName",
    "phone",
    "line1",
    "city",
    "state",
    "pincode",
    "country",
  ];
  for (const key of fields) {
    const error = validateCheckoutField(key, values);
    if (error) return error;
  }
  return null;
}

export function checkoutFormValid(values: CheckoutFormValues): boolean {
  return validateCheckoutForm(values) === null;
}