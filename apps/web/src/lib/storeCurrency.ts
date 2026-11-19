/** Store currency modes supported by shops. */
export type ShopCurrencyMode = "points" | "inr";
export { defaultPointsScope } from "../../../api/src/modules/campaigns/pointsScope.js";

/** Fixed conversion: ₹1 = 2 points. */
export const POINTS_PER_RUPEE = 2;

/** Fixed conversion: ₹1 = 1 credit. */
export const CREDITS_PER_RUPEE = 1;

/** Convert internal INR storage to display points. */
export function inrToPoints(inr: number): number {
  return Math.round(inr * POINTS_PER_RUPEE);
}

/** Convert internal INR storage to display credits (1:1 with ₹). */
export function inrToCredits(inr: number): number {
  return Math.round(inr * CREDITS_PER_RUPEE);
}

export function currencyLabel(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "INR" : "Points";
}

export function unitLabel(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "Credits" : "Points";
}

export function unitLabelLower(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "credits" : "points";
}

export function sendFlowTitle(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "Send Credits" : "Send Points";
}

export function rewardWalletLabel(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "Credits Wallet" : "Reward Points Wallet";
}

export function myWalletLabel(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "My Credits" : "My Reward Points";
}

export function appliedLabel(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "Credits applied" : "Points applied";
}

function formatRupees(rupees: number): string {
  return Number.isInteger(rupees)
    ? rupees.toLocaleString("en-IN")
    : rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format an INR-backed amount for the given store currency mode. */
export function formatUnitsFromInr(inr: number, mode: ShopCurrencyMode): string {
  if (mode === "inr") {
    return `₹${formatRupees(inrToCredits(inr))} Credits`;
  }
  return `${inrToPoints(inr).toLocaleString("en-IN")} Pts`;
}

/** Product/card price — INR stores show ₹; points stores show Pts. */
export function formatStoreCardPrice(inr: number, mode: ShopCurrencyMode): string {
  if (mode === "inr") {
    return `₹${formatRupees(inrToCredits(inr))}`;
  }
  return `${inrToPoints(inr).toLocaleString("en-IN")} Pts`;
}

/** General price label for orders, checkout, etc. */
export function formatStorePrice(inr: number, mode: ShopCurrencyMode): string {
  if (mode === "inr") {
    return `₹${formatRupees(inrToCredits(inr))}`;
  }
  return `${inrToPoints(inr).toLocaleString("en-IN")} pts`;
}

/** Wallet balance — INR stores append "Credits". */
export function formatStoreBalance(inr: number, mode: ShopCurrencyMode): string {
  if (mode === "inr") {
    return `₹${formatRupees(inrToCredits(inr))} Credits`;
  }
  return `${inrToPoints(inr).toLocaleString("en-IN")} Pts`;
}

/** Amount with unit for summaries (e.g. credits applied). */
export function formatStoreAmount(inr: number, mode: ShopCurrencyMode): string {
  if (mode === "inr") {
    return `₹${formatRupees(inrToCredits(inr))} Credits`;
  }
  return `${inrToPoints(inr).toLocaleString("en-IN")} Points`;
}

/** Format points count for send-flow / campaign summaries. */
export function formatPointsQuantity(pts: number, mode: ShopCurrencyMode): string {
  if (mode === "inr") {
    const credits = pts / POINTS_PER_RUPEE;
    return `₹${formatRupees(credits)} Credits`;
  }
  return `${pts.toLocaleString("en-IN")} Pts`;
}

export function conversionBadge(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "₹1 = 1 Credit" : "₹1 = 2 Pts";
}

export function normalizeCurrencyMode(raw?: string | null): ShopCurrencyMode {
  return raw === "inr" ? "inr" : "points";
}

export function currencyKeyFromMode(mode: ShopCurrencyMode): string {
  return mode === "inr" ? "INR" : "Points";
}

/** @deprecated Use POINTS_PER_RUPEE — kept for send-flow math that references legacy name. */
export const INR_TO_POINTS = POINTS_PER_RUPEE;
