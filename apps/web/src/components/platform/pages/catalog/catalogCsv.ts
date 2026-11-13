import type { PlatformProductListItem } from "@/services/platform-api";
import { downloadCsv, toCsv } from "@/lib/csv";

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
  return toCsv(rows);
}

export function downloadCatalogCsv(products: PlatformProductListItem[]) {
  downloadCsv(
    catalogCsv(products),
    `shelfmerch-catalog-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
