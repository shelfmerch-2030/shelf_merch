import { type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { formatStoreCardPrice, type ShopCurrencyMode } from "@/lib/storeCurrency";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";

type SampleProduct = {
  id: string;
  name: string;
  brand: string;
  basePriceInr: number;
  imageUrl: string;
  category: string;
};

/** Sample catalog used only in the create-shop home preview. */
const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    id: "jersey",
    name: "Performance Jersey",
    brand: "Shelf Merch",
    basePriceInr: 1499,
    imageUrl: "/images/shops/products/jersey.jpg",
    category: "Merch",
  },
  {
    id: "jacket",
    name: "Softshell Jacket",
    brand: "Shelf Merch",
    basePriceInr: 2499,
    imageUrl: "/images/shops/products/jacket.jpg",
    category: "Merch",
  },
  {
    id: "hat",
    name: "Structured Cap",
    brand: "Shelf Merch",
    basePriceInr: 699,
    imageUrl: "/images/shops/products/hat.jpg",
    category: "Merch",
  },
  {
    id: "hoodie",
    name: "Classic Pullover Hoodie",
    brand: "Shelf Merch",
    basePriceInr: 1899,
    imageUrl: "/images/shops/products/hoodie.jpg",
    category: "Merch",
  }
];

/**
 * Non-interactive storefront home preview for the create-shop builder.
 * Renders topbar → banner (children) → Featured Products → footer.
 */
export function ShopHomePreview({
  shopName,
  logoUrl,
  currency,
  banner,
}: {
  shopName: string;
  logoUrl?: string;
  currency: string;
  banner: ReactNode;
}) {
  const mode: ShopCurrencyMode = currency === "INR" ? "inr" : "points";
  const name = shopName.trim() || "Your shop name";
  const priceLabel = (inr: number) => formatStoreCardPrice(inr, mode);

  return (
    <div className="shop-builder-home-preview">
      <div className="shop-builder-preview-topbar" aria-hidden="true">
        <div className="shop-builder-preview-topbar-inner">
          <div className="shop-builder-preview-brand">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="shop-builder-preview-logo" />
            ) : null}
            <span className="shop-builder-preview-shop-name">{name}</span>
          </div>
          <span className="shop-builder-preview-vrule" />
          <div className="shop-builder-preview-powered">
            <span>Powered by</span>
            <ShelfMerchLogo height={18} />
          </div>
          <div className="shop-builder-preview-search">Search all products</div>
          <div className="shop-builder-preview-account">
            <span className="shop-builder-preview-avatar">PR</span>
            <span className="shop-builder-preview-account-copy">
              <span className="shop-builder-preview-account-name">Preview</span>
              <span className="shop-builder-preview-account-sub">{name.toLowerCase()}</span>
            </span>
          </div>
        </div>
      </div>

      {banner}

      <div className="sf-content shop-builder-preview-catalog">
        <div className="sf-section-header sf-section-header--stadium">
          <h2 className="sf-section-title sf-section-title--stadium">Featured Products</h2>
          <span className="sf-view-all">
            View all <ArrowRight size={14} />
          </span>
        </div>
        <div className="sf-product-grid sf-product-grid--stadium">
          {SAMPLE_PRODUCTS.map((p) => (
            <PreviewProductCard key={p.id} product={p} shopName={name} price={priceLabel(p.basePriceInr)} />
          ))}
        </div>
      </div>

      <div className="sf-footer">
        <div className="sf-footer-inner">
          <span className="sf-footer-powered">Powered by</span>
          <ShelfMerchLogo height={20} className="sf-footer-logo" />
          <span className="sf-footer-note"> · Recipients redeem from a private invite link.</span>
        </div>
      </div>
    </div>
  );
}

function PreviewProductCard({
  product,
  shopName,
  price,
}: {
  product: SampleProduct;
  shopName: string;
  price: string;
}) {
  return (
    <article className="sf-pcard sf-pcard--stadium">
      <div className="sf-pcard-media">
        <div className="sf-pcard-img sf-pcard-img--stadium">
          <img src={product.imageUrl} alt="" loading="lazy" decoding="async" />
        </div>
      </div>
      <div className="sf-pcard-meta sf-pcard-meta--stadium">
        <div className="sf-pcard-text">
          <div className="sf-pcard-brand">{(product.brand || shopName).toUpperCase()}</div>
          <div className="sf-pcard-name">{product.name}</div>
          <div className="sf-pcard-price">{price}</div>
        </div>
      </div>
    </article>
  );
}
