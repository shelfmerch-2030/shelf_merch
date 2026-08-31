import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation, useParams } from "react-router";
import type { CatalogVm } from "../controllers/useCatalogController";
import {
  ALL_PRODUCTS,
  CATALOG_SUBCATEGORIES,
  KITS_CATEGORY,
  productMatchesSubcategory,
  resolveCatalogSubcategory,
} from "../types";
import { ProductCard } from "./ProductCard";
import { CatalogKitsGrid } from "./CatalogKitsGrid";
import { useCatalogKitsController } from "../controllers/useCatalogKitsController";
import "./catalog-view.css";
import accessoriesImg from "../../../../assets/catalog/category-heroes/accessories-bystadium.png";
import apparelImg from "../../../../assets/catalog/category-heroes/apparel-bystadium.png";
import bagsImg from "../../../../assets/catalog/category-heroes/bags-bystadium.png";
import drinkwareImg from "../../../../assets/catalog/category-heroes/drinkware-bystadium.png";
import officeImg from "../../../../assets/catalog/category-heroes/office-supplies-bystadium.png";
import technologyImg from "../../../../assets/catalog/category-heroes/technology-bystadium.png";
import kitsImg from "../../../../assets/catalog-style-spotlight/kits.png";

const CATEGORY_COPY: Record<string, string> = {
  Apparel:
    "Custom branded apparel built for teams at scale. From everyday essentials to premium statement pieces, our apparel collection helps you turn clothing into culture.",
  Accessories:
    "Smart branded add-ons — including key chains — that are easy to gift, carry, and use across every audience.",
  Bags:
    "Branded bags designed for impact and logistics simplicity. From trade show totes to executive backpacks, every carry is built for real-world use.",
  Drinkware:
    "Reusable bottles, tumblers, and mugs built for everyday rituals, repeat impressions, and branded moments that travel with your team.",
  Technology:
    "Useful tech accessories that make branded gifting feel modern, practical, and ready for hybrid workdays, launches, and events.",
  "Office Supplies":
    "Desk essentials, stationery, and workday tools made for onboarding, meetings, campaigns, and every polished brand touchpoint.",
  Kits:
    "Ready-made gift bundles and custom kits built from our catalog. Choose a pre-designed template or send a kit you've already created for your team.",
};

const CATEGORY_IMAGES: Record<string, string> = {
  Apparel: apparelImg,
  Accessories: accessoriesImg,
  Bags: bagsImg,
  Drinkware: drinkwareImg,
  Technology: technologyImg,
  "Office Supplies": officeImg,
  Kits: kitsImg,
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
  const { category: categoryParam } = useParams();
  const isPublicApps = pathname.startsWith("/apps/catalog");
  const catalogHome = isPublicApps ? "/apps/catalog" : "/app/catalog";
  const isKitsCategory = vm.category === KITS_CATEGORY;

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

  const subcategories = useMemo(() => {
    const defined = [...(CATALOG_SUBCATEGORIES[vm.category] ?? [])];
    if (isKitsCategory) return defined;
    const fromProducts = vm.items
      .map((item) => String(item.subcategory || "").trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...defined, ...fromProducts]));
    const withoutOthers = merged.filter((sub) => sub !== "Others");
    if (merged.includes("Others")) withoutOthers.push("Others");
    return withoutOthers;
  }, [vm.category, vm.items, isKitsCategory]);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(() =>
    resolveCatalogSubcategory(categoryParam, vm.category),
  );
  const kitsVm = useCatalogKitsController(isKitsCategory ? selectedSubcategory : null);

  useEffect(() => {
    setSelectedSubcategory(resolveCatalogSubcategory(categoryParam, vm.category));
  }, [categoryParam, vm.category]);

  const filteredItems = useMemo(() => {
    if (!selectedSubcategory) return vm.items;
    return vm.items.filter((item) => productMatchesSubcategory(item, selectedSubcategory));
  }, [vm.items, selectedSubcategory]);

  return (
    <div className="sm-cat-page sm-cat-page--public">
      <div className="sm-cat-page__container">
        <nav className="sm-cat-page__crumbs" aria-label="Breadcrumb">
          <Link to={catalogHome}>Catalog</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{vm.category}</span>
          {selectedSubcategory ? (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <span>{selectedSubcategory}</span>
            </>
          ) : null}
        </nav>

        <header className="sm-cat-page__hero">
          <div className="sm-cat-page__hero-copy">
            <p className="sm-cat-page__eyebrow">The best in</p>
            <h1 className="sm-cat-page__title">{vm.category}</h1>
            <p className="sm-cat-page__copy">{heroCopy}</p>
            <button type="button" className="sm-cat-page__view-all" onClick={() => setSelectedSubcategory(null)}>
              View all {vm.category}
            </button>
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

        <div className="sm-cat-page__body">
          {subcategories.length > 0 ? (
            <aside className="sm-cat-page__subs" aria-label="Subcategories">
              <p className="sm-cat-page__subs-label">Subcategories</p>
              <nav className="sm-cat-page__subs-list">
                <button
                  type="button"
                  className={`sm-cat-page__sub${!selectedSubcategory ? " sm-cat-page__sub--active" : ""}`}
                  onClick={() => setSelectedSubcategory(null)}
                >
                  All {vm.category}
                </button>
                {subcategories.map((subcategory) => (
                  <button
                    key={subcategory}
                    type="button"
                    className={`sm-cat-page__sub${
                      selectedSubcategory === subcategory ? " sm-cat-page__sub--active" : ""
                    }`}
                    onClick={() => setSelectedSubcategory(subcategory)}
                  >
                    {subcategory}
                  </button>
                ))}
              </nav>
            </aside>
          ) : null}

          <div className="sm-cat-page__main">
            {isKitsCategory ? (
              <CatalogKitsGrid {...kitsVm} />
            ) : vm.isSkeleton ? (
              <CategoryPageSkeleton />
            ) : vm.errorMessage ? (
              <div className="card sm-cat-error">{vm.errorMessage}</div>
            ) : filteredItems.length === 0 ? (
              <div className="card empty sm-cat-empty">
                <h3>No products in this {selectedSubcategory ? "subcategory" : "category"}</h3>
                <p className="muted">
                  {selectedSubcategory
                    ? "Try another subcategory or view all products in this category."
                    : "Try switching to another category."}
                </p>
              </div>
            ) : (
              <section className="sm-cat-page__results">
                <div className="sm-cat-page__results-head">
                  <p className="sm-cat-page__results-count">
                    Showing {filteredItems.length}{" "}
                    {filteredItems.length === 1 ? "product" : "products"}
                    {selectedSubcategory ? ` in ${selectedSubcategory}` : ""}
                  </p>
                  <Link to={catalogHome} className="sm-cat-page__back">
                    Back to all categories
                  </Link>
                </div>

                <div className="sm-cat-grid">
                  {filteredItems.map((p, index) => (
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
      </div>
    </div>
  );
}
