import { seedNewWizard } from "./reducer";
import type { WizardState } from "./types";

const STORAGE_KEY = "shelfmerch.fundingSuccess";
const MAX_AGE_MS = 30 * 60 * 1000;

export type FundingSuccessSnapshot = {
  amount: number;
  name: string;
  walletId?: string;
  savedAt: number;
};

export function persistFundingSuccess(snapshot: Omit<FundingSuccessSnapshot, "savedAt">) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...snapshot, savedAt: Date.now() } satisfies FundingSuccessSnapshot),
    );
  } catch {
    /* private mode / blocked storage */
  }
}

export function readFundingSuccess(): FundingSuccessSnapshot | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FundingSuccessSnapshot;
    if (!parsed || typeof parsed.amount !== "number" || !parsed.name) return null;
    if (Date.now() - (parsed.savedAt || 0) > MAX_AGE_MS) {
      clearFundingSuccess();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearFundingSuccess() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function wizardFromFundingSuccess(snapshot: FundingSuccessSnapshot): WizardState {
  const base = seedNewWizard();
  return {
    ...base,
    done: true,
    wallet: {
      ...base.wallet,
      id: snapshot.walletId,
      name: snapshot.name,
      amount: snapshot.amount,
    },
  };
}
