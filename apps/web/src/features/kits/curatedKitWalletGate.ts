import { curatedKitSendTotals } from "@/features/send/money";
import type { WorkspaceSnapshot } from "@/services/workspace-api";
import { spendableForWallet, walletsForCheckout } from "@/services/workspace-api";

export type CuratedKitWalletGateResult =
  | { allowed: true }
  | { allowed: false; reason: "no_wallet" }
  | { allowed: false; reason: "pending_approval" }
  | {
      allowed: false;
      reason: "insufficient_funds";
      available: number;
      required: number;
      currency: string;
    };

/** Wallet checks before a first-time user enters the curated kit send flow. */
export function gateWalletForCuratedKitSend(
  workspace: WorkspaceSnapshot,
  pricePerKitInr: number,
): CuratedKitWalletGateResult {
  if (!workspace.wallets.length) {
    return { allowed: false, reason: "no_wallet" };
  }

  if (workspace.org.wallet.fundingApproval === "pending") {
    return { allowed: false, reason: "pending_approval" };
  }

  const checkoutWallets = walletsForCheckout(workspace);
  const wallet = checkoutWallets[0];
  if (!wallet) {
    return { allowed: false, reason: "no_wallet" };
  }

  const required = curatedKitSendTotals(1, pricePerKitInr, "box").total;
  const available = spendableForWallet(workspace, wallet.id);
  if (available < required) {
    return {
      allowed: false,
      reason: "insufficient_funds",
      available,
      required,
      currency: wallet.cur,
    };
  }

  return { allowed: true };
}

export function insufficientFundsMessage(
  _available: number,
  _required: number,
  _currency: string,
): string {
  return "Insufficient wallet balance";
}
