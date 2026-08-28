import { Link } from "react-router";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { productSwatches } from "../types";

function normalizePriceLabel(value: string): string {
  return value.replace(/₹|₨|â‚¹|â‚¨/g, "Rs").replace(/^Rs\.?\s*/i, "Rs");
}

function formatCardAmount(raw: string): string {
  const cleaned = String(raw).replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return raw.trim();
  return num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function CardPrice({ price, basePriceInr }: { price?: string; basePriceInr?: number }) {
  const label =
    basePriceInr && basePriceInr > 0
      ? `Rs${Math.round(basePriceInr)}`
      : price?.trim() || "";
  if (!label) return null;

  const normalized = normalizePriceLabel(label);
  const parts = normalized.match(/^(.*?)(Rs)\s?(.+)$/i);

  if (!parts) {
    return <div className="pr">{normalized}</div>;
  }

  const prefix = parts[1]?.trim();
  const amount = formatCardAmount(parts[3]);

  return (
    <div className="pr">
      {prefix ? <span className="pr-prefix">{prefix}</span> : null}
      <span className="pr-symbol">Rs.</span>
      <span className="pr-amount">{amount}</span>
    </div>
  );
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
          <CardPrice price={product.price} basePriceInr={product.basePriceInr} />
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
