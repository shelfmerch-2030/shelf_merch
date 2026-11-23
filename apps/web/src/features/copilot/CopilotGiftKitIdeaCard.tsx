import { ImageOff } from "lucide-react";
import { CatalogPrice } from "@/features/catalog/views/CatalogPrice";
import { CatalogProductCardContent, catalogProductCardClass } from "@/features/catalog/views/ProductCard";
import { CardImage } from "./CopilotCardImage";
import type { CopilotGiftKitIdea } from "./api";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function CopilotGiftKitIdeaCard({ kit }: { kit: CopilotGiftKitIdea }) {
  const verified = kit.components.filter(row => row.role === "verified_listing");
  const concepts = kit.components.filter(row => row.role === "concept");
  const budgetLabel = kit.budget.status === "complete" && kit.budget.knownSubtotal != null && kit.budget.currency
    ? formatMoney(kit.budget.knownSubtotal, kit.budget.currency)
    : kit.budget.status === "partial" && kit.budget.knownSubtotal != null && kit.budget.currency
      ? `Partial ${formatMoney(kit.budget.knownSubtotal, kit.budget.currency)}`
      : "Budget incomplete";
  const price = kit.budget.status === "unavailable"
    ? <div className="pr">Budget incomplete</div>
    : <CatalogPrice price={budgetLabel} />;

  return (
    <article className={`${catalogProductCardClass} sm-copilot-product--gift-kit`} aria-label={kit.name}>
      <CatalogProductCardContent
        name={kit.name}
        brand="Gifting kit idea"
        image={(
          <div className="sm-copilot-kit-thumbs" aria-label="Kit components">
            {verified.length ? verified.slice(0, 4).map((component, index) => (
              <div key={`${component.name}-${index}`} className="sm-copilot-kit-thumbs__item">
                <CardImage
                  src={component.imageUrl || ""}
                  alt={component.imageUrl ? component.name : ""}
                  emptyLabel="No merchant image"
                />
              </div>
            )) : (
              <div className="sm-copilot-kit-thumbs__placeholder">
                <ImageOff size={22} aria-label="No verified kit photograph" />
              </div>
            )}
          </div>
        )}
        price={price}
        showPriceLabel={kit.budget.status !== "unavailable"}
        note={(
          <div className="sm-copilot-catalog-card__note">
            <div className="sm-copilot-trust-badge sm-copilot-trust-badge--kit">Gifting kit idea</div>
            <div>{kit.rationale}</div>
            <div><strong>Recipient fit:</strong> {kit.recipientFit}</div>
            <div><strong>Packaging:</strong> {kit.packagingSuggestion}</div>
            {verified.length ? (
              <ul className="sm-copilot-kit-components">
                {verified.map((component, index) => (
                  <li key={`v-${component.name}-${index}`}>
                    <span className="sm-copilot-trust-badge sm-copilot-trust-badge--external">Verified</span>
                    {" "}
                    {component.productUrl ? (
                      <a href={component.productUrl} target="_blank" rel="noopener noreferrer">{component.name}</a>
                    ) : component.name}
                    {component.priceText ? ` · ${component.priceText}` : " · Unit price unknown"}
                  </li>
                ))}
              </ul>
            ) : null}
            {concepts.length ? (
              <ul className="sm-copilot-kit-components sm-copilot-kit-components--concept">
                {concepts.map((component, index) => (
                  <li key={`c-${component.name}-${index}`}>
                    <span className="sm-copilot-trust-badge sm-copilot-trust-badge--concept">Concept</span>
                    {" "}
                    {component.name} — {component.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            {kit.budget.missingPriceCount > 0 ? (
              <div>{kit.budget.missingPriceCount} {kit.budget.missingPriceCount === 1 ? "price needs" : "prices need"} confirmation.</div>
            ) : null}
            <small>{kit.budget.note}</small>
            <div className="sm-copilot-kit-photo-note">No complete kit photograph — component images are merchant listings only when available.</div>
          </div>
        )}
      />
    </article>
  );
}
