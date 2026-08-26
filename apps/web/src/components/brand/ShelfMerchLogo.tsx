import { Link } from "react-router";

export const SHELF_MERCH_LOGO_DARK = "/images/logo/shelfmerch-wordmark.png";
export const SHELF_MERCH_LOGO_LIGHT = "/images/logo/shelfmerch-wordmark-white.png";
export const SHELF_MERCH_LOGO_ICON = "/images/logo/shelfmerch-logo-icon.svg";

type ShelfMerchLogoProps = {
  /** `dark` = dark wordmark on light backgrounds; `light` = light wordmark on dark backgrounds. */
  theme?: "dark" | "light";
  /** Full wordmark or icon mark only. */
  variant?: "full" | "icon";
  height?: number;
  className?: string;
  alt?: string;
  href?: string;
};

export function ShelfMerchLogo({
  theme = "dark",
  variant = "full",
  height = 32,
  className,
  alt = "Shelf Merch",
  href,
}: ShelfMerchLogoProps) {
  const src =
    variant === "icon"
      ? SHELF_MERCH_LOGO_ICON
      : theme === "light"
        ? SHELF_MERCH_LOGO_LIGHT
        : SHELF_MERCH_LOGO_DARK;

  const img = (
    <img
      src={src}
      alt={alt}
      height={height}
      className={className}
      style={{
        height,
        width: variant === "icon" ? height : "auto",
        maxWidth: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  );

  if (href) {
    return (
      <Link to={href} aria-label={alt} style={{ display: "inline-flex", lineHeight: 0 }}>
        {img}
      </Link>
    );
  }

  return img;
}
