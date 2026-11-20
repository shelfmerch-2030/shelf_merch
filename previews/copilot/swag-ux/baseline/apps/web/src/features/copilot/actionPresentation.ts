/** Presentation only: never changes a confirmation or infers a financial transition. */
import {
  inrToPoints,
  inrToCredits,
  POINTS_PER_RUPEE,
  CREDITS_PER_RUPEE,
} from "@/lib/storeCurrency";

function combinedPointsRows(source: Record<string, unknown>, completed: boolean): DetailRow[] {
  const money = (value: unknown) => amountLabel(value, source.currency);
  const amount = typeof source.creditsPerRecipient === "number" ? source.creditsPerRecipient : undefined;
  const units = amount == null ? "Unavailable" : source.currencyMode === "points"
    ? `${inrToPoints(amount).toLocaleString("en-IN")} Points` : source.currencyMode === "inr"
      ? `${inrToCredits(amount).toLocaleString("en-IN")} Credits` : "Units unavailable";
  const impact = (source.walletImpact || {}) as Record<string, unknown>;
  const rows: DetailRow[] = [
    { label: "Campaign", value: String(source.campaignName || source.name || "Unavailable") },
    { label: "Store", value: String(source.shopName || "Unavailable") },
    { label: "Recipients", value: completed && source.outcome !== "completed" && typeof source.savedRecipientCount === "number"
      ? `${source.savedRecipientCount} saved / ${String(source.recipientCount ?? "Unavailable")} approved` : String(source.recipientCount ?? "Unavailable") },
    { label: "Per recipient", value: `${units} · ${money(amount)}` },
    { label: completed ? "Recorded wallet debit" : "Total INR deduction", value: completed
      ? source.walletDebited === true ? money(source.debitedAmountInr) : "No verified debit" : money(source.totalBudget) },
    { label: source.fundingSource === "department_budget" ? "Department budget" : "Organization wallet",
      value: String(source.fundingName || "Unavailable") },
    { label: completed ? "Recorded available funds" : "Available funds before → after", value: completed
      ? money(source.unallocatedAmount ?? source.balance) : `${money(impact.unallocatedBefore)} → ${money(impact.unallocatedAfter)}` },
    { label: "Redemption scope", value: source.pointsScope === "stadium" ? "Tenant-wide" : source.pointsScope === "shop" ? "Selected store" : "Unavailable" },
    { label: "Delivery", value: source.deliveryMode === "self" ? "Self-share · no email" : source.deliveryMode === "scheduled" ? "Scheduled" : source.deliveryMode === "now" ? "Immediate" : "Unavailable" },
  ];
  if (source.deliveryMode === "scheduled") rows.push({ label: "Send at", value: `${String(source.sendAt || "Unavailable")} · ${String(source.timezone || "")}` });
  if (completed) rows.push({ label: "Campaign status", value: readable(String(source.status || "Unavailable")) },
    { label: "Invitation submissions acknowledged", value: String(source.invitationsAcknowledged ?? 0) },
    { label: "Invitation status", value: readable(String(source.invitationStatus || "requires_review")) });
  return rows;
}

export function isSendPointsWorkflow(operation: string) {
  return ["campaigns.send_points", "campaigns.points_draft", "campaigns.allocate_credits", "campaigns.launch"].includes(
    operation,
  );
}

export function sendPointsRows(source: Record<string, unknown>, completed = false): DetailRow[] {
  if (source.combined === true) return combinedPointsRows(source, completed);
  const rows: DetailRow[] = [];
  const finite = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const money = (value: unknown) =>
    source.currency === "INR" ? amountLabel(value, "INR") : "Unavailable";
  const mode = source.currencyMode;
  const department = source.fundingSource === "department_budget";
  const organization = source.fundingSource === "organization_unallocated";
  const funding = department
    ? "Department budget"
    : source.fundingSource === "organization_unallocated"
      ? "Organization wallet (unallocated funds)"
      : "Unavailable";
  const campaignName = source.campaignName ?? source.name;
  if (typeof campaignName === "string") rows.push({ label: "Campaign", value: campaignName });
  rows.push({
    label: "Recipients",
    value: finite(source.recipientCount)
      ? source.recipientCount.toLocaleString("en-IN")
      : "Unavailable",
  });
  const perRecipient = source.creditsPerRecipient;
  const converted =
    finite(perRecipient) && source.currency === "INR"
      ? mode === "points"
        ? `${inrToPoints(perRecipient).toLocaleString("en-IN")} Points`
        : mode === "inr"
          ? `${inrToCredits(perRecipient).toLocaleString("en-IN")} Credits`
          : "Units unavailable"
      : "Units unavailable";
  rows.push({ label: "Per recipient", value: `${converted} · ${money(perRecipient)}` });
  rows.push({
    label: "Conversion",
    value:
      mode === "points"
        ? `₹1 = ${POINTS_PER_RUPEE} Points`
        : mode === "inr"
          ? `₹1 = ${CREDITS_PER_RUPEE} Credit`
          : "Unavailable",
  });
  if (source.totalBudget !== undefined)
    rows.push({ label: "Total cost (INR)", value: money(source.totalBudget) });
  rows.push({ label: "Funding source", value: funding });
  rows.push({
    label: "Funding account",
    value:
      typeof source.fundingName === "string" && source.fundingName
        ? source.fundingName
        : "Unavailable",
  });
  if (typeof source.shopName === "string") rows.push({ label: "Store", value: source.shopName });
  rows.push({
    label: "Redemption scope",
    value:
      source.pointsScope === "shop"
        ? "Selected store"
        : source.pointsScope === "stadium"
          ? "Tenant-wide"
          : "Unavailable",
  });
  const impact =
    source.walletImpact && typeof source.walletImpact === "object"
      ? (source.walletImpact as Record<string, unknown>)
      : {};
  if (!completed && impact.debitedNow !== undefined)
    rows.push({ label: "Debit if confirmed", value: money(impact.debitedNow) });
  if (impact.requiredAtLaunch !== undefined)
    rows.push({ label: "Required at launch", value: money(impact.requiredAtLaunch) });
  if (impact.balanceBefore !== undefined || impact.balanceAfter !== undefined)
    rows.push({
      label: department
        ? "Department remaining before → after"
        : organization
          ? "Wallet balance before → after"
          : "Funding balance before → after",
      value: `${money(impact.balanceBefore)} → ${money(impact.balanceAfter)}`,
    });
  if (
    organization &&
    (impact.unallocatedBefore !== undefined || impact.unallocatedAfter !== undefined)
  )
    rows.push({
      label: "Unallocated before → after",
      value: `${money(impact.unallocatedBefore)} → ${money(impact.unallocatedAfter)}`,
    });
  if (impact.balanceBefore === undefined) {
    const available = department
      ? (impact.balance ?? source.balance)
      : (impact.unallocatedAmount ?? source.unallocatedAmount);
    if (available !== undefined)
      rows.push({
        label: department
          ? "Department remaining"
          : organization
            ? "Unallocated funds"
            : "Available funding (scope unavailable)",
        value: money(available),
      });
  }
  if (source.walletDebited !== undefined)
    rows.push({
      label: "Recorded wallet debit",
      value: source.walletDebited === true ? money(source.debitedAmountInr) : "Not verified",
    });
  const delivery: Record<string, string> = {
    now: "Immediate",
    scheduled: "Scheduled",
    self: "Self-share · no invitation emails",
  };
  if (typeof source.deliveryMode === "string")
    rows.push({ label: "Delivery", value: delivery[source.deliveryMode] || "Unavailable" });
  if (typeof source.sendAt === "string" && source.sendAt)
    rows.push({ label: "Send at (UTC)", value: source.sendAt });
  if (typeof source.timezone === "string" && source.timezone)
    rows.push({ label: "Schedule timezone", value: source.timezone });
  if (!completed && source.invitations !== undefined)
    rows.push({
      label: "Invitation emails at launch",
      value: finite(source.invitations)
        ? source.invitations.toLocaleString("en-IN")
        : "Unavailable",
    });
  if (completed && source.invitationsSent !== undefined)
    rows.push({
      label: "Invitations recorded as sent",
      value: finite(source.invitationsSent)
        ? source.invitationsSent.toLocaleString("en-IN")
        : "Unavailable",
    });
  if (completed && typeof source.invitationsUnresolved === "boolean")
    rows.push({
      label: "Invitation delivery unresolved",
      value: source.invitationsUnresolved
        ? "Yes · check campaign status"
        : "No unresolved delivery reported",
    });
  return rows;
}
export const operationLabels: Record<string, string> = {
  "campaigns.send_points": "Send Points",
  "shops.create": "Create store",
  "shops.update": "Update store",
  "shops.publish": "Publish store",
  "shops.catalog_update": "Update store products",
  "shops.categories_update": "Update store categories",
  "shops.collection_draft": "Create collection",
  "shops.collection_publish": "Publish collection",
  "wallets.setup": "Set up wallet",
  "wallets.topup": "Request wallet top-up",
  "wallets.payment_order": "Create payment order",
  "wallets.payment_verify": "Verify payment",
  "budget.allocate": "Allocate department budget",
  "entities.setup": "Create departments",
  "entities.assign_manager": "Assign department manager",
  "employees.create": "Add employee",
  "employees.update": "Update employee",
  "campaigns.points_draft": "Create points campaign",
  "campaigns.merchandise_draft": "Create merchandise campaign",
  "campaigns.allocate_credits": "Allocate campaign credits",
  "campaigns.launch": "Launch campaign",
  "campaigns.merchandise_launch": "Launch merchandise campaign",
};
export function operationLabel(operation: string) {
  return operationLabels[operation] || "Review action";
}
export function readable(value: string): string {
  const known: Record<string, string> = {
    inr: "INR",
    points: "Points",
    live: "Live",
    po_upload: "Purchase order",
    online: "Online payment",
    pending_approval: "Approval pending",
  };
  return (
    known[value.toLowerCase()] ||
    value.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase())
  );
}
export function amountLabel(value: unknown, currency: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  const unit = typeof currency === "string" ? currency : "";
  const number = value.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return unit.toUpperCase() === "INR"
    ? `₹${number}`
    : unit
      ? `${number} ${readable(unit)}`
      : `${number} (currency unavailable)`;
}
export type DetailRow = { label: string; value: string };
const fields: Record<string, string> = {
  name: "Name",
  walletName: "Funding source",
  departmentName: "Department",
  managerName: "Manager",
  currency: "Currency",
  currencyMode: "Currency",
  status: "Status",
  fundingMethod: "Funding method",
  fundingApprovalStatus: "Funding approval",
  amount: "Amount",
  requestedAmount: "Requested amount",
  currentBalance: "Current balance",
  balance: "Balance",
  unallocatedAmount: "Unallocated balance",
  allocatedAmount: "Allocated budget",
  remainingAmount: "Remaining budget",
  netChange: "Net allocation",
  totalAllocation: "Total allocation",
  budget: "Budget",
  recipientCount: "Recipients",
  description: "Description",
  validFrom: "Valid from",
  validTo: "Valid until",
  invitation: "Invitation",
  managerTitle: "Manager role",
  financeApprovalRequired: "Finance approval required",
  balanceUnchangedUntilFinanceApproval: "Balance unchanged until approval",
  documentReady: "Document ready",
  documentAttached: "Document attached",
  invitePending: "Invitation pending",
};
const moneyFields = new Set([
  "amount",
  "requestedAmount",
  "currentBalance",
  "balance",
  "unallocatedAmount",
  "allocatedAmount",
  "remainingAmount",
  "netChange",
  "totalAllocation",
  "budget",
]);
export function detailRows(
  source: Record<string, unknown>,
  currency: unknown = source.currency,
): DetailRow[] {
  return Object.entries(fields).flatMap(([key, label]) => {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "" || typeof raw === "object") return [];
    const value = moneyFields.has(key)
      ? amountLabel(raw, currency)
      : typeof raw === "boolean"
        ? raw
          ? "Yes"
          : "No"
        : typeof raw === "number"
          ? raw.toLocaleString("en-IN")
          : [
                "currency",
                "currencyMode",
                "status",
                "fundingMethod",
                "fundingApprovalStatus",
              ].includes(key)
            ? readable(String(raw))
            : String(raw);
    return [{ label, value }];
  });
}
export function previewRows(preview: Record<string, unknown>): DetailRow[] {
  const rows = detailRows(preview);
  for (const key of ["before", "after"]) {
    const value = preview[key];
    if (value && typeof value === "object" && !Array.isArray(value))
      rows.push(
        ...detailRows(value as Record<string, unknown>, preview.currency).map((row) => ({
          ...row,
          label: `${readable(key)} · ${row.label}`,
        })),
      );
  }
  for (const key of ["departments", "employees", "changes", "notices"]) {
    const values = preview[key];
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => {
      if (!value || typeof value !== "object") return;
      const entry = value as Record<string, unknown>;
      const details = detailRows(entry, preview.currency);
      const scalar = (value: unknown) =>
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : "Unavailable";
      if (typeof entry.field === "string")
        details.push({
          label: readable(entry.field),
          value: `${scalar(entry.before)} → ${scalar(entry.after)}`,
        });
      rows.push(
        ...details.map((row) => ({
          ...row,
          label: `${readable(key)} ${index + 1} · ${row.label}`,
        })),
      );
    });
  }
  return rows;
}
export function completedPresentation(operation: string, result: Record<string, unknown>) {
  const status = typeof result.status === "string" ? result.status.toLowerCase() : "";
  const name = typeof result.name === "string" ? result.name : "";
  let title = operationLabels[operation]
    ? `${operationLabel(operation)} — completed`
    : "Action completed";
  let message = "The backend confirmed this action.";
  let tone = "complete";
  if (operation === "campaigns.send_points") {
    const acknowledged = result.invitationStatus === "acknowledged";
    const titles: Record<string, string> = { scheduled: "Points send scheduled", self_share: "Self-share redemption opened",
      unresolved: "Points launch recorded · invitations unresolved", pending: "Points launch recorded · invitations pending" };
    return { title: titles[String(result.invitationStatus)] || "Points launch recorded",
      message: acknowledged ? "Invitation submissions acknowledged. Mailbox delivery is not guaranteed."
        : result.invitationStatus === "scheduled" ? "Delivery waits until the approved schedule."
          : result.invitationStatus === "self_share" ? "No invitation emails are sent in self-share mode."
            : "Check the recorded invitation status. Uncertain invitations are not automatically resent.",
      tone: acknowledged || result.invitationStatus === "self_share" ? "complete" : "pending", rows: sendPointsRows(result, true) };
  }
  if (status === "pending" || status === "pending_approval") {
    title = "Request received";
    message = "The backend reports a pending status.";
    tone = "pending";
  }
  if (operation === "shops.create" || operation === "shops.publish") {
    title =
      operation === "shops.create"
        ? "Store created"
        : status === "live"
          ? "Store published successfully!"
          : "Store operation completed";
    message =
      status === "live"
        ? name
          ? `${name} is now Live.`
          : "Your store is now Live."
        : name
          ? `${name} was ${operation === "shops.create" ? "created" : "updated"}.`
          : "The store operation completed. Live status is not confirmed.";
  }
  if (operation.startsWith("wallets.")) {
    tone = "neutral";
    title =
      operation === "wallets.setup"
        ? "Wallet created"
        : operation === "wallets.topup"
          ? "Top-up request processed"
          : "Payment request processed";
    message = "Funding credit is not confirmed by this result.";
    if (
      result.fundingPending === true ||
      result.fundingApprovalStatus === "pending" ||
      result.nextStep === "finance_approval" ||
      status === "pending_approval"
    ) {
      title =
        operation === "wallets.setup"
          ? "Wallet created · approval pending"
          : "Submitted for approval";
      message =
        "Finance approval is pending. This result does not confirm that funds were credited.";
      tone = "pending";
    } else if (result.nextStep === "payment_required") {
      message = "Payment is required. Funds are not confirmed as credited.";
      tone = "pending";
    } else if (status === "credited") {
      title = "Funds credited";
      message = "The backend reports a credited status.";
      tone = "complete";
    }
  }
  if (operation === "campaigns.points_draft") {
    title = "Points campaign draft saved";
    message = "This step does not debit funds or send invitations.";
  }
  if (operation === "campaigns.allocate_credits") {
    title = "Campaign credit allocation confirmed";
    message = "This step does not debit the wallet. Launch requires a separate confirmation.";
  }
  if (operation === "campaigns.launch") {
    title = "Campaign launch recorded";
    message = "Check the recorded funding and invitation status below.";
    if (status === "launched" && result.deliveryMode === "scheduled") {
      title = "Campaign scheduled";
      message =
        "Recipient delivery waits until the scheduled time. Recorded wallet debit is shown below.";
    } else if (status === "redemption_open" && result.deliveryMode === "self") {
      title = "Self-share redemption opened";
      message = "No invitation emails are sent in self-share mode.";
    } else if (
      result.deliveryMode === "now" &&
      (result.invitationsUnresolved === true ||
        (typeof result.invitationsSent === "number" &&
          typeof result.recipientCount === "number" &&
          result.invitationsSent < result.recipientCount))
    ) {
      title = "Launch recorded · check invitations";
      message =
        "Some invitations are unresolved or not recorded as sent. Check campaign delivery status before retrying.";
      tone = "pending";
    }
  }
  if (["failed", "rejected", "cancelled", "expired"].includes(status)) {
    title = `${operationLabel(operation)} · ${readable(status)}`;
    message =
      "The backend returned this status. Check the operation before preparing another change.";
    tone = status === "failed" || status === "rejected" ? "failure" : "neutral";
  }
  if (["unverified", "consumed"].includes(status)) {
    title = "Completion unverified";
    message = "Check authoritative status before preparing another change.";
    tone = "neutral";
  }
  const rows = isSendPointsWorkflow(operation)
    ? sendPointsRows(result, true)
    : detailRows(result).filter(
        (row) =>
          !(["shops.create", "shops.publish"].includes(operation) && name && row.label === "Name"),
      );
  return { title, message, tone, rows };
}
