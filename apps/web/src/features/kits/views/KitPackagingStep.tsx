import { Box } from "lucide-react";
import { PREMIUM_BOX_PER_RECIP, SAMPLE_WRAP_PER_KIT } from "@/features/send/money";
import kitPackagingNone from "../../../../assets/kit-packaging-none.png";
import kitPackagingBox from "../../../../assets/kit-packaging-box.png";
import kitWrapping from "../../../../assets/kit-wrapping.png";

export type KitPackagingChoice = "none" | "box" | "wrap";

/** Kit packaging step — mailer, premium box, and/or wrapping. */
export function KitPackagingStep({
  kitName,
  packaging,
  onPackaging,
  stepBadge = "Step 4 of 5",
  boxPrice = PREMIUM_BOX_PER_RECIP,
  wrapPrice = SAMPLE_WRAP_PER_KIT,
  noneTitle = "No packaging",
  boxTitle = "Premium shipping box",
  wrapTitle = "With wrapping",
  noneDesc = "Items ship in standard protective mailers.",
  boxDesc = "Branded rigid box with crinkle-paper fill.",
  wrapDesc = "Sample ships in branded gift wrapping.",
  /** Default send-kit UI: none + box. Sample curated: wrap. Sample customised: all three. */
  options = "box",
  embedded = false,
}: {
  kitName: string;
  itemCount?: number;
  packaging: KitPackagingChoice;
  onPackaging: (pkg: KitPackagingChoice) => void;
  stepBadge?: string;
  boxPrice?: number;
  wrapPrice?: number;
  noneTitle?: string;
  boxTitle?: string;
  wrapTitle?: string;
  noneDesc?: string;
  boxDesc?: string;
  wrapDesc?: string;
  options?: "box" | "wrap" | "box-and-wrap";
  /** Hide wizard chrome so this can sit beside branding in another step. */
  embedded?: boolean;
}) {
  const showBox = options === "box" || options === "box-and-wrap";
  const showWrap = options === "wrap" || options === "box-and-wrap";

  const optionList = (
    <div className="kt-pkg-options">
      <PkgOption
        on={packaging === "none"}
        title={noneTitle}
        desc={noneDesc}
        price=""
        thumb={kitPackagingNone}
        onClick={() => onPackaging("none")}
      />
      {showBox ? (
        <PkgOption
          on={packaging === "box"}
          title={boxTitle}
          desc={boxDesc}
          price={`₹${boxPrice} / kit`}
          thumb={kitPackagingBox}
          onClick={() => onPackaging("box")}
        />
      ) : null}
      {showWrap ? (
        <PkgOption
          on={packaging === "wrap"}
          title={wrapTitle}
          desc={wrapDesc}
          price={`₹${wrapPrice} / kit`}
          thumb={kitWrapping}
          onClick={() => onPackaging("wrap")}
        />
      ) : null}
    </div>
  );

  if (embedded) {
    return <div className="kt-pkg-options-embed">{optionList}</div>;
  }

  return (
    <div className="kt-pkg-solo">
      <div className="card sw-name-main-card">
        <header className="sw-name-header">
          <div className="sw-name-title-row">
            <h1>Choose packaging</h1>
            <span className="tag tag-ready">{stepBadge}</span>
          </div>
          <p className="muted sw-name-lead">
            How should &ldquo;{kitName}&rdquo; arrive? Premium packaging is charged per kit —
            recipients see the unboxing experience you choose.
          </p>
        </header>

        <div className="sw-name-body">
          {optionList}

          <div className="sw-name-tips">
            <div className="row sw-name-tips-head">
              <Box size={15} /> Packaging at send time
            </div>
            <p className="kt-pkg-tip-copy">
              Packaging is charged per recipient at checkout. Premium packaging is selected by
              default — you can switch to free mailers anytime before paying.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PkgOption({
  on,
  title,
  desc,
  price,
  thumb,
  onClick,
}: {
  on: boolean;
  title: string;
  desc: string;
  price: string;
  thumb: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`kt-pkg-option ${on ? "on" : ""}`} onClick={onClick}>
      <div className="rd" />
      <div className="kt-pkg-option-thumb" aria-hidden>
        <img src={thumb} alt="" />
      </div>
      <div className="kt-pkg-option-copy">
        <h4>{title}</h4>
        <p>{desc}</p>
      </div>
      {price ? <b className="kt-pkg-option-price">{price}</b> : <span className="kt-pkg-option-price" />}
    </button>
  );
}
