import type { UiWallet } from "@/services/mappers";

type WalletDept = { allocated?: number; spent?: number };

/** Unallocated wallet balance (total cash − earmarked to departments). */
export function walletUnallocated(
  w: Pick<UiWallet, "balance" | "alloc"> & { unalloc?: number },
): number {
  return Math.max(0, w.unalloc ?? (w.balance ?? 0) - (w.alloc ?? 0));
}

/** Cash remaining in a wallet after entity earmarks and spend — for send/checkout affordability. */
export function walletSpendable(
  w: Pick<UiWallet, "balance" | "alloc"> & { unalloc?: number },
  departments: WalletDept[] = [],
): number {
  const entityRemaining = departments.reduce(
    (sum, d) => sum + Math.max(0, (d.allocated ?? 0) - (d.spent ?? 0)),
    0,
  );
  if (entityRemaining > 0) return entityRemaining;

  const balance = Math.max(0, w.balance ?? 0);
  const unalloc = walletUnallocated(w);
  return unalloc > 0 ? unalloc : balance;
}

/** @deprecated Use walletUnallocated for header/dashboard display. */
export function walletAvailable(
  w: Pick<UiWallet, "balance" | "alloc"> & { unalloc?: number },
): number {
  return walletUnallocated(w);
}

export function normalizeWalletCurrency(currency?: string): string {
  return (currency || "INR").toUpperCase();
}

export function formatWalletAmount(amount: number, currency = "INR"): string {
  const cur = normalizeWalletCurrency(currency);
  const n = Math.round(amount ?? 0);
  if (cur === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);
  }
  if (cur === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }
  return `${n.toLocaleString()} ${cur}`;
}

/** Sum unallocated balances for the topbar wallet total. */
export function formatWalletsTotal(wallets: UiWallet[]): string {
  if (!wallets.length) return formatWalletAmount(0, "INR");

  const totals = new Map<string, number>();
  for (const w of wallets) {
    const cur = normalizeWalletCurrency(w.cur);
    totals.set(cur, (totals.get(cur) ?? 0) + walletUnallocated(w));
  }

  if (totals.size === 1) {
    const [cur, sum] = [...totals.entries()][0];
    return formatWalletAmount(sum, cur);
  }

  const primaryCur = normalizeWalletCurrency(wallets[0]?.cur);
  return formatWalletAmount(totals.get(primaryCur) ?? 0, primaryCur);
}
