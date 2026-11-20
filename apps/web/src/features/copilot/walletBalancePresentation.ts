import type { CopilotWalletBalanceArtifact } from "./api";

const INR_AMOUNT = String.raw`(?:₹|INR\b|Rs\b\.?)\s*([-+−]?(?:\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?!\d|[.,]\d|\s*(?:lakh|crore|thousand|million|billion|k|m|cr)\b|\s*[-–—]\s*(?:₹|\d))`;
const LABEL_SEPARATOR = String.raw`\s*(?:[:=|–—-]\s*|\bis\s+|\bstands at\s+|\bof\s+)?`;
const WALLET_FIELDS = [
  ["balance", String.raw`(?:total(?:\s+(?:wallet\s+)?balance)?|wallet balance|balance)`, String.raw`(?:in total|total|in (?:your|the) wallet)`],
  ["allocatedAmount", String.raw`(?:outstanding allocation|(?:total\s+)?allocat(?:ed(?:\s+(?:amount|budget|balance))?|ion)(?:\s*\(outstanding\))?)(?:\s+to departments)?`, String.raw`(?:currently\s+)?allocated\b`],
  ["unallocatedAmount", String.raw`(?:unallocated|available|remaining)(?:\s+(?:amount|budget|balance|funds))?(?:\s+(?:to allocate|for allocation|to spend))?`, String.raw`(?:unallocated|available|remaining|left)\b`],
] as const;

const walletFieldPatterns = WALLET_FIELDS.map(([field, label, trailingLabel]) => ({
  field,
  labeled: new RegExp(`^(?:(?:your|the) wallet (?:has|holds)(?: a)?\\s+|(?:(?:your|the|current)\\s+)*)${label}\\b${LABEL_SEPARATOR}${INR_AMOUNT}`, "i"),
  trailing: new RegExp(`^(?:(?:you have|your wallet (?:has|holds)|with|leaving)\\s+)?${INR_AMOUNT}\\s+${trailingLabel}(?!\\s*[:=|])`, "i"),
}));

/** Omit repeated figures only when the reply explicitly labels each verified amount. */
export function replyRepeatsWalletBalance(text: string, artifact: CopilotWalletBalanceArtifact) {
  const { wallet } = artifact;
  if (!wallet || (wallet.currency && String(wallet.currency).toUpperCase() !== "INR")) return false;

  const clauses = text
    .replace(/^[ \t]*(?:`{3,}|~{3,})[\s\S]*?(?:^[ \t]*(?:`{3,}|~{3,}).*$|(?![\s\S]))/gm, "")
    .replace(/^\s*>.*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_]/g, "")
    .replace(/\bRs\.(?=\s*[-+−]?\d)/gi, "Rs")
    .split(/\n|[;!?]|[.,](?!\d)|\band\s+(?=₹|INR\b|Rs\b|(?:the\s+)?(?:total|available|allocated|remaining|unallocated)\b)/i)
    .map(clause => clause.trim().replace(/^(?:[-–—•|]|\d+[.)])\s*/, "").trim());

  return walletFieldPatterns.every(({ field, labeled, trailing }) => {
    const amounts = clauses.flatMap(clause => {
      const match = labeled.exec(clause) ?? trailing.exec(clause);
      return match ? [Number(match[1].replaceAll(",", "").replace("−", "-"))] : [];
    });
    return amounts.length > 0 && amounts.every(amount => amount === wallet[field]);
  });
}
