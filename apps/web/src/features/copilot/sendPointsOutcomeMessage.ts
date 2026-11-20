import { inrToCredits, inrToPoints } from "@/lib/storeCurrency";
import { amountLabel } from "./actionPresentation";

/** Render only recorded backend outcomes; never accept confirmation previews. */
export function sendPointsOutcomeMessage(result: Record<string, unknown>): string {
  const positive = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value > 0;
  const count = result.recipientCount;
  const amount = result.creditsPerRecipient;
  const units = result.currency === "INR" && positive(amount)
    ? result.currencyMode === "points"
      ? `${inrToPoints(amount).toLocaleString("en-IN")} Points`
      : result.currencyMode === "inr"
        ? `${inrToCredits(amount).toLocaleString("en-IN")} Credits` : null
    : null;
  const recipients = positive(count) && Number.isInteger(count)
    ? `${count.toLocaleString("en-IN")} ${count === 1 ? "recipient" : "recipients"}` : null;
  const send = units && recipients ? `${units}${count === 1 ? "" : " each"} for ${recipients}` : null;
  const status = result.invitationStatus;
  let message: string;
  if (result.outcome === "in_progress") {
    message = "Your send is still being processed. Check its status before taking further action.";
  } else if (result.outcome !== "completed" || status === "requires_review") {
    message = "Your send needs review before completion. Check the recorded progress below.";
  } else if (status === "unresolved" || result.invitationsUnresolved === true) {
    message = "Your Points launch was recorded, but invitation submission is unresolved. Uncertain invitations will not be automatically resent.";
  } else if (status === "scheduled") {
    message = `Your send${send ? ` of ${send}` : ""} is scheduled.`;
    if (typeof result.sendAt === "string" && result.sendAt) {
      message += ` Delivery is scheduled for ${result.sendAt}${typeof result.timezone === "string" && result.timezone ? ` (${result.timezone})` : ""}.`;
    }
  } else if (status === "self_share") {
    message = `✅ Your send${send ? ` of ${send}` : ""} is ready to share. No invitation emails were requested.`;
  } else if (status === "acknowledged") {
    message = `✅ ${send ? `Your send of ${send} is complete` : "Your Points launch was recorded"}! ${count === 1 ? "The invitation submission was" : "Invitation submissions were"} acknowledged. Mailbox delivery is not guaranteed.`;
  } else if (status === "pending") {
    message = "Your Points launch was recorded. Invitation submission is pending; check the status below.";
  } else {
    message = "Your Points launch was recorded. Invitation submission has not been verified; check the status below.";
  }
  if (result.walletDebited === true && result.currency === "INR" && positive(result.debitedAmountInr)) {
    const funding = typeof result.fundingName === "string" && result.fundingName.trim()
      ? ` from ${result.fundingName.trim()}` : "";
    message += ` ${amountLabel(result.debitedAmountInr, "INR")} was deducted${funding}.`;
  }
  return message;
}
