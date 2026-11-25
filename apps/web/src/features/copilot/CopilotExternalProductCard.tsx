import { CardImage } from "./CopilotCardImage";
import type { CopilotExternalProduct } from "./api";

/** Optional future contract: structured evidence-backed features only (never invented from reason). */
type ExternalProductView = CopilotExternalProduct & { features?: string[] };

function merchantLabel(product: CopilotExternalProduct) {
  return product.merchantDisplayName || product.merchantHostname;
}

function evidenceFeatures(product: ExternalProductView): string[] {
  if (!Array.isArray(product.features)) return [];
  return product.features
    .map(row => String(row || "").trim())
    .filter(row => row.length >= 3 && row.length <= 160)
    .slice(0, 4);
}

/**
 * Borderless, inline editorial row for a verified external listing.
 * Not a catalog card — image left, details right, hairline separator via parent list.
 */
export function CopilotExternalProductCard({ product, index = 0 }: { product: CopilotExternalProduct; index?: number }) {
  const view = product as ExternalProductView;
  const merchant = merchantLabel(product);
  const features = evidenceFeatures(view);
  const price = product.priceText?.trim() || "Price unavailable";
  const reason = product.reason?.trim() || "";

  return (
    <article className="sm-copilot-external-row" aria-label={product.name}>
      <div className="sm-copilot-external-row__media" aria-hidden={!product.imageUrl}>
        <CardImage
          key={product.imageUrl || product.productUrl}
          src={product.imageUrl || ""}
          alt={product.imageUrl ? product.name : ""}
          emptyLabel="No merchant image available"
        />
      </div>
      <div className="sm-copilot-external-row__body">
        <h3 className="sm-copilot-external-row__heading">
          <span className="sm-copilot-external-row__index">{index + 1}.</span>
          <a
            className="sm-copilot-external-row__title"
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {product.name}
          </a>
        </h3>
        <p className={`sm-copilot-external-row__price${product.priceText ? "" : " sm-copilot-external-row__price--muted"}`}>
          {price}
        </p>
        <p className="sm-copilot-external-row__merchant">{merchant}</p>
        {reason ? <p className="sm-copilot-external-row__reason">{reason}</p> : null}
        {features.length ? (
          <ul className="sm-copilot-external-row__features">
            {features.map(feature => <li key={feature}>{feature}</li>)}
          </ul>
        ) : null}
        <a
          className="sm-copilot-external-row__view"
          href={product.productUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View product
          <span aria-hidden="true"> ↗</span>
        </a>
      </div>
    </article>
  );
}
