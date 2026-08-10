import { describe, it, expect } from "vitest";
import {
  formatWalletAmount,
  formatWalletsTotal,
  walletSpendable,
  walletUnallocated,
} from "@/lib/walletFormat";
import type { UiWallet } from "@/services/mappers";

const wallet = (partial: Partial<UiWallet>): UiWallet =>
  ({
    id: "w1",
    name: "Budget",
    balance: 0,
    alloc: 0,
    unalloc: 0,
    cur: "INR",
    ...partial,
  }) as UiWallet;

describe("walletFormat", () => {
  it("computes unallocated and spendable balances", () => {
    expect(walletUnallocated(wallet({ balance: 10_000, alloc: 4_000, unalloc: 6_000 }))).toBe(
      6_000,
    );
    expect(
      walletUnallocated({
        balance: 10_000,
        alloc: 4_000,
      }),
    ).toBe(6_000);

    expect(
      walletSpendable(wallet({ balance: 10_000, unalloc: 1_000 }), [
        { allocated: 5_000, spent: 2_000 },
        { allocated: 2_000, spent: 500 },
      ]),
    ).toBe(4_500);

    expect(walletSpendable(wallet({ balance: 8_000, unalloc: 0, alloc: 8_000 }), [])).toBe(8_000);
  });

  it("formats INR amounts and multi-wallet totals", () => {
    expect(formatWalletAmount(1500, "INR")).toMatch(/1,500/);
    expect(formatWalletsTotal([])).toMatch(/0/);
    expect(
      formatWalletsTotal([
        wallet({ balance: 5_000, unalloc: 5_000, cur: "INR" }),
        wallet({ balance: 2_000, unalloc: 2_000, cur: "INR" }),
      ]),
    ).toMatch(/7,000/);
  });
});
