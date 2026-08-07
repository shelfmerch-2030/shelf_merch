import type { CSSProperties, ReactNode } from "react";
import type { ProductViewKey } from "./mockup-bake";

/** Front/Back thumbnail strip + main stage (matches shop PDP gallery). */
export function MockupViewGallery({
  views,
  activeView,
  onChange,
  renderThumb,
  children,
  className,
  style,
  mediaClassName,
  mediaStyle,
}: {
  views: ProductViewKey[];
  activeView: ProductViewKey;
  onChange: (view: ProductViewKey) => void;
  renderThumb: (view: ProductViewKey) => ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  mediaClassName?: string;
  mediaStyle?: CSSProperties;
}) {
  const showThumbs = views.length > 1;

  return (
    <div className={`sf-pdp-gallery${className ? ` ${className}` : ""}`} style={style}>
      {showThumbs ? (
        <div className="sf-pdp-thumbs" role="tablist" aria-label="Product views">
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={activeView === v}
              aria-label={
                v === "front"
                  ? "Front view"
                  : v === "back"
                    ? "Back view"
                    : v === "left"
                      ? "Left side"
                      : "Right side"
              }
              className={`sf-pdp-thumb-btn${activeView === v ? " sf-pdp-thumb-btn--on" : ""}`}
              onClick={() => onChange(v)}
            >
              <div className="sf-pdp-thumb-mini">{renderThumb(v)}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={`sf-pdp-media${mediaClassName ? ` ${mediaClassName}` : ""}`}
        style={mediaStyle}
      >
        {children}
      </div>
    </div>
  );
}
