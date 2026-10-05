import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { CatalogVm } from "../controllers/useCatalogController";
import {
  ALL_PRODUCTS,
  CUSTOMISED_KITS_SUBCATEGORY,
  KITS_CATEGORY,
  PREDESIGNED_KITS_SUBCATEGORY,
  productMatchesLevel,
  productMatchesSubcategory,
  type CatalogCategoryChild,
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

/**
 * When a Parent has a single Category that shares its name (Apparel → Apparel),
 * collapse that level and treat Sub-Categories as the sidebar list.
 */
function resolveBrowseLevels(nodes: readonly CatalogCategoryChild[], parentName: string) {
  const collapsed =
    nodes.length === 1 &&
    nodes[0]?.name === parentName &&
    (nodes[0].children?.length ?? 0) > 0;

  if (collapsed) {
    return {
      collapsed: true as const,
      categories: nodes[0].children ?? [],
      categoryNodes: nodes,
    };
  }
  return {
    collapsed: false as const,
    categories: nodes,
    categoryNodes: nodes,
  };
}

export function CatalogCategoryView(vm: CatalogVm) {
  const { pathname } = useLocation();
  const isPublicApps = pathname.startsWith("/apps/catalog");
  const catalogHome = isPublicApps ? "/apps/catalog" : "/app/catalog";
  const parentName = vm.parent;
  const isKitsCategory = parentName === KITS_CATEGORY;

  const slides = useMemo(
    () => vm.categories.filter((category) => category !== ALL_PRODUCTS),
    [vm.categories],
  );
  const currentIndex = Math.max(0, slides.indexOf(parentName));
  const prevCategory = slides[(currentIndex - 1 + slides.length) % slides.length];
  const nextCategory = slides[(currentIndex + 1) % slides.length];
  const heroImage = CATEGORY_IMAGES[parentName] ?? apparelImg;
  const heroCopy =
    CATEGORY_COPY[parentName] ??
    "Browse curated products in this category and open any item to see full details.";

  const parentCategories = vm.categoriesByParent[parentName] ?? [];
  const levels = useMemo(
    () => resolveBrowseLevels(parentCategories, parentName),
    [parentCategories, parentName],
  );

  /**
   * URL may land on a Category (Stationery) or Sub-Category (Diaries / T-Shirts).
   * For collapsed Apparel, vm.subcategory is the leaf and vm.category is "Apparel".
   */
  const urlCategory = levels.collapsed
    ? vm.subcategory ?? (vm.category !== parentName ? vm.category : null)
    : vm.category;
  const urlSubcategory = levels.collapsed ? null : vm.subcategory;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => urlCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(() => urlSubcategory);

  useEffect(() => {
    setSelectedCategory(urlCategory);
    setSelectedSubcategory(urlSubcategory);
  }, [urlCategory, urlSubcategory, parentName]);

  const kitsVm = useCatalogKitsController(isKitsCategory ? selectedCategory : null);

  function selectCategory(next: string | null) {
    setSelectedCategory(next);
    setSelectedSubcategory(null);
  }

  function selectSubcategory(next: string | null) {
    setSelectedSubcategory(next);
  }

  const sidebarCategories = useMemo(() => {
    const defined = levels.categories.map((node) => node.name);
    if (isKitsCategory) {
      return defined.filter((sub) => {
        if (sub === PREDESIGNED_KITS_SUBCATEGORY) {
          return (
            kitsVm.allKits.some((kit) => kit.kind === "pre-designed") ||
            vm.items.some((item) => productMatchesSubcategory(item, sub))
          );
        }
        if (sub === CUSTOMISED_KITS_SUBCATEGORY) {
          return (
            kitsVm.allKits.some((kit) => kit.kind === "customised") ||
            vm.items.some((item) => productMatchesSubcategory(item, sub))
          );
        }
        return false;
      });
    }

    if (levels.collapsed) {
      // Sidebar shows Sub-Categories (T-Shirts, …); match childCategory or legacy subcategory.
      const fromProducts = vm.items
        .map((item) => String(item.childCategory || item.subcategory || "").trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...defined, ...fromProducts]));
      const withProducts = merged.filter((name) =>
        vm.items.some(
          (item) =>
            productMatchesLevel(item, "subcategory", name) ||
            productMatchesLevel(item, "category", name),
        ),
      );
      const withoutOthers = withProducts.filter((name) => name !== "Others");
      if (withProducts.includes("Others")) withoutOthers.push("Others");
      return withoutOthers;
    }

    const fromProducts = vm.items
      .map((item) => String(item.subcategory || "").trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...defined, ...fromProducts]));
    const withProducts = merged.filter((name) =>
      vm.items.some((item) => productMatchesLevel(item, "category", name)),
    );
    const withoutOthers = withProducts.filter((name) => name !== "Others");
    if (withProducts.includes("Others")) withoutOthers.push("Others");
    return withoutOthers;
  }, [levels, vm.items, isKitsCategory, kitsVm.allKits]);

  const subcategoryChips = useMemo(() => {
    if (levels.collapsed || !selectedCategory) return [];
    const node = levels.categoryNodes.find((entry) => entry.name === selectedCategory);
    const defined = (node?.children ?? []).map((leaf) => leaf.name);
    if (!defined.length) return [];
    const fromProducts = vm.items
      .filter((item) => productMatchesLevel(item, "category", selectedCategory))
      .map((item) => String(item.childCategory || "").trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...defined, ...fromProducts]));
    return merged.filter(
      (name) =>
        name !== "Others" &&
        vm.items.some((item) => productMatchesLevel(item, "subcategory", name)),
    );
  }, [levels, selectedCategory, vm.items]);

  const filteredItems = useMemo(() => {
    let items = vm.items;
    if (levels.collapsed) {
      if (selectedCategory) {
        items = items.filter(
          (item) =>
            productMatchesLevel(item, "subcategory", selectedCategory) ||
            productMatchesLevel(item, "category", selectedCategory),
        );
      }
      return items;
    }
    if (selectedCategory) {
      items = items.filter((item) => productMatchesLevel(item, "category", selectedCategory));
    }
    if (selectedSubcategory) {
      items = items.filter((item) => productMatchesLevel(item, "subcategory", selectedSubcategory));
    }
    return items;
  }, [vm.items, levels.collapsed, selectedCategory, selectedSubcategory]);

  const hasKitProducts = filteredItems.length > 0;
  const kitsStillLoading = kitsVm.isLoading && kitsVm.allKits.length === 0;
  const showCombinedKitsEmpty =
    isKitsCategory &&
    !kitsStillLoading &&
    !vm.isSkeleton &&
    kitsVm.kits.length === 0 &&
    !hasKitProducts &&
    !kitsVm.errorMessage &&
    !vm.errorMessage;

  const sidebarLabel = levels.collapsed || isKitsCategory ? "Categories" : "Categories";
  const crumbCategory = selectedCategory;
  const crumbSubcategory = levels.collapsed ? null : selectedSubcategory;
  const filterLabel = crumbSubcategory || crumbCategory;

  return (
    <div className="sm-cat-page sm-cat-page--public">
      <div className="sm-cat-page__container">
        <div className="sm-cat-page__topbar">
          <nav className="sm-cat-page__crumbs" aria-label="Breadcrumb">
            <Link to={catalogHome}>Catalog</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{parentName}</span>
            {crumbCategory ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span>{crumbCategory}</span>
              </>
            ) : null}
            {crumbSubcategory ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span>{crumbSubcategory}</span>
              </>
            ) : null}
          </nav>
          {!isPublicApps ? (
            <div className="sm-cat-page__topbar-actions">
              <Link to="/app/swag/new" className="btn btn-ghost sm-cat-page__topbar-btn">
                Design Swag
              </Link>
              <Link to="/app/kits/new" className="btn btn-dark sm-cat-page__topbar-btn">
                Create kit
              </Link>
            </div>
          ) : null}
        </div>

        <header className="sm-cat-page__hero">
          <div className="sm-cat-page__hero-copy">
            <p className="sm-cat-page__eyebrow">The best in</p>
            <h1 className="sm-cat-page__title">{parentName}</h1>
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

        <div className="sm-cat-page__body">
          {sidebarCategories.length > 0 ? (
            <aside className="sm-cat-page__subs" aria-label={sidebarLabel}>
              <p className="sm-cat-page__subs-label">{sidebarLabel}</p>
              <nav className="sm-cat-page__subs-list">
                <button
                  type="button"
                  className={`sm-cat-page__sub${!selectedCategory ? " sm-cat-page__sub--active" : ""}`}
                  onClick={() => selectCategory(null)}
                >
                  All {parentName}
                </button>
                {sidebarCategories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`sm-cat-page__sub${
                      selectedCategory === name ? " sm-cat-page__sub--active" : ""
                    }`}
                    onClick={() => selectCategory(name)}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              {subcategoryChips.length > 0 ? (
                <>
                  <p className="sm-cat-page__subs-label" style={{ marginTop: 16 }}>
                    Sub-categories
                  </p>
                  <nav className="sm-cat-page__subs-list" aria-label="Sub-categories">
                    <button
                      type="button"
                      className={`sm-cat-page__sub${!selectedSubcategory ? " sm-cat-page__sub--active" : ""}`}
                      onClick={() => selectSubcategory(null)}
                    >
                      All {selectedCategory}
                    </button>
                    {subcategoryChips.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className={`sm-cat-page__sub${
                          selectedSubcategory === name ? " sm-cat-page__sub--active" : ""
                        }`}
                        onClick={() => selectSubcategory(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </nav>
                </>
              ) : null}
            </aside>
          ) : null}

          <div className="sm-cat-page__main">
            {isKitsCategory ? (
              <>
                <CatalogKitsGrid
                  {...kitsVm}
                  suppressEmptyState={hasKitProducts || vm.isSkeleton || showCombinedKitsEmpty}
                />
                {vm.isSkeleton ? (
                  <CategoryPageSkeleton />
                ) : vm.errorMessage ? (
                  <div className="card sm-cat-error">{vm.errorMessage}</div>
                ) : hasKitProducts ? (
                  <section className="sm-cat-page__results">
                    <div className="sm-cat-page__results-head">
                      <p className="sm-cat-page__results-count">
                        Showing {filteredItems.length}{" "}
                        {filteredItems.length === 1 ? "product" : "products"}
                        {filterLabel ? ` in ${filterLabel}` : ""}
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
                ) : null}
                {showCombinedKitsEmpty ? (
                  <div className="card empty sm-cat-empty">
                    <h3>No kits in this category</h3>
                    <p className="muted">Try another category or check back later for new kits.</p>
                  </div>
                ) : null}
              </>
            ) : vm.isSkeleton ? (
              <CategoryPageSkeleton />
            ) : vm.errorMessage ? (
              <div className="card sm-cat-error">{vm.errorMessage}</div>
            ) : filteredItems.length === 0 ? (
              <div className="card empty sm-cat-empty">
                <h3>No products in this {filterLabel ? "selection" : "category"}</h3>
                <p className="muted">
                  {filterLabel
                    ? "Try another category or view all products in this parent category."
                    : "Try switching to another parent category."}
                </p>
              </div>
            ) : (
              <section className="sm-cat-page__results">
                <div className="sm-cat-page__results-head">
                  <p className="sm-cat-page__results-count">
                    Showing {filteredItems.length}{" "}
                    {filteredItems.length === 1 ? "product" : "products"}
                    {filterLabel ? ` in ${filterLabel}` : ""}
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
