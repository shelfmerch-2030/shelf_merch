import { Link } from "react-router";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { productSwatches } from "../types";

function displayPrice(value: string): string {
  return value.replace(/₹|₨/g, "Rs").replace(/^Rs\.?\s*/i, "Rs");
}

function thumb(p: UiProduct): string | undefined {
  return resolveMediaUrl(p.mockupUrl) || resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imgUrl);
}

/** Catalog/browse product card — faithful to the legacy `pcard()` markup. */
export function ProductCard({
  product,
  to,
  state,
}: {
  product: UiProduct;
  to?: string;
  state?: { fromCatalog?: string };
}) {
  const src = thumb(product);
  const swatches = productSwatches(product);
  const preview = swatches.slice(0, 4);
  const more = swatches.length - preview.length;

  const content = (
    <>
      <div className="img">
        {src ? (
          <img
            src={src}
            alt={product.nm}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <div
            className="sm-skeleton-img"
            aria-hidden="true"
            style={{ width: "100%", height: "100%" }}
          />
        )}
        {swatches.length > 0 && (
          <div className="swatches pcard-swatch-pill" aria-label={`${swatches.length} available colors`}>
            {preview.map((c) => (
              <span
                key={c.name}
                className="sw"
                style={{ background: c.hex }}
                title={c.name}
              />
            ))}
            {more > 0 && <span className="pcard-more">+{more}</span>}
          </div>
        )}
      </div>
      <div className="meta">
        <div className="nm">{product.nm}</div>
        <div className="pcard-bottom">
          {product.price && <div className="pr">{displayPrice(product.price)}</div>}
          <div className="pcard-min">Min 1</div>
        </div>
      </div>
    </>
  );

  const href = to ?? (product.id ? `/app/catalog/${product.id}` : undefined);
  if (href) {
    return (
      <Link
        to={href}
        state={state}
        className="pcard"
        aria-label={`View ${product.nm}`}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {content}
      </Link>
    );
  }

  return <div className="pcard">{content}</div>;
}
