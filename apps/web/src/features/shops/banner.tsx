import type { CSSProperties } from "react";
import { MoreHorizontal } from "lucide-react";

/** Solid-colour banner themes (ported from the legacy BANNER_THEMES). */
export const BANNER_THEMES: Record<string, { bg: string; text: string; dots: boolean }> = {
  light: { bg: "var(--gray-50)", text: "var(--gray-900)", dots: false },
  brand: { bg: "linear-gradient(135deg, var(--blue-500), var(--blue-700))", text: "#fff", dots: true },
  dark: { bg: "var(--ink)", text: "var(--cream)", dots: true },
  blue: { bg: "linear-gradient(135deg, var(--blue-500), var(--blue-700))", text: "#fff", dots: true },
  purple: { bg: "linear-gradient(135deg, var(--navy-500), var(--navy-700))", text: "#fff", dots: true },
};

export const SHOP_BANNER_PRESETS: [string, string][] = [
  ["dia-de-los-muertos", "Feliz Dia de los Muertos"],
  ["happy-passover", "Happy Passover"],
  ["thats-a-wrap", "That's a Wrap!"],
  ["out-of-this-world", "Out of This World"],
  ["happy-summer", "Happy Summer"],
  ["snack-break", "Snack Break"],
  ["pizza-party", "Pizza Party"],
  ["happy-pride", "Happy Pride"],
  ["mothers-day", "Mother's Day"],
  ["handcrafted-haven", "Handcrafted Haven"],
  ["exceptional-leader", "Exceptional Leader"],
  ["stellar-performance", "Stellar Performance"],
  ["standing-ovation", "Standing Ovation"],
  ["surprise", "Surprise!"],
  ["welcome", "Welcome"],
  ["happy-birthday", "Happy Birthday"],
  ["happy-holi", "Happy Holi"],
  ["merry-christmas", "Merry Christmas"],
  ["we-did-it", "We Did It!"],
];

/** Recommended upload size for custom shop banners (matches storefront 4:1 frame). */
export const BANNER_IMAGE_DIMENSIONS = "960 × 240 px (4:1)";
export const BANNER_IMAGE_ACCEPT = /\.(png|webp|jpe?g)$/i;
export const BANNER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const BANNER_IMAGE_ACCEPT_ATTR =
  ".png,.webp,.jpeg,.jpg,image/png,image/webp,image/jpeg";

/** A banner source — either a saved shop or the in-flight wizard/editor state. */
export type BannerSource = {
  bannerTheme?: string;
  bannerPreset?: string;
  /** Custom uploaded banner (data URL or /uploads/… path). Takes priority over presets. */
  bannerImageUrl?: string;
  bannerConfig?:
    | { theme?: string; preset?: string; imageUrl?: string }
    | Record<string, unknown>;
  logoUrl?: string;
};

export function bannerThemeKey(src: BannerSource): string {
  const cfg = src.bannerConfig as { theme?: string } | undefined;
  return src.bannerTheme || cfg?.theme || "light";
}

export function bannerPresetKey(src: BannerSource): string {
  const cfg = src.bannerConfig as { preset?: string } | undefined;
  return src.bannerPreset || cfg?.preset || "";
}

export function bannerImageUrlKey(src: BannerSource): string {
  const cfg = src.bannerConfig as { imageUrl?: string } | undefined;
  return src.bannerImageUrl || cfg?.imageUrl || "";
}

/** Serialize a banner source into the `bannerConfig` the API expects. */
export function bannerConfigFromSource(src: BannerSource): Record<string, string> {
  const imageUrl = bannerImageUrlKey(src);
  const theme = bannerThemeKey(src) || "light";
  if (imageUrl) return { imageUrl, theme };
  const preset = bannerPresetKey(src);
  if (preset) return { preset, theme };
  return theme === "light" ? {} : { theme };
}

function gradientBase(bg: string): string {
  return bg.startsWith("linear-gradient") ? bg : `linear-gradient(${bg},${bg})`;
}

export function bannerBackgroundStyle(src: BannerSource): CSSProperties {
  return bannerStyle(src);
}

/** Display URL for an image banner (custom upload or library preset). */
export function bannerDisplayUrl(src: BannerSource): string {
  const custom = bannerImageUrlKey(src);
  if (custom) return custom;
  const preset = bannerPresetKey(src);
  return preset ? `/shop-banners/${preset}.png` : "";
}

function bannerStyle(src: BannerSource): CSSProperties {
  const imageUrl = bannerDisplayUrl(src);
  if (imageUrl) {
    return {
      backgroundImage: `url(${JSON.stringify(imageUrl)})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  const t = BANNER_THEMES[bannerThemeKey(src)] || BANNER_THEMES.light;
  if (t.dots) {
    return {
      backgroundImage: `radial-gradient(rgba(255,255,255,.18) 1.4px,transparent 1.4px),${gradientBase(t.bg)}`,
      backgroundSize: "14px 14px,auto",
    };
  }
  return { background: t.bg };
}

function bannerClasses(src: BannerSource): string {
  const t = BANNER_THEMES[bannerThemeKey(src)] || BANNER_THEMES.light;
  const hasImage = Boolean(bannerDisplayUrl(src));
  return `shopbanner${t.dots && !hasImage ? " shopbanner-merch" : ""}`;
}

export function validateBannerImageFile(file: File): string | null {
  if (!BANNER_IMAGE_ACCEPT.test(file.name)) {
    return "Use PNG, WEBP, or JPG";
  }
  if (file.size > BANNER_IMAGE_MAX_BYTES) {
    return "Maximum file size is 10 MB";
  }
  return null;
}

export function readBannerImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const error = validateBannerImageFile(file);
    if (error) {
      reject(new Error(error));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

/** Renders a shop banner with optional edit menu. Shop logo is shown in the header, not on the banner. */
export function ShopBanner({
  source,
  height = 96,
  aspect,
  radius = 0,
  onEdit,
}: {
  source: BannerSource;
  height?: number;
  /** When set (e.g. `"3 / 1"`), sizes by width and matches banner asset ratio so cover does not crop. */
  aspect?: string;
  radius?: number;
  /** @deprecated Logo is no longer overlaid on the banner. */
  logoSize?: number;
  /** @deprecated Logo is no longer overlaid on the banner. */
  layout?: "left" | "center";
  onEdit?: () => void;
}) {
  return (
    <div
      className={`${bannerClasses(source)}${aspect ? " shopbanner-aspect-fit" : ""}`}
      style={{
        ...(aspect
          ? { aspectRatio: aspect, height: "auto", width: "100%" }
          : { height }),
        borderRadius: radius,
        position: "relative",
        ...bannerStyle(source),
      }}
    >
      {onEdit && (
        <button
          type="button"
          className="shopbanner-menu"
          aria-label="Edit shop look"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
    </div>
  );
}
