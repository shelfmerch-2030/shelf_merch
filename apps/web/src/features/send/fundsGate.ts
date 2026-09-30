import type { WorkspaceSnapshot } from "@/services/workspace-api";
import { spendableForWallet, walletsForCheckout } from "@/services/workspace-api";

export type SendFlowBlockReason = "no_wallet" | "pending_approval" | "insufficient_funds";

/** Why send-points / send-kit should be blocked, or null when the flow can start. */
export function getSendFlowBlockReason(
  workspace: WorkspaceSnapshot | undefined,
): SendFlowBlockReason | null {
  if (!workspace) return "no_wallet";
  if (!workspace.wallets.length) return "no_wallet";
  if (workspace.org.wallet.fundingApproval === "pending") return "pending_approval";
  const wallet = walletsForCheckout(workspace)[0];
  if (!wallet) return "no_wallet";
  if (spendableForWallet(workspace, wallet.id) <= 0) return "insufficient_funds";
  return null;
}

export function sendFlowBlockMessage(reason: SendFlowBlockReason): string {
  switch (reason) {
    case "pending_approval":
      return "Your wallet is under review. You can send once it's approved.";
    case "no_wallet":
      return "Set up a wallet before sending points or kits.";
    case "insufficient_funds":
      return "Insufficient funds. Add balance to your wallet to continue.";
  }
}

/** Block starting send-points / send-kit when wallet is pending or has no spendable balance. */
export function isSendFlowBlocked(workspace: WorkspaceSnapshot | undefined): boolean {
  return getSendFlowBlockReason(workspace) !== null;
}

/** Block reason for a specific send amount (pending / no wallet / below required). */
export function getInsufficientFundsReason(
  workspace: WorkspaceSnapshot | undefined,
  required: number,
  walletId?: string,
): SendFlowBlockReason | null {
  const entry = getSendFlowBlockReason(workspace);
  if (entry) return entry;
  if (!workspace) return "no_wallet";
  const id = walletId || walletsForCheckout(workspace)[0]?.id;
  if (!id) return "no_wallet";
  if (spendableForWallet(workspace, id) < Math.round(required)) return "insufficient_funds";
  return null;
}

/** True when budget is pending approval or spendable balance cannot cover `required`. */
export function isInsufficientFundsForSend(
  workspace: WorkspaceSnapshot | undefined,
  required: number,
  walletId?: string,
): boolean {
  return getInsufficientFundsReason(workspace, required, walletId) !== null;
}