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
  labeledViews = false,
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
  /** Show "Product views" heading + Front/Back labels under thumbs. */
  labeledViews?: boolean;
}) {
  const showThumbs = views.length > 1;

  function viewLabel(v: ProductViewKey): string {
    if (v === "front") return "Front";
    if (v === "back") return "Back";
    if (v === "left") return "Left";
    return "Right";
  }

  return (
    <div className={`sf-pdp-gallery${className ? ` ${className}` : ""}`} style={style}>
      {showThumbs ? (
        <div
          className={`sf-pdp-thumbs${labeledViews ? " sf-pdp-thumbs--labeled" : ""}`}
          role="tablist"
          aria-label="Product views"
        >
          {labeledViews ? <div className="sf-pdp-thumbs-heading">Product views</div> : null}
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={activeView === v}
              aria-label={`${viewLabel(v)} view`}
              className={`sf-pdp-thumb-btn${activeView === v ? " sf-pdp-thumb-btn--on" : ""}`}
              onClick={() => onChange(v)}
            >
              <div className="sf-pdp-thumb-mini">{renderThumb(v)}</div>
              {labeledViews ? <span className="sf-pdp-thumb-label">{viewLabel(v)}</span> : null}
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
