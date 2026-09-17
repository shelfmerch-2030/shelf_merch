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

/** Newest-first slice length for New arrivals / Recommended rails. */
export const HOME_RAIL_COUNT = 5;
/** @deprecated use HOME_RAIL_COUNT — kept for any older imports */
export const HOME_FEATURED_COUNT = HOME_RAIL_COUNT;

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

function SvgIcon({ children, color }: { children: ReactNode; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true" stroke={color} strokeWidth="1.6">
      {children}
    </svg>
  );
}

const CATEGORY_VISUALS: Record<string, { bg: string; icon: ReactNode; displayLabel?: string }> = {
  Apparel: {
    bg: "#e7f7ee",
    displayLabel: "Apparel",
    icon: categoryIcon(apparelIcon),
  },
  Accessories: {
    bg: "#ffe8e0",
    displayLabel: "Lifestyle",
    icon: categoryIcon(keychainIcon),
  },
  "Key Chains": {
    bg: "#ffe8e0",
    icon: categoryIcon(keychainIcon),
  },
  Bags: {
    bg: "#f0f0f0",
    icon: categoryIcon(bagsIcon),
  },
  Drinkware: {
    bg: "#fde8e8",
    icon: categoryIcon(drinkwareIcon),
  },
  "Office Supplies": {
    bg: "#e8f0fe",
    displayLabel: "Office & Desk",
    icon: categoryIcon(officeSuppliesIcon),
  },
  Stationery: {
    bg: "#e8f0fe",
    displayLabel: "Office & Desk",
    icon: categoryIcon(officeSuppliesIcon),
  },
  Technology: {
    bg: "#f3e8ff",
    displayLabel: "Tech & Accessories",
    icon: categoryIcon(technologyIcon),
  },
  "Tech Accessories": {
    bg: "#f3e8ff",
    displayLabel: "Tech & Accessories",
    icon: categoryIcon(technologyIcon),
  },
  "Work Essentials": {
    bg: "#f3e8ff",
    displayLabel: "Tech & Accessories",
    icon: categoryIcon(technologyIcon),
  },
  Merch: {
    bg: "#e7f7ee",
    displayLabel: "Lifestyle",
    icon: (
      <SvgIcon color="#1f9d55">
        <rect x="6" y="9" width="12" height="10" rx="1.5" />
        <path d="M12 9V6.5a2 2 0 0 1 4 0V9M12 9V6.5a2 2 0 0 0-4 0V9" strokeLinecap="round" />
      </SvgIcon>
    ),
  },
  Lifestyle: {
    bg: "#e7f7ee",
    icon: (
      <SvgIcon color="#1f9d55">
        <rect x="6" y="9" width="12" height="10" rx="1.5" />
        <path d="M12 9V6.5a2 2 0 0 1 4 0V9M12 9V6.5a2 2 0 0 0-4 0V9" strokeLinecap="round" />
      </SvgIcon>
    ),
  },
  Sustainable: {
    bg: "#e0f5f2",
    icon: (
      <SvgIcon color="#0d9488">
        <path d="M5 14c4-1 7-4 8-9 4 6 2 12-2 14-3 1.5-6 0-6-5z" strokeLinejoin="round" />
        <path d="M9 12c2 1 4 1.5 6 1" strokeLinecap="round" />
      </SvgIcon>
    ),
  },
  Kits: {
    bg: "#fff1e0",
    displayLabel: "Gifting Kits",
    icon: (
      <SvgIcon color="#ea7a1a">
        <rect x="4" y="10" width="16" height="10" rx="1.5" />
        <path d="M12 10v10M4 14h16M12 10c-2-2.2-4.5-2.5-4.5 0S10 12 12 10c2 2.2 4.5 2.5 4.5 0S14 7.8 12 10z" strokeLinecap="round" strokeLinejoin="round" />
      </SvgIcon>
    ),
  },
};

const ALL_PRODUCTS_VISUAL = {
  bg: "#e7f7ee",
  icon: (
    <SvgIcon color="#1f9d55">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </SvgIcon>
  ),
};

const DEFAULT_VISUAL = {
  bg: "#f2f2f2",
  icon: (
    <SvgIcon color="#0e1e16">
      <circle cx="12" cy="12" r="8" />
    </SvgIcon>
  ),
};

/** Prefer design order when those categories exist in the catalog. */
const CATEGORY_ORDER = [
  "Apparel",
  "Bags",
  "Drinkware",
  "Office Supplies",
  "Stationery",
  "Technology",
  "Tech Accessories",
  "Work Essentials",
  "Accessories",
  "Merch",
  "Lifestyle",
  "Sustainable",
  "Kits",
  "Key Chains",
];

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

  const seen = new Set<string>();
  const orderedLabels = [
    ...CATEGORY_ORDER.filter((label) => counts.has(label)),
    ...Array.from(counts.keys())
      .filter((label) => !CATEGORY_ORDER.includes(label))
      .sort((a, b) => a.localeCompare(b)),
  ];

  for (const label of orderedLabels) {
    const count = counts.get(label) || 0;
    if (count <= 0 || seen.has(label)) continue;
    seen.add(label);
    const visual = CATEGORY_VISUALS[label] || DEFAULT_VISUAL;
    categories.push({
      key: label,
      label: visual.displayLabel || label,
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

function TrustIconShield() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z"
        stroke="#3b82f6"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.5 12l1.8 1.8L15 10" stroke="#3b82f6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrustIconStar() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 18.4l.9-5.4L4.2 9.2l5.4-.8L12 3.5z"
        stroke="#ea7a1a"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrustIconTruck() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <path
        d="M3 7h11v10H3V7zm11 3h4l3 3v4h-7v-7z"
        stroke="#3b82f6"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="18" r="1.6" stroke="#3b82f6" strokeWidth="1.7" />
      <circle cx="17" cy="18" r="1.6" stroke="#3b82f6" strokeWidth="1.7" />
    </svg>
  );
}

function TrustIconLeaf() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <path
        d="M5 14c4-1 7-4 8-9 4 6 2 12-2 14-3 1.5-6 0-6-5z"
        stroke="#16a34a"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 12c2 1 4 1.5 6 1" stroke="#16a34a" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const TRUST_ITEMS = [
  {
    key: "trusted",
    title: "Official & Trusted",
    subtitle: "100% authentic merchandise",
    bg: "#e8f0fe",
    icon: <TrustIconShield />,
  },
  {
    key: "loved",
    title: "Loved by teams",
    subtitle: "Quality products, great reviews",
    bg: "#fff1e0",
    icon: <TrustIconStar />,
  },
  {
    key: "fast",
    title: "Fast & reliable",
    subtitle: "Pan-India delivery",
    bg: "#e8f0fe",
    icon: <TrustIconTruck />,
  },
  {
    key: "sustainable",
    title: "A more sustainable tomorrow",
    subtitle: "Thoughtful, eco-friendly choices",
    bg: "#e7f7ee",
    icon: <TrustIconLeaf />,
  },
] as const;

function HomeSectionHead({
  title,
  subtitle,
  onViewAll,
  viewAllLabel = "View all",
}: {
  title: string;
  subtitle?: string;
  onViewAll: () => void;
  viewAllLabel?: string;
}) {
  return (
    <div className="sf-home-section-head">
      <div className="sf-home-section-copy">
        <h2 className="sf-home-section-title">{title}</h2>
        {subtitle ? <p className="sf-home-section-subtitle">{subtitle}</p> : null}
      </div>
      <button type="button" className="sf-home-view-all" onClick={onViewAll}>
        {viewAllLabel} <ArrowRightIcon />
      </button>
    </div>
  );
}

export function StoreHomePage({
  products,
  recommendedGrid,
  newArrivalsGrid,
  contentRef,
  bannerUrl,
  bannerAlt,
  onViewAllProducts,
  onBrowseCategory,
}: {
  products: HomeStoreProduct[];
  recommendedGrid: ReactNode;
  newArrivalsGrid: ReactNode;
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
                <HomeSectionHead
                  title="Shop by category"
                  onViewAll={onViewAllProducts}
                  viewAllLabel="View all categories"
                />
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

            {recommendedGrid ? (
              <section className="sf-home-rail" aria-label="Recommended for you">
                <HomeSectionHead
                  title="Recommended for you"
                  subtitle="Handpicked based on what your team loves"
                  onViewAll={onViewAllProducts}
                />
                {recommendedGrid}
              </section>
            ) : null}

            {newArrivalsGrid ? (
              <section className="sf-home-rail" aria-label="New arrivals">
                <HomeSectionHead
                  title="New arrivals"
                  subtitle="Be the first to explore our latest additions"
                  onViewAll={onViewAllProducts}
                />
                {newArrivalsGrid}
              </section>
            ) : null}

            <section className="sf-home-trust" aria-label="Why shop with us">
              <h2 className="sf-home-section-title">Why shop with us?</h2>
              <div className="sf-home-trust-row">
                {TRUST_ITEMS.map((item) => (
                  <div key={item.key} className="sf-home-trust-item">
                    <span className="sf-home-trust-icon" style={{ background: item.bg }}>
                      {item.icon}
                    </span>
                    <div className="sf-home-trust-copy">
                      <div className="sf-home-trust-title">{item.title}</div>
                      <div className="sf-home-trust-subtitle">{item.subtitle}</div>
                    </div>
                  </div>
                ))}
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
