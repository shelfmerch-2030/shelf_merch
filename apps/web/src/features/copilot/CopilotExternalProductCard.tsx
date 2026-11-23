import { CatalogPrice } from "@/features/catalog/views/CatalogPrice";
import { CatalogProductCardContent, catalogProductCardClass } from "@/features/catalog/views/ProductCard";
import { CardImage } from "./CopilotCardImage";
import type { CopilotExternalProduct } from "./api";

function formatRetrieved(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CopilotExternalProductCard({ product }: { product: CopilotExternalProduct }) {
  const merchant = product.merchantDisplayName || product.merchantHostname;
  const price = product.priceText
    ? <CatalogPrice price={product.priceText} />
    : <div className="pr">Unit price unknown</div>;
  const note = (
    <div className="sm-copilot-catalog-card__note">
      <div className="sm-copilot-trust-badge sm-copilot-trust-badge--external">Verified external listing</div>
      <div>{merchant}</div>
      {product.reason ? <div>{product.reason}</div> : null}
      <div>Availability unknown · Confirm stock and delivery on the merchant site</div>
      {product.retrievedAt ? <div>Retrieved {formatRetrieved(product.retrievedAt)}</div> : null}
    </div>
  );
  return (
    <a
      href={product.productUrl}
      className={`${catalogProductCardClass} sm-copilot-product--external`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${product.name} on ${merchant}`}
    >
      <CatalogProductCardContent
        name={product.name}
        brand={merchant}
        image={(
          <CardImage
            key={product.imageUrl || product.productUrl}
            src={product.imageUrl || ""}
            alt={product.imageUrl ? product.name : ""}
            emptyLabel="No merchant image available"
          />
        )}
        price={price}
        showPriceLabel={Boolean(product.priceText)}
        note={note}
      />
      <span className="sm-copilot-catalog-card__action">View on merchant site</span>
    </a>
  );
}
