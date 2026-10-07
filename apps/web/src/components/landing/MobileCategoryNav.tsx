import { useState } from "react";
import { Link } from "react-router";
import { getOrderedCatalogItems } from "./catalog-data";

const PRIMARY_COUNT = 5;

export function MobileCategoryNav() {
  const [showMore, setShowMore] = useState(false);
  const items = getOrderedCatalogItems();
  const visible = showMore ? items : items.slice(0, PRIMARY_COUNT);

  return (
    <nav className="mobile-category-nav" aria-label="Product categories">
      <div className="mobile-category-nav__scroller">
        {visible.map((item) => (
          <Link
            key={item.count}
            to={item.to}
            className="mobile-category-nav__item"
          >
            <span
              className="mobile-category-nav__icon"
              style={{ background: item.pastel }}
              aria-hidden="true"
            >
              {item.image ? (
                <img src={item.image} alt="" loading="lazy" />
              ) : null}
            </span>
            <span className="mobile-category-nav__label">{item.shortTitle}</span>
          </Link>
        ))}
        {!showMore && items.length > PRIMARY_COUNT ? (
          <button
            type="button"
            className="mobile-category-nav__item mobile-category-nav__more"
            onClick={() => setShowMore(true)}
            aria-expanded={showMore}
          >
            <span className="mobile-category-nav__icon mobile-category-nav__icon--more" aria-hidden="true">
              ···
            </span>
            <span className="mobile-category-nav__label">More</span>
          </button>
        ) : null}
      </div>
    </nav>
  );
}
