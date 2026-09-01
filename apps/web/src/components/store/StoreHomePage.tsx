import { useMemo, type ReactNode, type RefObject } from "react";
import emptyBagImg from "../../../assets/empty-bag.svg";

type HomeStoreProduct = {
  category?: string;
};

type HomeCategory = {
  key: string;
  label: string;
  count: number;
  filterValue: string | null;
  bg: string;
  icon: ReactNode;
};

function categoryLabel(p: HomeStoreProduct): string {
  return (p.category || "").trim() || "Other";
}

const CATEGORY_VISUALS: Record<string, { bg: string; icon: ReactNode }> = {
  Apparel: {
    bg: "#dff5e8",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M8 4l-2 3H3l2 5v8h14v-8l2-5h-3l-2-3-2 2H10L8 4z" stroke="#0e1e16" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  Drinkware: {
    bg: "#dcecff",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M8 4h8v3l-1 13H9L8 7V4z" stroke="#0e1e16" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7 7h10" stroke="#0e1e16" strokeWidth="1.6" />
      </svg>
    ),
  },
  "Office Supplies": {
    bg: "#fff3c4",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M6 18l12-6-3-9-12 6 3 9z" stroke="#0e1e16" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 9l6 3" stroke="#0e1e16" strokeWidth="1.6" />
      </svg>
    ),
  },
  Stationery: {
    bg: "#fff3c4",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M6 18l12-6-3-9-12 6 3 9z" stroke="#0e1e16" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  "Tech Accessories": {
    bg: "#ebe4ff",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <rect x="7" y="3" width="10" height="18" rx="2" stroke="#0e1e16" strokeWidth="1.6" />
        <path d="M10 18h4" stroke="#0e1e16" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  "Work Essentials": {
    bg: "#ebe4ff",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <rect x="5" y="8" width="14" height="10" rx="2" stroke="#0e1e16" strokeWidth="1.6" />
        <path d="M9 8V6a3 3 0 016 0v2" stroke="#0e1e16" strokeWidth="1.6" />
      </svg>
    ),
  },
  Accessories: {
    bg: "#ffe4dc",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M7 10a5 5 0 0110 0v2h2v8H5v-8h2v-2z" stroke="#0e1e16" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  Merch: {
    bg: "#dff5f0",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M4 8h16v12H4V8z" stroke="#0e1e16" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 8V5a2 2 0 00-4 0v3M12 8V5a2 2 0 014 0v3" stroke="#0e1e16" strokeWidth="1.6" />
      </svg>
    ),
  },
  Kits: {
    bg: "#dff5f0",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M4 8h16v12H4V8z" stroke="#0e1e16" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 8V5a2 2 0 00-4 0v3M12 8V5a2 2 0 014 0v3" stroke="#0e1e16" strokeWidth="1.6" />
      </svg>
    ),
  },
};

const ALL_PRODUCTS_VISUAL = {
  bg: "#dcecff",
  icon: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="#3b58ff" strokeWidth="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="#3b58ff" strokeWidth="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="#3b58ff" strokeWidth="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="#3b58ff" strokeWidth="1.6" />
    </svg>
  ),
};

const DEFAULT_VISUAL = {
  bg: "#f2f2f2",
  icon: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="#0e1e16" strokeWidth="1.6" />
    </svg>
  ),
};

function buildHomeCategories(products: HomeStoreProduct[]): HomeCategory[] {
  if (!products.length) return [];

  const counts = new Map<string, number>();
  for (const p of products) {
    const cat = categoryLabel(p);
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  const categories: HomeCategory[] = [
    {
      key: "all",
      label: "All Products",
      count: products.length,
      filterValue: null,
      ...ALL_PRODUCTS_VISUAL,
    },
  ];

  for (const [label, count] of Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count <= 0) continue;
    const visual = CATEGORY_VISUALS[label] || DEFAULT_VISUAL;
    categories.push({
      key: label,
      label,
      count,
      filterValue: label,
      bg: visual.bg,
      icon: visual.icon,
    });
  }

  return categories;
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StoreHomePage({
  products,
  productGrid,
  contentRef,
  bannerUrl,
  bannerAlt,
  onViewAllProducts,
  onBrowseCategory,
}: {
  products: HomeStoreProduct[];
  productGrid: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
  bannerUrl?: string;
  bannerAlt?: string;
  onViewAllProducts: () => void;
  onBrowseCategory: (category: string | null) => void;
}) {
  const categories = useMemo(() => buildHomeCategories(products), [products]);

  return (
    <div className="sf-home">
      {bannerUrl ? (
        <section className="sf-home-hero" aria-label="Store banner">
          <div className="sf-home-hero-frame">
            <img
              src={bannerUrl}
              alt={bannerAlt || "Store banner"}
              className="sf-home-hero-img"
              loading="eager"
              decoding="async"
            />
          </div>
        </section>
      ) : null}

      <div className="sf-content sf-home-content" ref={contentRef}>
        {products.length > 0 ? (
          <>
            {categories.length > 0 ? (
              <section className="sf-home-categories" aria-label="Shop by category">
                <div className="sf-home-section-head">
                  <h2 className="sf-home-section-title">Shop by category</h2>
                  <button type="button" className="sf-home-view-all" onClick={onViewAllProducts}>
                    View all <ArrowRightIcon />
                  </button>
                </div>
                <div className="sf-home-categories-row">
                  {categories.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      className="sf-home-cat-item"
                      onClick={() => onBrowseCategory(cat.filterValue)}
                    >
                      <span className="sf-home-cat-icon" style={{ background: cat.bg }}>
                        {cat.icon}
                      </span>
                      <span className="sf-home-cat-label">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="sf-home-products" aria-label="Popular products">
              {productGrid}
              <div className="sf-home-products-foot">
                <button type="button" className="sf-home-view-products-btn" onClick={onViewAllProducts}>
                  View all products
                </button>
              </div>
            </section>
          </>
        ) : (
          <div className="sf-no-products">
            <img
              src={emptyBagImg}
              alt=""
              className="sf-no-products-icon"
              width={119}
              height={104}
              aria-hidden="true"
            />
            <p className="sf-no-products-title">No products yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const HOME_FEATURED_COUNT = 8;
