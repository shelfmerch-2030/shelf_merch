import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ALL_PRODUCTS } from "../types";
import type { CatalogVm } from "../controllers/useCatalogController";
import { ProductCard } from "./ProductCard";
import { CategoryCarousel, type CategoryTile } from "./CategoryCarousel";
import { CatalogMarketingFooter } from "./CatalogMarketingFooter";
import "./catalog-view.css";
import catalogHeroImg from "../../../../assets/catalog_banner.png";
import apparelImg from "../../../../assets/catalog/apparel-shelfmerch.png";
import bagsImg from "../../../../assets/catalog/bags-shelfmerch.png";
import drinkwareImg from "../../../../assets/catalog/drinkware-shelfmerch.png";
import keyChainsImg from "../../../../assets/catalog/key-chains.webp";
import officeImg from "../../../../assets/catalog/office-supplies-shelfmerch.png";
import technologyImg from "../../../../assets/catalog/technology-shelfmerch.png";
import overviewCorporateGiftsImg from "../../../../assets/catalog-overview/corporate-gifts.png";
import overviewSustainableImg from "../../../../assets/catalog-overview/sustainability-new.png";
import overviewBuiltForImpactImg from "../../../../assets/catalog-overview/bag-generated.png";
import overviewGlobalReachImg from "../../../../assets/catalog-overview/global-reach.png";
import amazonLogoImg from "../../../../assets/catalog-brands/amazon.png";
import datadogLogoImg from "../../../../assets/catalog-brands/datadog.svg";
import informaticaLogoImg from "../../../../assets/catalog-brands/informatica.svg";
import apolloLogoImg from "../../../../assets/catalog-brands/apollo.svg";
import styleDrinkwareImg from "../../../../assets/catalog-style-spotlight/drinkware.png";
import styleToteImg from "../../../../assets/catalog-style-spotlight/tote.png";
import styleNotebookImg from "../../../../assets/catalog-style-spotlight/notebook.png";
import styleKitsImg from "../../../../assets/catalog-style-spotlight/kits.png";
import styleGiveawaysImg from "../../../../assets/catalog-style-spotlight/giveaways.png";
import styleSocksImg from "../../../../assets/catalog-style-spotlight/socks.png";
import dtfImg from "../../../../assets/catalog-print-methods/dtf.png";
import sublimationImg from "../../../../assets/catalog-print-methods/sublimation.png";
import laserEngravingImg from "../../../../assets/catalog-print-methods/laser-engraving.png";
import uvDtfStickerImg from "../../../../assets/catalog-print-methods/uv-dtf-sticker.png";

const STYLE_SPOTLIGHT_TSHIRT = "/images/catalog/style-spotlight/tshirt.png";
const STYLE_SPOTLIGHT_NOTEBOOK = "/images/catalog/style-spotlight/notebook.png";
const STYLE_SPOTLIGHT_BOTTLE = "/images/catalog/style-spotlight/bottle.png";

const STYLE_SPOTLIGHT_WORDS = [
  { label: "Style", className: "sm-style-spotlight__copy--style" },
  { label: "Fit", className: "sm-style-spotlight__copy--fit" },
  { label: "Occasion", className: "sm-style-spotlight__copy--occasion" },
];

const TEAM_LOGOS = [
  { name: "Google", mark: ["G", "o", "o", "g", "l", "e"], className: "sm-cat-team-logo--google" },
  { name: "JPMorgan", mark: "JPMorgan", className: "sm-cat-team-logo--jpmorgan" },
  { name: "Datadog", mark: "datadog", className: "sm-cat-team-logo--datadog" },
  { name: "Amazon", mark: "amazon", className: "sm-cat-team-logo--amazon" },
  { name: "Informatica", mark: "Informatica", className: "sm-cat-team-logo--informatica" },
  { name: "Apollo", mark: "APOLLO", className: "sm-cat-team-logo--apollo" },
];

const STYLE_CATEGORIES: CategoryTile[] = [
  {
    label: "Apparel",
    image: apparelImg,
    imageAlt: "Branded hoodie",
    category: "Apparel",
  },
  {
    label: "Drinkware",
    image: drinkwareImg,
    imageAlt: "Insulated tumbler",
    category: "Drinkware",
  },
  {
    label: "Bags",
    image: bagsImg,
    imageAlt: "Tote bag",
    category: "Bags",
  },
  {
    label: "Office Supplies",
    image: officeImg,
    imageAlt: "Notebook and pen",
    category: "Office Supplies",
  },
  {
    label: "Technology",
    image: technologyImg,
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
    image: keyChainsImg,
    imageAlt: "Branded accessories",
    category: "Accessories",
  },
  // {
  //   label: "Festival Hampers",
  //   image: "/images/landing/catalog/ready-to-order.png",
  //   imageAlt: "Ready-to-order gift set",
  // },
];

const PRINT_TYPES = [
  {
    label: "DTF",
    description: "Full-color transfers on cotton and blends, with a soft hand-feel.",
    image: dtfImg,
    imageAlt: "DTF print transfer on apparel",
  },
  {
    label: "Sublimation",
    description: "Vibrant, all-over prints that dye into polyester and coated surfaces.",
    image: sublimationImg,
    imageAlt: "Sublimation printed bottle and mug",
  },
  {
    label: "Laser Engraving",
    description: "Permanent marks on metal, wood, and hard goods. No ink, no fade.",
    image: laserEngravingImg,
    imageAlt: "Laser engraving on wood and metal products",
  },
  {
    label: "UV DTF sticker",
    description: "Durable, high-detail stickers for bottles, tech, and hard surfaces.",
    image: uvDtfStickerImg,
    imageAlt: "UV DTF sticker application on bottle",
  },
] as const;

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

function StyleSpotlight({ onSelect }: { onSelect: (category: string) => void }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const activeWord = STYLE_SPOTLIGHT_WORDS[activeWordIndex];

  useEffect(() => {
    function updateActiveWord() {
      const section = sectionRef.current;

      if (!section) {
        return;
      }

      const rect = section.getBoundingClientRect();
      const scrollableDistance = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / scrollableDistance));
      const nextIndex = Math.min(
        STYLE_SPOTLIGHT_WORDS.length - 1,
        Math.floor(progress * STYLE_SPOTLIGHT_WORDS.length),
      );

      setActiveWordIndex(nextIndex);
    }

    updateActiveWord();
    window.addEventListener("scroll", updateActiveWord, { passive: true });
    window.addEventListener("resize", updateActiveWord);

    return () => {
      window.removeEventListener("scroll", updateActiveWord);
      window.removeEventListener("resize", updateActiveWord);
    };
  }, []);

  return (
    <section ref={sectionRef} className="sm-style-spotlight" aria-labelledby="sm-style-spotlight-title">
      <div className="sm-cat-container sm-style-spotlight__inner">
        <div className="sm-style-spotlight__media">
          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--bottle"
            onClick={() => onSelect("Drinkware")}
            aria-label="Browse drinkware"
          >
            <img src={STYLE_SPOTLIGHT_BOTTLE} alt="" />
            <span className="sm-style-spotlight__pill">
              On-demand <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--tshirt"
            onClick={() => onSelect("Apparel")}
            aria-label="Browse t-shirts"
          >
            <img src={STYLE_SPOTLIGHT_TSHIRT} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              T-shirts <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--sustainable"
            onClick={() => onSelect("Office Supplies")}
            aria-label="Browse sustainable office supplies"
          >
            <img src={STYLE_SPOTLIGHT_NOTEBOOK} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Sustainable <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--drinkware"
            onClick={() => onSelect("Drinkware")}
            aria-label="Browse orange tumblers"
          >
            <img src={styleDrinkwareImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Drinkware <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--tote"
            onClick={() => onSelect("Bags")}
            aria-label="Browse tote bags"
          >
            <img src={styleToteImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Carry kits <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--kits"
            onClick={() => onSelect(ALL_PRODUCTS)}
            aria-label="Browse swag kits"
          >
            <img src={styleKitsImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Swag kits <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--notebook"
            onClick={() => onSelect("Office Supplies")}
            aria-label="Browse notebooks"
          >
            <img src={styleNotebookImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Desk goods <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--giveaways"
            onClick={() => onSelect("Accessories")}
            aria-label="Browse event giveaways"
          >
            <img src={styleGiveawaysImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Event giveaways <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>

          <button
            type="button"
            className="sm-style-spotlight__tile sm-style-spotlight__tile--socks"
            onClick={() => onSelect("Apparel")}
            aria-label="Browse sock packs"
          >
            <img src={styleSocksImg} alt="" />
            <span className="sm-style-spotlight__pill sm-style-spotlight__pill--bottom">
              Best under $25 <span><ArrowRight aria-hidden="true" /></span>
            </span>
          </button>
        </div>

        <div className={`sm-style-spotlight__copy ${activeWord.className}`}>
          <p className="sm-style-spotlight__kicker">Swag for everyone</p>
          <h2 id="sm-style-spotlight-title">
            Choose your
            <span className="sm-style-spotlight__word">{activeWord.label}</span>
            <span className="sm-style-spotlight__heading-rest">from the biggest swag collection</span>
          </h2>
          <p>
            Let your swag speak volumes with premium products from the world's greatest catalog.
          </p>
          <button type="button" className="sm-style-spotlight__cta" onClick={() => onSelect(ALL_PRODUCTS)}>
            Browse swag
          </button>
        </div>
      </div>
    </section>
  );
}

function CatalogOverviewMosaic({ onSelect }: { onSelect: (category?: string) => void }) {
  return (
    <div className="sm-cat-container">
      <div className="sm-cat-overview">
        <article className="sm-cat-overview__intro">
          <p>
            We lead with sustainability, obsess over quality, curate bold collections, and deliver
            globally so your brand shows up at its best, everywhere.
          </p>
          <button type="button" className="sm-cat-overview__button" onClick={() => onSelect(ALL_PRODUCTS)}>
            About us <ArrowUpRight aria-hidden="true" />
          </button>
        </article>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--wide"
          onClick={() => onSelect("Kits")}
        >
          <img src={overviewCorporateGiftsImg} alt="ShelfMerch corporate gifting products arranged as a branded kit" />
        </button>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--large"
          onClick={() => onSelect("Wellness")}
        >
          <img src={overviewSustainableImg} alt="Sustainability centric candle and packaging" />
        </button>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--medium"
          onClick={() => onSelect("Office Supplies")}
        >
          <img src={overviewBuiltForImpactImg} alt="Built for impact branded tote and pouch collection" />
        </button>

        <button
          type="button"
          className="sm-cat-overview__card sm-cat-overview__card--small"
          onClick={() => onSelect("Drinkware")}
        >
          <img src={overviewGlobalReachImg} alt="ShelfMerch global reach branded delivery box" />
        </button>
      </div>
    </div>
  );
}

function PrintingTypesSection() {
  return (
    <section className="sm-cat-print" aria-labelledby="sm-cat-print-title">
      <div className="sm-cat-container">
        <div className="sm-cat-head">
          <h2 className="sm-cat-title" id="sm-cat-print-title">
            Choose your print. Make it yours.
          </h2>
        </div>
        <div className="sm-cat-print-grid">
          {PRINT_TYPES.map((item) => (
            <article className="sm-cat-print-card" key={item.label}>
              <div className="sm-cat-print-card__media">
                <img src={item.image} alt={item.imageAlt} loading="lazy" />
              </div>
              <div className="sm-cat-print-card__body">
                <h3 className="sm-cat-print-card__title">{item.label}</h3>
                <p className="sm-cat-print-card__copy">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function LovedTeamsSection() {
  return (
    <section className="sm-cat-teams" aria-labelledby="sm-cat-teams-title">
      <div className="sm-cat-container">
        <div className="sm-cat-teams__inner">
          <div className="sm-cat-teams__copy">
            <p>For every possible occasion</p>
            <h2 id="sm-cat-teams-title">Loved by teams everywhere</h2>
          </div>
          <div className="sm-cat-teams__logos" aria-label="Teams using Shelf Merch">
            {TEAM_LOGOS.map((logo) => (
              <span className={`sm-cat-team-logo ${logo.className}`} key={logo.name}>
                {logo.name === "Amazon" ? (
                  <img className="sm-cat-team-logo__amazon-img" src={amazonLogoImg} alt="Amazon" />
                ) : logo.name === "Datadog" ? (
                  <img className="sm-cat-team-logo__datadog-img" src={datadogLogoImg} alt="Datadog" />
                ) : logo.name === "Informatica" ? (
                  <img className="sm-cat-team-logo__informatica-img" src={informaticaLogoImg} alt="Informatica" />
                ) : logo.name === "Apollo" ? (
                  <img className="sm-cat-team-logo__apollo-img" src={apolloLogoImg} alt="Apollo" />
                ) : Array.isArray(logo.mark)
                  ? logo.mark.map((letter, index) => (
                      <span aria-hidden="true" key={`${letter}-${index}`}>
                        {letter}
                      </span>
                    ))
                  : logo.mark}
                {Array.isArray(logo.mark) ? <span className="sr-only">{logo.name}</span> : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Catalog landing: category carousels, partner logos, product grid. */
export function CatalogView(vm: CatalogVm) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isPublic = pathname.startsWith("/apps/catalog");
  const productBase = isPublic ? "/apps/catalog" : "/app/catalog";

  const showNoCategoryPlaceholder = vm.category === ALL_PRODUCTS && !vm.isCategorySelected;

  function selectCategory(next = ALL_PRODUCTS) {
    vm.onCategory(next);
    scrollToProducts();
  }

  return (
    <div className={isPublic ? "sm-cat sm-cat--public" : "sm-cat"}>

      <section className="sm-cat-hero-banner" aria-label="Catalog hero">
        <img src={catalogHeroImg} alt="" />
        <button
          type="button"
          className="sm-cat-hero-banner__hotspot sm-cat-hero-banner__hotspot--catalog"
          onClick={() => selectCategory(ALL_PRODUCTS)}
          aria-label="View catalog"
        />
        <button
          type="button"
          className="sm-cat-hero-banner__hotspot sm-cat-hero-banner__hotspot--demo"
          onClick={() => navigate("/request-demo")}
          aria-label="Book a demo"
        />
      </section>

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

      <LovedTeamsSection />

      <StyleSpotlight onSelect={selectCategory} />

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

      <section
        className={showNoCategoryPlaceholder ? "sm-cat-products sm-cat-products--overview" : "sm-cat-products"}
        id="catalog-products"
        aria-labelledby="sm-cat-products-title"
      >
        {/* <div className="sm-cat-container"> */}
          {showNoCategoryPlaceholder ? (
            <CatalogOverviewMosaic onSelect={selectCategory} />
          ) : (
            <div className="sm-cat-products-head">
              <h2 className="sm-cat-title" id="sm-cat-products-title">
                {vm.category}
              </h2>
              <p className="sm-cat-products-meta">{vm.count} products ready to brand and ship</p>
            </div>
          )}

          {/* {vm.isSkeleton ? (
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
          )} */}
        {/* </div> */}
      </section>

      {isPublic ? <CatalogMarketingFooter onViewCatalog={scrollToProducts} /> : null}
    </div>
  );
}
