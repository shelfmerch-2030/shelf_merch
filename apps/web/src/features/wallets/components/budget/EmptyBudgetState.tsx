import { Plus } from "lucide-react";
import budgetArt from "../../../../../assets/budget.png";

type Props = {
  onSetup: () => void;
  disabled?: boolean;
};

/** First-time empty state — illustrated wallet with brief setup copy. */
export function EmptyBudgetState({ onSetup, disabled }: Props) {
  return (
    <div className="card empty app-simple-empty budget-empty">
      <div className="budget-empty__copy">
        <h3>Organization budget</h3>
        <p>Submit a PO or agreement to fund your wallet. After review, allocate and track spend here.</p>
        <button
          type="button"
          className="app-simple-empty__cta"
          onClick={onSetup}
          disabled={disabled}
        >
          <Plus size={16} /> Setup budget
        </button>
      </div>
      <img
        src={budgetArt}
        alt="Wallet with coins, calculator, and budget report"
        className="budget-empty__art"
        width={1254}
        height={1254}
        decoding="async"
      />
    </div>
  );
}
