import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { UiProduct } from "../model";
import { productMatchesLevel, productPhotoUrl } from "../types";
import { catalogHomePath } from "./CatalogBrowseView";
import { ProductCard } from "./ProductCard";
import "./featured-catalog-products.css";

/** Show a cross-section of the live catalog, without repeating products. */
export function selectFeaturedProducts(products: readonly UiProduct[]) {
  const available = products.filter((product) => product.id && (product.mockupUrl || productPhotoUrl(product)));
  const selected: UiProduct[] = [];
  const ids = new Set<string>();
  const add = (product: UiProduct | undefined) => {
    if (product?.id && !ids.has(product.id) && selected.length < 5) {
      selected.push(product); ids.add(product.id);
    }
  };
  for (const category of ["Apparel", "Drinkware", "Stationery"]) {
    add(available.find((product) => !ids.has(product.id!) && productMatchesLevel(product, "category", category)));
  }
  // Curated home and travel picks; their image, price and link still come from the live catalog.
  for (const id of ["6ac49be66f87655fa994cfb0", "6abb6a21d602f72fd2df9100"]) {
    add(available.find((product) => product.id === id));
  }
  for (const category of ["Electronics & Gadgets", "Bags"]) {
    add(available.find((product) => !ids.has(product.id!) && productMatchesLevel(product, "category", category)));
  }
  available.forEach(add);
  return selected;
}

export function FeaturedCatalogProducts({ products, loading = false, error = null }: {
  products: readonly UiProduct[];
  loading?: boolean;
  error?: string | null;
}) {
  const { pathname, search } = useLocation();
  const home = catalogHomePath(pathname);
  const featured = useMemo(() => selectFeaturedProducts(products), [products]);
  return (
    <section className="sm-featured-products" aria-labelledby="sm-featured-products-title">
      <div className="sm-ref-container">
        <h2 id="sm-featured-products-title">Discover our products</h2>
        <p className="sm-featured-products__intro">Explore apparel, drinkware and everyday essentials for home, work and travel.</p>
        {featured.length ? (
          <div className="sm-featured-products__grid">
            {featured.map((product) => <div className="sm-featured-products__item" key={product.id}>
              <ProductCard product={product} to={`${home}/${product.id}`} state={{ fromCatalog: pathname + search }} />
            </div>)}
          </div>
        ) : loading ? (
          <div className="sm-featured-products__grid" aria-busy="true" aria-label="Loading catalog products">
            {Array.from({ length: 5 }, (_, index) => <div className="sm-skeleton-card" key={index}><div className="sm-skeleton-img" /><div className="sm-skeleton-line" /></div>)}
          </div>
        ) : <p role={error ? "alert" : "status"}>{error || "No products available yet."}</p>}
        <div className="sm-featured-products__footer">
          <Link to={`${home}/category/all-products`}>Browse all products<ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}
