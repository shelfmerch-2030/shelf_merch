import type { PlatformProductListItem } from "@/services/platform-api";

function csvCell(value: string | number | undefined) {
  let text = String(value ?? "");
  // Keep spreadsheet apps from interpreting product names or SKUs as formulas.
  if (typeof value === "string" && /^[\s\uFEFF]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function catalogCsv(products: PlatformProductListItem[]) {
  const rows = [
    [
      "Product ID",
      "Product",
      "SKU",
      "Status",
      "Selling price (INR)",
      "Cost price (INR)",
      "Margin (INR)",
      "Margin (%)",
      "Available stock",
      "Created at",
    ],
    ...products.map((product) => [
      product._id,
      product.name,
      product.sku,
      product.status,
      product.sellingPriceInr,
      product.costPriceInr,
      product.marginInr,
      product.marginPct,
      product.inventory?.available ?? 0,
      product.createdAt,
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCatalogCsv(products: PlatformProductListItem[]) {
  const blob = new Blob([catalogCsv(products)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shelfmerch-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the download before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
