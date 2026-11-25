import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Clock3,
  Gift,
  Package,
  RotateCcw,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CopilotAction, CopilotCategory } from "./api";

const icons: Record<string, LucideIcon> = {
  products_kits: Package,
  budgets_wallet: Wallet,
  stores_collections: Store,
  gifting_rewards: Gift,
  employees_teams: Users,
  campaigns_orders: ClipboardList,
};

export function CopilotWelcome({
  categories,
  selectedCategoryId,
  onCategory,
  onPrompt,
  onAction,
  onReload,
  lane = "shelfmerch",
  children,
}: {
  categories: CopilotCategory[];
  selectedCategoryId: string | null;
  onCategory: (id: string | null) => void;
  onPrompt: (prompt: string) => void;
  onAction?: (action: CopilotAction) => void;
  onReload?: () => void;
  lane?: "shelfmerch" | "discover";
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const initial = useRef(true);
  const discover = lane === "discover";
  const selected = discover ? undefined : categories.find((category) => category.id === selectedCategoryId);
  const Icon = selected ? icons[selected.id] || Package : Package;
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [selectedCategoryId]);

  return (
    <section
      className={`sm-copilot-welcome sm-copilot-discovery${selected ? " sm-copilot-discovery--selected" : ""}${discover ? " sm-copilot-discovery--external" : ""}`}
      aria-labelledby="copilot-title"
    >
      {selected ? (
        <div className="sm-copilot-discovery__navigation">
          <button
            type="button"
            className="sm-copilot-discovery__back"
            onClick={() => onCategory(null)}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            All capabilities
          </button>
          <span className="sm-copilot-discovery__category">
            <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
            {selected.title}
          </span>
        </div>
      ) : null}
      <h1 id="copilot-title" ref={heading} tabIndex={-1}>
        <span key={lane} className="sm-copilot-discovery__title">
          {discover ? "What are you looking for?" : selected?.heading || "How can I help you today?"}
        </span>
      </h1>
      {children}
      {discover ? null : !categories.length ? (
        <div className="sm-copilot-discovery__empty" role="status">
          <p>Your capabilities couldn’t be loaded. You can still write a message below.</p>
          {onReload ? (
            <button type="button" className="sm-copilot-text-button" onClick={onReload}>
              <RotateCcw size={15} aria-hidden="true" />
              Reload capabilities
            </button>
          ) : null}
        </div>
      ) : selected ? (
        <>
          <div className="sm-copilot-action-grid" aria-label={`${selected.title} actions`}>
            {[...selected.actions]
              .sort(
                (a, b) =>
                  Number(a.availability !== "available") - Number(b.availability !== "available"),
              )
              .slice(0, 6)
              .map((action) => {
                const available = action.availability === "available";
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={`sm-copilot-action${available ? "" : " sm-copilot-action--pending"}`}
                    disabled={!available}
                    aria-label={action.title}
                    title={available ? undefined : action.explanation}
                    onClick={() => {
                      if (action.availability !== "available") return;
                      if (onAction) onAction(action);
                      else if (action.availability === "available" && "prompt" in action) {
                        onPrompt(action.prompt);
                      }
                    }}
                  >
                    <span className="sm-copilot-action__content">
                      <strong>{action.title}</strong>
                      {action.description ? <small>{action.description}</small> : null}
                      {!available ? (
                        <span className="sm-copilot-action__pending">
                          <Clock3 size={12} aria-hidden="true" />
                          Coming to Copilot
                        </span>
                      ) : null}
                    </span>
                    {available ? (
                      <ArrowRight
                        size={16}
                        className="sm-copilot-action__arrow"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
          </div>
        </>
      ) : discover ? null : (
        <div className="sm-copilot-capability-grid" aria-label="Copilot capabilities">
          {categories.map((category) => {
            const CategoryIcon = icons[category.id] || Package;
            return (
              <button
                key={category.id}
                type="button"
                className="sm-copilot-capability"
                data-category-id={category.id}
                onClick={() => onCategory(category.id)}
                aria-label={category.title}
              >
                <CategoryIcon size={21} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  <strong>{category.title}</strong>
                  <small>{category.description}</small>
                </span>
                <ArrowRight size={15} className="sm-copilot-capability__arrow" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
