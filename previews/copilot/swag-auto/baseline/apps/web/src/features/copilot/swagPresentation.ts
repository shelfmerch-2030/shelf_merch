type Row = { label: string; value: string };
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];

export function swagRows(value: Record<string, unknown>): Row[] {
  const stores = records(value.stores);
  const products = records(value.products);
  const rows = [
    { label: "Collection", value: String(value.name || "Unavailable") },
    { label: "Products", value: products.length ? products.map(p => String(p.name)).join(", ") : String(value.productCount ?? "Unavailable") },
    { label: "Number of products", value: String(value.productCount ?? (products.length || "Unavailable")) },
    { label: "Artwork", value: String(value.artworkStatus || "Unavailable") },
    { label: "Stores", value: stores.length ? stores.map(s => `${s.name}${s.status === "draft" ? " (draft store)" : ""}`).join(", ") : "None · save only" },
    { label: "Visibility", value: String(value.visibility || (value.published === true ? "Collection listings active in selected stores" : "Saved only · not published")) },
  ];
  if (typeof value.variantPolicy === "string") rows.push({ label: "Variants", value: value.variantPolicy });
  for (const design of records(value.designs)) {
    const product = products.find(p => p.id === design.productId);
    const areas = records(design.placements).map(area => String(area.key || "Print area"));
    rows.push({ label: `${String(product?.name || "Product")} design`, value: design.mockupUrl
      ? `Saved preview${areas.length ? ` · ${areas.join(", ")}` : ""}` : "No saved product mockup" });
  }
  return rows;
}

export function swagPresentation(result: Record<string, unknown>) {
  const published = result.published === true;
  const stores = records(result.stores).map(store => String(store.name || "")).filter(Boolean);
  const verified = published && stores.length > 0 && result.status === "ready";
  return { title: verified ? "Swag collection published" : published ? "Publication needs review" : "Swag design saved",
    message: verified ? `Your ${String(result.name || "swag")} collection has been published to ${stores.join(", ")}.`
      : published ? "Publication details could not be verified. Check the recorded result."
        : `Your ${String(result.name || "swag")} design is saved for later. It has not been published.`,
    tone: published && !verified ? "pending" : "complete", rows: swagRows(result) };
}
