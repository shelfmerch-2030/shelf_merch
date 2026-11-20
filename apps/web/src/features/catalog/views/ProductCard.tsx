import { Link } from "react-router";
import type { ReactNode } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { CatalogPrice } from "./CatalogPrice";
import "./product-card.css";

function thumb(p: UiProduct): string | undefined {
  return resolveMediaUrl(p.mockupUrl) || resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imgUrl);
}

export const catalogProductCardClass = "pcard pcard--editorial catalog-product-card";

export function CatalogProductCardContent({
  name,
  brand,
  image,
  price,
  minimum,
  showPriceLabel = true,
  note,
}: {
  name: string;
  brand?: string;
  image: ReactNode;
  price: ReactNode;
  minimum?: number;
  showPriceLabel?: boolean;
  note?: ReactNode;
}) {
  return <>
    <div className="img">{image}</div>
    <div className="meta">
      <div className="catalog-product-card__brand">{brand || "\u00a0"}</div>
      <div className="nm">{name}</div>
      <div className="pcard-bottom">
        <div className="catalog-product-card__price">{showPriceLabel ? <span>AS LOW AS</span> : null}{price}</div>
        {minimum !== undefined ? <div className="pcard-min">Min {minimum}</div> : null}
      </div>
      {note}
    </div>
  </>;
}

/** Shared product card for catalog listings, featured rows and related items. */
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

  const content = (
    <CatalogProductCardContent
      name={product.nm}
      brand={product.brand}
      minimum={1}
      price={<CatalogPrice price={product.price} basePriceInr={product.basePriceInr} />}
      image={src ? (
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
    />
  );

  const href = to ?? (product.id ? `/app/catalog/${product.id}` : undefined);
  if (href) {
    return (
      <Link
        to={href}
        state={state}
        className={catalogProductCardClass}
        aria-label={`View ${product.nm}`}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {content}
      </Link>
    );
  }

  return <div className={catalogProductCardClass}>{content}</div>;
}
