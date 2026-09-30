function normalizePriceLabel(value: string): string {
  return value.replace(/[\u20B9\u20A8]/g, "₹").replace(/^₹\.?\s*/i, "₹");
}

function formatCardAmount(raw: string): string {
  const cleaned = String(raw).replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return raw.trim();
  return num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** Shared catalog-style price (Rs. amount in brand blue). */
export function CatalogPrice({
  price,
  basePriceInr,
  className,
  size = "card",
}: {
  price?: string;
  basePriceInr?: number;
  className?: string;
  size?: "card" | "detail";
}) {
  const label =
    basePriceInr && basePriceInr > 0
      ? `₹${Math.round(basePriceInr)}`
      : price?.trim() || "";
  if (!label) return null;

  const normalized = normalizePriceLabel(label);
  const parts = normalized.match(/^(.*?)(₹)\s?(.+)$/i);

  if (size === "detail") {
    return (
      <div className={className ? `catalog-pdp-price-block ${className}` : "catalog-pdp-price-block"}>
        <div className="catalog-pdp-price">
          {parts ? (
            <>
              {parts[1] ? <span className="catalog-pdp-price-prefix">{parts[1]}</span> : null}
              <span className="catalog-pdp-price-symbol">₹ </span>
              <span className="catalog-pdp-price-amount">{formatCardAmount(parts[3])}</span>
            </>
          ) : (
            normalized
          )}
        </div>
      </div>
    );
  }

  if (!parts) {
    return <div className={className ? `pr ${className}` : "pr"}>{normalized}</div>;
  }

  const prefix = parts[1]?.trim();
  const amount = formatCardAmount(parts[3]);

  return (
    <div className={className ? `pr ${className}` : "pr"}>
      {prefix ? <span className="pr-prefix">{prefix}</span> : null}
      <span className="pr-symbol">₹</span>
      <span className="pr-amount">{amount}</span>
    </div>
  );
}
