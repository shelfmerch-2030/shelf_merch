import { useMemo, type ReactNode, type RefObject } from "react";
import emptyBagImg from "../../../assets/empty-bag.svg";
import apparelIcon from "../../../assets/store/category-icons/apparel.png";
import keychainIcon from "../../../assets/store/category-icons/keychain.png";
import bagsIcon from "../../../assets/store/category-icons/bags.png";
import drinkwareIcon from "../../../assets/store/category-icons/drinkware.png";
import officeSuppliesIcon from "../../../assets/store/category-icons/office-supplies.png";
import technologyIcon from "../../../assets/store/category-icons/technology.png";

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

function categoryIcon(src: string) {
  return (
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      className="sf-home-cat-icon-img"
      aria-hidden="true"
      decoding="async"
    />
  );
}

const CATEGORY_VISUALS: Record<string, { bg: string; icon: ReactNode }> = {
  Apparel: {
    bg: "#dff5e8",
    icon: categoryIcon(apparelIcon),
  },
  Accessories: {
    bg: "#ffe4dc",
    icon: categoryIcon(keychainIcon),
  },
  "Key Chains": {
    bg: "#ffe4dc",
    icon: categoryIcon(keychainIcon),
  },
  Bags: {
    bg: "#f2f2f2",
    icon: categoryIcon(bagsIcon),
  },
  Drinkware: {
    bg: "#dcecff",
    icon: categoryIcon(drinkwareIcon),
  },
  "Office Supplies": {
    bg: "#fff3c4",
    icon: categoryIcon(officeSuppliesIcon),
  },
  Stationery: {
    bg: "#fff3c4",
    icon: categoryIcon(officeSuppliesIcon),
  },
  Technology: {
    bg: "#f2f2f2",
    icon: categoryIcon(technologyIcon),
  },
  "Tech Accessories": {
    bg: "#f2f2f2",
    icon: categoryIcon(technologyIcon),
  },
  "Work Essentials": {
    bg: "#f2f2f2",
    icon: categoryIcon(technologyIcon),
  },
  Merch: {
    bg: "#dff5f0",
    icon: categoryIcon(bagsIcon),
  },
  Kits: {
    bg: "#dff5f0",
    icon: categoryIcon(bagsIcon),
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
