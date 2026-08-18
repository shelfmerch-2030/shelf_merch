import { useLocation } from "react-router";
import { ALL_PRODUCTS } from "../types";
import type { CatalogVm } from "../controllers/useCatalogController";
import { ProductCard } from "./ProductCard";
import { CategoryCarousel, type CategoryTile } from "./CategoryCarousel";
import { PartnerLogos } from "./PartnerLogos";
import { CatalogMarketingFooter } from "./CatalogMarketingFooter";
import "./catalog-view.css";
import catalogHeroImg from "../../../../assets/catalog_banner.png";
import catalogAllProductsImg from "../../../../assets/catalog_page.png";

const STYLE_CATEGORIES: CategoryTile[] = [
  {
    label: "Apparel",
    image: "/../../../../assets/catalog/apparel.png",
    imageAlt: "Branded hoodie",
    category: "Apparel",
  },
  {
    label: "Drinkware",
    image: "/../../../../assets/catalog/drinkware.png",
    imageAlt: "Insulated tumbler",
    category: "Drinkware",
  },
  {
    label: "Bags",
    image: "/../../../../assets/catalog/bags.webp",
    imageAlt: "Tote bag",
    category: "Bags",
  },
  {
    label: "Office Supplies",
    image: "/../../../../assets/catalog/office.png",
    imageAlt: "Notebook and pen",
    category: "Office Supplies",
  },
  {
    label: "Technology",
    image: "/../../../../assets/catalog/technology.png",
    imageAlt: "Tech accessories",
    category: "Technology",
  },
  // {
  //   label: "Events & Tradeshows",
  //   image: "/images/landing/catalog/festival-hampers.png",
  //   imageAlt: "Event merch hamper",
  // },
  {
    label: "Accessories",
    image: "/images/shops/products/hat.jpg",
    imageAlt: "Branded cap",
    category: "Accessories",
  },
  // {
  //   label: "Festival Hampers",
  //   image: "/images/landing/catalog/ready-to-order.png",
  //   imageAlt: "Ready-to-order gift set",
  // },
  {
    label: "Key Chains",
    image: "/../../../../assets/catalog/key-chains.webp",
    imageAlt: "Key chains",
    category: "Key Chains",
  },
  {
    label: "Card Holders",
    image: "/../../../../assets/catalog/card-holders.webp",
    imageAlt: "Card holders",
    category: "Card Holders",
  }
];

const INDUSTRY_CATEGORIES: CategoryTile[] = [
  {
    label: "Healthcare",
    image: "/images/landing/categories/wellness.png",
    imageAlt: "Healthcare merch",
  },
  {
    label: "Education",
    image: "/images/shops/products/jersey.jpg",
    imageAlt: "Campus apparel",
  },
  {
    label: "Food & Beverages",
    image: "/images/shops/products/bottle.jpg",
    imageAlt: "Food and beverage merch",
  },
  {
    label: "IT & Technology",
    image: "/images/shops/products/sleeve.jpg",
    imageAlt: "Tech accessories",
    category: "Technology",
  },
  {
    label: "Construction",
    image: "/images/shops/products/jacket.jpg",
    imageAlt: "Workwear merch",
    category: "Apparel",
  },
  {
    label: "Health & Wellness",
    image: "/images/landing/categories/luxury.png",
    imageAlt: "Wellness products",
  },
  {
    label: "Sales & Marketing",
    image: "/images/landing/catalog/bags-travel.png",
    imageAlt: "Sales team merch",
    category: "Bags",
  },
  {
    label: "Events",
    image: "/images/landing/categories/experiences.png",
    imageAlt: "Event merch",
  },
];

function CatalogSkeleton() {
  return (
    <div className="sm-skeleton-grid" aria-busy="true" aria-label="Loading products">
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

function scrollToProducts() {
  document.getElementById("catalog-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Catalog landing: category carousels, partner logos, product grid. */
export function CatalogView(vm: CatalogVm) {
  const { pathname } = useLocation();
  const isPublic = pathname.startsWith("/apps/catalog");
  const productBase = isPublic ? "/apps/catalog" : "/app/catalog";

  const showNoCategoryPlaceholder = vm.category === ALL_PRODUCTS && !vm.isCategorySelected;

  function selectCategory(next = ALL_PRODUCTS) {
    vm.onCategory(next);
    scrollToProducts();
  }

  return (
    <div className={isPublic ? "sm-cat sm-cat--public" : "sm-cat"}>

      {/* <section className="sm-cat-section sm-cat-section--hero" aria-labelledby="sm-cat-hero-title"> */}
        {/* <div className="sm-cat-container"> */}
          <img src={catalogHeroImg} alt="Catalog hero" />
        {/* </div> */}
      {/* </section> */}

      <section className="sm-cat-section" aria-labelledby="sm-cat-style-title">
        <CategoryCarousel
          title="Choose your style. Make it yours."
          titleId="sm-cat-style-title"
          viewAllLabel="View all categories"
          items={STYLE_CATEGORIES}
          onViewAll={() => selectCategory(ALL_PRODUCTS)}
          onSelect={(item) => selectCategory(item.category ?? ALL_PRODUCTS)}
        />
      </section>

      {/* <PartnerLogos /> */}

      {/* <section className="sm-cat-section sm-cat-section--industry" aria-labelledby="sm-cat-industry-title">
        <CategoryCarousel
          title="Swag for every industry"
          titleId="sm-cat-industry-title"
          viewAllLabel="View all"
          items={INDUSTRY_CATEGORIES}
          onViewAll={() => selectCategory(ALL_PRODUCTS)}
          onSelect={(item) => selectCategory(item.category ?? ALL_PRODUCTS)}
        />
      </section> */}

      <section className="sm-cat-products" id="catalog-products" aria-labelledby="sm-cat-products-title">
        {/* <div className="sm-cat-container"> */}
          {showNoCategoryPlaceholder ? (
            // <h2 className="sm-cat-title sm-cat-title--overview" id="sm-cat-products-title">
              <img
                className="sm-cat-all-products-img"
                src={catalogAllProductsImg}
                alt="Catalog overview"
              />
            // </h2>
          ) : (
            <div className="sm-cat-products-head">
              <h2 className="sm-cat-title" id="sm-cat-products-title">
                {vm.category}
              </h2>
              <p className="sm-cat-products-meta">{vm.count} products ready to brand and ship</p>
            </div>
          )}

          {vm.isSkeleton ? (
            <CatalogSkeleton />
          ) : vm.errorMessage ? (
            <div className="card sm-cat-error">{vm.errorMessage}</div>
          ) : vm.items.length === 0 ? (
            showNoCategoryPlaceholder ? null : (
              <div className="card empty sm-cat-empty">
                <h3>No products in this category</h3>
                <p className="muted">Try another category.</p>
              </div>
            )
          ) : (
            <div className="sm-cat-grid">
              {vm.items.map((p, index) => (
                <ProductCard
                  key={p.id ?? `${p.nm}-${index}`}
                  product={p}
                  to={p.id ? `${productBase}/${p.id}` : undefined}
                />
              ))}
            </div>
          )}
        {/* </div> */}
      </section>

      {/* <PartnerLogos /> */}

      {isPublic ? <CatalogMarketingFooter onViewCatalog={scrollToProducts} /> : null}
    </div>
  );
}
