/**
 * Compare organization wallet outstanding allocation to department remaining budgets.
 * wallet.allocatedAmount is outstanding earmarks (allocations minus department spends).
 * Summing department allocatedAmount (gross) is NOT a valid match and commonly looks
 * like a false discrepancy equal to total department spend.
 */

export function sumDepartmentRemaining(departments = []) {
  return departments.reduce((sum, row) => sum + (Number(row?.remainingAmount) || 0), 0);
}

export function sumDepartmentAllocated(departments = []) {
  return departments.reduce((sum, row) => sum + (Number(row?.allocatedAmount) || 0), 0);
}

export function reconcileWalletFigures({
  walletAllocated,
  departmentRemainingSum,
  departmentAllocatedSum,
} = {}) {
  const allocated = Number(walletAllocated) || 0;
  const remainingSum = Number(departmentRemainingSum) || 0;
  const allocatedSum = Number(departmentAllocatedSum) || 0;
  const remainingDelta = Math.round(allocated - remainingSum);
  const grossDelta = Math.round(allocated - allocatedSum);

  const result = {
    walletAllocated: allocated,
    departmentRemainingSum: remainingSum,
    departmentAllocatedSum: allocatedSum,
    remainingDelta,
    grossDelta,
    ok: Math.abs(remainingDelta) < 0.5,
    comparedAgainst: "department_remaining",
    warning: null,
    note:
      "Wallet allocatedAmount is outstanding earmarks. It should match the sum of department remaining amounts, not the sum of department allocated (gross) columns.",
  };

  if (!result.ok) {
    result.warning =
      "Wallet allocated total does not match the sum of department remaining budgets by " +
      "₹" +
      Math.abs(remainingDelta).toLocaleString("en-IN") +
      ". Showing backend figures without adjustment.";
  } else if (Math.abs(grossDelta) >= 0.5) {
    result.note =
      "Department allocated columns sum higher than wallet allocated by ₹" +
      Math.abs(grossDelta).toLocaleString("en-IN") +
      " because allocated is gross while wallet allocated is outstanding (gross minus department spend).";
  }

  return result;
}

/** Attach reconciliation onto wallet_balance artifacts when department rows are present. */
export function enrichWalletArtifacts(artifacts = []) {
  const list = Array.isArray(artifacts) ? artifacts : [];
  const departmentRows = list
    .filter((row) => row?.kind === "department_budgets")
    .flatMap((row) => (Array.isArray(row.departments) ? row.departments : []));

  if (!departmentRows.length) return list;

  return list.map((row) => {
    if (row?.kind !== "wallet_balance" || !row.wallet) return row;
    const walletId = String(row.wallet.id || "");
    const matched = departmentRows.filter(
      (dept) => !walletId || String(dept.walletId || "") === walletId,
    );
    if (!matched.length) return row;
    const reconciliation = reconcileWalletFigures({
      walletAllocated: row.wallet.allocatedAmount,
      departmentRemainingSum: sumDepartmentRemaining(matched),
      departmentAllocatedSum: sumDepartmentAllocated(matched),
    });
    return {
      ...row,
      departments: matched,
      reconciliation,
    };
  });
}

export function walletBalanceArtifacts(result) {
  if (result?.scope === 'department' || !Array.isArray(result?.items)) return [];
  return result.items.map(wallet => ({
    kind: 'wallet_balance',
    scope: 'organization',
    ...(wallet?.id && [wallet.balance, wallet.allocatedAmount, wallet.unallocatedAmount].every(Number.isFinite)
      ? { wallet: {
        id: String(wallet.id), name: wallet.name, currency: wallet.currency, status: wallet.status,
        balance: wallet.balance, allocatedAmount: wallet.allocatedAmount, unallocatedAmount: wallet.unallocatedAmount,
        fundingPending: Boolean(wallet.fundingPending),
      } }
      : {}),
  }));
}

/** Recover dropped legacy card fields only from the wallet reads belonging to that reply. */
export function restoreWalletSnapshots(messages) {
  let snapshots = [];
  for (const message of messages) {
    if (message.role === 'user') snapshots = [];
    if (message.role === 'tool' && message.toolName === 'wallet_list_balances') {
      try { snapshots.push(...walletBalanceArtifacts(JSON.parse(message.content))); }
      catch { /* Older tool results may be truncated or unavailable. */ }
    }
    if (message.role !== 'assistant' || message.toolCalls?.length) continue;
    const cards = message.artifacts.filter(row => row.kind === 'wallet_balance');
    if (cards.some(row => !row.wallet) && cards.length === snapshots.length
      && cards.every((row, index) => !row.wallet || row.wallet.id === snapshots[index].wallet?.id)) {
      let index = 0;
      message.artifacts = message.artifacts.map(row => {
        if (row.kind !== 'wallet_balance') return row;
        const snapshot = snapshots[index++];
        return row.wallet || !snapshot.wallet ? row : snapshot;
      });
    }
    snapshots = [];
  }
}
