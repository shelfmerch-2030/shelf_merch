import type { CopilotDepartmentBudgetsArtifact, CopilotWalletBalanceArtifact } from "./api";

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2,
});

function amount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? rupees.format(value) : "Unavailable";
}

function DepartmentAmounts({ departments }: { departments: CopilotDepartmentBudgetsArtifact["departments"] }) {
  return <ul aria-label="Department budget rows">
    {departments.map(row => <li key={row.entityId || row.name}>
      <strong>{row.name}</strong> · Allocated {amount(row.allocatedAmount)}
      {Number.isFinite(row.spentAmount) ? ` · Spent ${amount(row.spentAmount)}` : null}
      {" · Remaining "}{amount(row.remainingAmount)}
    </li>)}
  </ul>;
}

export function CopilotWalletBalanceReply({ artifact, repeatsAmounts }: {
  artifact: CopilotWalletBalanceArtifact;
  repeatsAmounts: boolean;
}) {
  const { wallet, departments, reconciliation } = artifact;
  if (!wallet) {
    return <p className="sm-copilot-financial-result" role="status">No balance snapshot is available for this reply. Ask for the current balance.</p>;
  }

  const note = reconciliation?.ok ? reconciliation.note : undefined;
  if (repeatsAmounts && !wallet.fundingPending && !departments?.length && !reconciliation?.warning && !note) return null;

  return <section className="sm-copilot-md sm-copilot-financial-result" aria-label="Wallet balance">
    {!repeatsAmounts ? <>
      <p><strong>{wallet.name || "Organization wallet"}</strong> · Balance at the time of this reply.</p>
      <ul>
        <li>Total balance: {amount(wallet.balance)}</li>
        <li>Allocated (outstanding): {amount(wallet.allocatedAmount)}</li>
        <li>Available: {amount(wallet.unallocatedAmount)}</li>
      </ul>
    </> : null}
    {wallet.fundingPending ? <p>Funding request pending approval.</p> : null}
    {departments?.length ? <DepartmentAmounts departments={departments} /> : null}
    {reconciliation?.warning ? <p role="status">{reconciliation.warning}</p> : note ? <p>{note}</p> : null}
  </section>;
}

export function CopilotDepartmentBudgetsReply({ departments, showTotal }: {
  departments: CopilotDepartmentBudgetsArtifact["departments"];
  showTotal: boolean;
}) {
  if (!departments?.length) {
    return <p className="sm-copilot-financial-result" role="status">Department budget data is unavailable in this saved conversation. Ask Copilot to refresh it.</p>;
  }
  const total = showTotal && departments.every(row => Number.isFinite(row.remainingAmount))
    ? departments.reduce((sum, row) => sum + row.remainingAmount, 0) : undefined;

  return <section className="sm-copilot-md sm-copilot-financial-result" aria-label="Department budgets">
    <p><strong>Department budgets</strong>{total !== undefined ? ` · Available ${amount(total)}` : null}</p>
    <DepartmentAmounts departments={departments} />
  </section>;
}
