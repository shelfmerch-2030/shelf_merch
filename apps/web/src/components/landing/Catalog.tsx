import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowIcon } from "./icons";

type CatalogItem = {
  count: string;
  className: string;
  icon: ReactNode;
  title: string;
  iconSize: number;
  image?: string;
  imageAlt?: string;
  to: string;
};

const CATALOG_ITEMS: CatalogItem[] = [
  {
    count: "01",
    className: "catalog-card catalog-blue",
    image: "/images/landing/catalog/apparel.png",
    imageAlt: "Customizable white polo shirt",
    icon: <path d="M8 4l4 2 4-2 5 3-3 5-2-1v10H8V11l-2 1-3-5 5-3z" />,
    title: "Apparel",
    iconSize: 32,
    to: "/apps/catalog?category=Apparel",
  },
  {
    count: "02",
    className: "catalog-card catalog-coral",
    image: "/images/landing/catalog/drinkware.png",
    imageAlt: "Insulated water bottle",
    icon: (
      <>
        <path d="M3 9h18v12H3z" />
        <path d="M2 5h20v4H2z" />
        <path d="M12 5v16" />
        <path d="M12 5c-1-4-6-4-6-1s4 2 6 1zm0 0c1-4 6-4 6-1s-4 2-6 1z" />
      </>
    ),
    title: "Drinkware",
    iconSize: 32,
    to: "/apps/catalog?category=Drinkware",
  },
  {
    count: "03",
    className: "catalog-card catalog-mint",
    image: "/images/landing/catalog/tech.png",
    imageAlt: "Wireless charging station",
    icon: (
      <>
        <path d="M8 3v6M16 3v6" />
        <path d="M6 9h12v2a6 6 0 01-12 0V9z" />
        <path d="M12 17v4" />
      </>
    ),
    title: "Tech Accessories",
    iconSize: 32,
    to: "/apps/catalog?category=Technology",
  },
  {
    count: "04",
    className: "catalog-card catalog-lilac",
    image: "/images/landing/catalog/bags-travel.png",
    imageAlt: "Laptop bag for travel",
    icon: (
      <>
        <path d="M4 7l8-4 8 4-8 4-8-4z" />
        <path d="M4 7v10l8 4 8-4V7" />
        <path d="M12 11v10" />
      </>
    ),
    title: "Bags & Travel",
    iconSize: 32,
    to: "/apps/catalog?category=Bags",
  },
  {
    count: "05",
    className: "catalog-card catalog-black",
    icon: (
      <>
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
        <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
      </>
    ),
    title: "Leadership Gifts",
    iconSize: 52,
    to: "/apps/catalog",
  },
  {
    count: "06",
    className: "catalog-card catalog-yellow",
    image: "/images/landing/catalog/stationery.png",
    imageAlt: "Notebook and pen stationery set",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 10h18" />
        <path d="M8 15l2 2 5-5" />
      </>
    ),
    title: "Office Supplies",
    iconSize: 32,
    to: "/apps/catalog?category=Office%20Supplies",
  },
  {
    count: "07",
    className: "catalog-card catalog-festive",
    image: "/images/landing/catalog/festival-hampers.png",
    imageAlt: "Festival puja hamper gift set",
    icon: (
      <>
        <path d="M3 9h18v12H3z" />
        <path d="M2 5h20v4H2z" />
        <path d="M12 5v16" />
        <path d="M12 5c-1-4-6-4-6-1s4 2 6 1zm0 0c1-4 6-4 6-1s-4 2-6 1z" />
      </>
    ),
    title: "Festival Hampers",
    iconSize: 32,
    to: "/apps/catalog",
  },
  {
    count: "08",
    className: "catalog-card catalog-outline",
    image: "/images/landing/catalog/ready-to-order.png",
    imageAlt: "Ready-to-order notebook and pen gift set",
    icon: (
      <>
        <path d="M4 10v10h16V10" />
        <path d="M3 10l2-6h14l2 6" />
        <path d="M8 20v-6h8v6" />
        <path d="M3 10c0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0" />
      </>
    ),
    title: "Made-to-Order",
    iconSize: 32,
    to: "/apps/catalog",
  },
];

function CatalogArrow() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Catalog() {
  return (
    <section className="section catalog-section" id="catalog">
      <div className="split-heading">
        <div>
          <span className="kicker">SOMETHING FOR EVERYONE</span>
          <h2>
            One catalog.
            <br />
            <em>Every occasion.</em>
          </h2>
        </div>
        <div>
          <p>From apparel to tech accessories, explore what you can put your logo on.</p>
          <Link to="/apps/catalog" className="text-link">
            View full catalog
            <span>
              <ArrowIcon />
            </span>
          </Link>
        </div>
      </div>
      <div className="catalog-grid">
        {CATALOG_ITEMS.map((item) => (
          <Link
            key={item.count}
            to={item.to}
            className={`${item.className}${item.image ? " has-image" : ""}`}
          >
            {item.image ? (
              <img className="catalog-photo" src={item.image} alt={item.imageAlt ?? item.title} />
            ) : null}
            <span className="catalog-count">{item.count}</span>
            <div className="catalog-icon">
              <svg
                aria-hidden="true"
                width={item.iconSize}
                height={item.iconSize}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {item.icon}
              </svg>
            </div>
            <h3>{item.title}</h3>
            <span className="round-arrow">{item.image ? <CatalogArrow /> : "↗"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
