import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { CatalogVm } from "../controllers/useCatalogController";
import { ALL_PRODUCTS, catalogCategorySlug } from "../types";
import { ProductCard } from "./ProductCard";
import "./catalog-view.css";
import apparelImg from "../../../../assets/catalog/apparel.png";
import bagsImg from "../../../../assets/catalog/bags.webp";
import cardHoldersImg from "../../../../assets/catalog/card-holders.webp";
import drinkwareImg from "../../../../assets/catalog/drinkware.png";
import keyChainsImg from "../../../../assets/catalog/key-chains.webp";
import officeImg from "../../../../assets/catalog/office.png";
import technologyImg from "../../../../assets/catalog/technology.png";

const CATEGORY_COPY: Record<string, string> = {
  Apparel: "Premium apparel designed for team wear, campaigns, events, and everyday brand visibility.",
  Accessories: "Smart branded add-ons that are easy to gift, carry, and use across every audience.",
  Bags: "Travel-ready and work-ready bags that keep your brand visible on the move.",
  Drinkware: "Daily-use bottles, tumblers, and mugs built for repeat impressions.",
  Technology: "Useful tech accessories that make branded gifting feel modern and practical.",
  "Office Supplies": "Desk essentials and stationery picks made for onboarding, meetings, and workdays.",
  "Key Chains": "Compact, high-utility keepsakes that are easy to distribute in bulk.",
  "Card Holders": "Refined everyday carry pieces that make premium branded gifting feel elevated.",
};

const CATEGORY_IMAGES: Record<string, string> = {
  Apparel: apparelImg,
  Accessories: keyChainsImg,
  Bags: bagsImg,
  Drinkware: drinkwareImg,
  Technology: technologyImg,
  "Office Supplies": officeImg,
  "Key Chains": keyChainsImg,
  "Card Holders": cardHoldersImg,
};

function CategoryPageSkeleton() {
  return (
    <div className="sm-cat-grid" aria-busy="true" aria-label="Loading category products">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="sm-skeleton-card">
          <div className="sm-skeleton-img" />
          <div className="sm-skeleton-line" />
          <div className="sm-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function CatalogCategoryView(vm: CatalogVm) {
  const { pathname } = useLocation();
  const isPublic = pathname.startsWith("/apps/catalog");
  const catalogHome = isPublic ? "/apps/catalog" : "/app/catalog";
  const categoryBase = `${catalogHome}/category`;

  const slides = useMemo(
    () => vm.categories.filter((category) => category !== ALL_PRODUCTS),
    [vm.categories],
  );
  const currentIndex = Math.max(0, slides.indexOf(vm.category));
  const prevCategory = slides[(currentIndex - 1 + slides.length) % slides.length];
  const nextCategory = slides[(currentIndex + 1) % slides.length];
  const heroImage = CATEGORY_IMAGES[vm.category] ?? apparelImg;
  const heroCopy =
    CATEGORY_COPY[vm.category] ??
    "Browse curated products in this category and open any item to see full details.";

  return (
    <div className={isPublic ? "sm-cat-page sm-cat-page--public" : "sm-cat-page"}>
      <div className="sm-cat-page__container">
        <nav className="sm-cat-page__crumbs" aria-label="Breadcrumb">
          <Link to={catalogHome}>Catalog</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{vm.category}</span>
        </nav>

        <header className="sm-cat-page__hero">
          <div className="sm-cat-page__hero-copy">
            <h1 className="sm-cat-page__title">{vm.category}</h1>
            <p className="sm-cat-page__copy">{heroCopy}</p>
            <div className="sm-cat-page__hero-nav">
              <button
                type="button"
                className="sm-cat-page__hero-arrow"
                aria-label={`Previous category, ${prevCategory}`}
                onClick={() => vm.onCategory(prevCategory)}
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sm-cat-page__hero-arrow"
                aria-label={`Next category, ${nextCategory}`}
                onClick={() => vm.onCategory(nextCategory)}
              >
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="sm-cat-page__hero-visual">
            <img src={heroImage} alt="" />
          </div>
        </header>

        <section className="sm-cat-page__switcher" aria-label="Category switcher">
          {slides.map((category) => (
            <Link
              key={category}
              to={`${categoryBase}/${catalogCategorySlug(category)}`}
              className={`sm-cat-page__pill${category === vm.category ? " sm-cat-page__pill--active" : ""}`}
            >
              {category}
            </Link>
          ))}
        </section>

        {vm.isSkeleton ? (
          <CategoryPageSkeleton />
        ) : vm.errorMessage ? (
          <div className="card sm-cat-error">{vm.errorMessage}</div>
        ) : vm.items.length === 0 ? (
          <div className="card empty sm-cat-empty">
            <h3>No products in this category</h3>
            <p className="muted">Try switching to another category.</p>
          </div>
        ) : (
          <section className="sm-cat-page__results">
            <div className="sm-cat-page__results-head">
              <p className="sm-cat-page__results-count">
                Showing {vm.items.length} {vm.items.length === 1 ? "product" : "products"}
              </p>
              <Link to={catalogHome} className="sm-cat-page__back">
                Back to all categories
              </Link>
            </div>

            <div className="sm-cat-grid">
              {vm.items.map((p, index) => (
                <ProductCard
                  key={p.id ?? `${p.nm}-${index}`}
                  product={p}
                  to={p.id ? `${catalogHome}/${p.id}` : undefined}
                  state={{ fromCatalog: pathname }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}