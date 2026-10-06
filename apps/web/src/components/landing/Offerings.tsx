import { useState } from "react";
import { Link } from "react-router";
import { ArrowIcon } from "./icons";
import { getOrderedCatalogItems } from "./catalog-data";

const CHIPS = [
  { label: "Shops", className: "chip chip-0" },
  { label: "Kits", className: "chip chip-1" },
  { label: "Wallet", className: "chip chip-2" },
  { label: "Milestones", className: "chip chip-3" },
  { label: "Recognition", className: "chip chip-4" },
  { label: "Bulk Orders", className: "chip chip-0" },
  { label: "Custom Merch", className: "chip chip-1" },
] as const;

const EXPLORE_PRIMARY = 4;

function ChipSet({ id }: { id: string }) {
  return (
    <div className="chip-set">
      {CHIPS.map((chip, index) => (
        <span key={`${id}-${chip.label}-${index}`} className={chip.className}>
          {chip.label} <b>↗</b>
        </span>
      ))}
    </div>
  );
}

function MobileExploreChips() {
  const [showMore, setShowMore] = useState(false);
  const items = getOrderedCatalogItems();
  const visible = showMore ? items : items.slice(0, EXPLORE_PRIMARY);

  return (
    <div className="explore-chips mobile-only" aria-label="Explore categories">
      <div className="explore-chips__scroller">
        {visible.map((item, index) => (
          <Link
            key={item.count}
            to={item.to}
            className={`chip chip-${index % 5}`}
          >
            {item.shortTitle} <b>↗</b>
          </Link>
        ))}
        {!showMore && items.length > EXPLORE_PRIMARY ? (
          <button
            type="button"
            className="chip chip-4 explore-chips__more"
            onClick={() => setShowMore(true)}
            aria-expanded={showMore}
          >
            More <b>↓</b>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Offerings() {
  return (
    <section className="section offerings" id="platform">
      <div className="section-heading centered">
        <span className="kicker desktop-only">OUR OFFERINGS</span>
        <span className="kicker mobile-only">EXPLORE RANGE</span>
        <h2>
          Everything your brand touches,
          <br />
          <em>in one place.</em>
        </h2>
        <p className="desktop-only">
          From your first employee&apos;s welcome kit to your thousandth client gift, keep every
          branded item consistent, on-budget and on time.
        </p>
        <p className="mobile-only">
          From day-to-day essentials to curated gifting kits, high-quality customizable products for
          every occasion.
        </p>
      </div>
      <div className="chip-marquee desktop-only">
        <div className="chip-track" aria-hidden="true">
          <div className="chip-group">
            <ChipSet id="a1" />
            <ChipSet id="a2" />
          </div>
          <div className="chip-group">
            <ChipSet id="b1" />
            <ChipSet id="b2" />
          </div>
        </div>
      </div>
      <MobileExploreChips />
      <div className="platform-bento">
        <article className="bento-shop">
          <div className="bento-copy">
            <span className="mini-label">COMPANY SHOP</span>
            <h3>
              Your brand.
              <br />
              Its own storefront.
            </h3>
            <p className="desktop-only">
              Launch a branded shop for employees, new hires, distributors or partners, without
              touching code.
            </p>
            <p className="mobile-only">
              Create a branded store with your logo, colors and domain.
            </p>
            <a href="#contact" className="text-link">
              <span className="desktop-only">Explore shops</span>
              <span className="mobile-only">Launch your store</span>
              <span>
                <ArrowIcon />
              </span>
            </a>
          </div>
          <div className="shop-ui">
            <div className="shop-top">
              <div className="mini-logo">A</div>
              <span>acme goods</span>
              <b>•••</b>
            </div>
            <div className="shop-banner">
              <small>TEAM ESSENTIALS</small>
              <strong>
                Built for
                <br />
                the everyday.
              </strong>
              <button type="button">Shop collection</button>
            </div>
            <div className="product-row">
              <div>
                <span className="mini-product shirt-product">T</span>
                <small>Core Tee</small>
              </div>
              <div>
                <span className="mini-product mug-product">⌁</span>
                <small>Travel Mug</small>
              </div>
              <div>
                <span className="mini-product cap-product">⌒</span>
                <small>Team Cap</small>
              </div>
            </div>
          </div>
        </article>
        <article className="bento-mini bento-kit">
          <span className="icon-tile">
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7l8-4 8 4-8 4-8-4z" />
              <path d="M4 7v10l8 4 8-4V7" />
              <path d="M12 11v10" />
            </svg>
          </span>
          <div>
            <span className="mini-label">KITS</span>
            <h3>
              Bundle it.
              <br />
              Ship it.
            </h3>
            <p>Curated kits for onboarding, events and leaders.</p>
          </div>
          <div className="kit-stack">
            <span />
            <span />
            <span />
          </div>
          <span className="bento-arrow mobile-only" aria-hidden="true">
            →
          </span>
        </article>
        <article className="bento-mini bento-wallet">
          <span className="icon-tile">
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6h14a2 2 0 012 2v10H4a2 2 0 01-2-2V6z" />
              <path d="M17 11h5v4h-5a2 2 0 010-4z" />
            </svg>
          </span>
          <div>
            <span className="mini-label">WALLET</span>
            <h3>
              Budgets without
              <br className="mobile-only" /> bottlenecks.
            </h3>
            <p>Load once. Let teams spend on approved merch.</p>
          </div>
          <div className="wallet-meter">
            <div>
              <span>₹72,400</span>
              <small>available balance</small>
            </div>
            <b>68%</b>
          </div>
          <span className="bento-arrow mobile-only" aria-hidden="true">
            →
          </span>
        </article>
      </div>
    </section>
  );
}
