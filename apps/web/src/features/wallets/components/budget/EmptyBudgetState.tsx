import { Plus } from "lucide-react";

type Props = {
  onSetup: () => void;
  disabled?: boolean;
};

/** First-time empty state — matches the legacy card.empty layout. */
export function EmptyBudgetState({ onSetup, disabled }: Props) {
  return (
    <div className="card empty app-simple-empty">
      <h3>Organization budget</h3>
      <p>
        Create your merchandise budget by submitting a Purchase Order or Agreement. ShelfMerch will
        review your funding request before your budget goes live.
      </p>
      <button
        type="button"
        className="app-simple-empty__cta"
        onClick={onSetup}
        disabled={disabled}
      >
        <Plus size={16} /> Setup budget
      </button>
    </div>
  );
}
