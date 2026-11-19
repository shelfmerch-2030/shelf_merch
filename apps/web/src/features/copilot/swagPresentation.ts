type Row = { label: string; value: string };
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];

export function swagPublishFacts(value: Record<string, unknown>) {
  const products = records(value.products);
  const stores = records(value.stores).filter(store => typeof store.name === 'string' && store.name.trim());
  const count = typeof value.productCount === 'number' ? value.productCount : products.length;
  return { name: String(value.name || 'your collection'), stores, destination: stores.map(store => store.name).join(', '),
    productLabel: `${count} product${count === 1 ? '' : 's'}` };
}

export function isVerifiedSwagPublication(result: Record<string, unknown> | undefined) {
  return result?.action === 'publish' && result.published === true && result.status === 'ready'
    && swagPublishFacts(result).stores.length > 0;
}

export function swagArtworkCompletion(result: Record<string, unknown>) {
  const application = result.application as Record<string, unknown> | undefined;
  const applied = new Set(records(application?.targets).flatMap(target => typeof target.productId === 'string' && target.productId ? [target.productId] : [])).size;
  const total = result.productCount;
  if (!applied || (typeof total === 'number' && applied > total)) return 'Artwork application completed.';
  if (typeof total === 'number' && total > applied) return `Your logo has been applied to ${applied} of ${total} products. Other products are unchanged.`;
  return `Your logo has been applied to ${applied} product${applied === 1 ? '' : 's'}.`;
}

export function swagArtworkCompletionWarnings(result: Record<string, unknown>) {
  const application = result.application as Record<string, unknown> | undefined;
  return records(application?.manual).flatMap(product => typeof product.name === 'string' && product.name.trim()
    && typeof product.reason === 'string' && product.reason.trim() ? [`${product.name} needs manual placement. ${product.reason}`] : []);
}

export function swagPublishWarnings(value: Record<string, unknown>) {
  const products = records(value.products);
  const inventory = products.flatMap(product => {
    if (product.eligible === false) return [`${product.name} is currently unavailable.`];
    const variants = records(product.variants);
    if (!variants.length || !variants.every(variant => typeof variant.stock === 'number' && Number.isFinite(variant.stock))) return [];
    const unavailable = variants.filter(variant => Number(variant.stock) <= 0).length;
    return unavailable === variants.length ? [`${product.name} is currently out of stock and may not be orderable.`]
      : unavailable ? [`Some options for ${product.name} are out of stock.`] : [];
  });
  return [...inventory, ...swagWarnings(value).filter(warning => !warning.startsWith('Draft stores remain draft.'))];
}

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
  const application = value.application as Record<string, unknown> | undefined;
  if (application) {
    rows.push({ label: "Apply logo", value: records(application.targets).map(target => `${target.name}: ${target.areaLabel}`).join(", ") || "None" });
    if (records(application.manual).length) rows.push({ label: "Not customized · manual design required", value: records(application.manual).map(product => String(product.name)).join(", ") });
    if (records(application.preserved).length) rows.push({ label: "Keep existing designs", value: records(application.preserved).map(product => String(product.name)).join(", ") });
    if (application.replace === true) rows.push({ label: "Replace existing artwork", value: "The entire saved design on each listed product, including other print areas, will be replaced" });
  }
  return rows;
}

export function swagPresentation(result: Record<string, unknown>) {
  if (result.action === 'apply') {
    const application = result.application as Record<string, unknown> | undefined;
    const count = records(application?.targets).length;
    return { title: "Your designs are ready", message: `I've applied your logo to ${count} product${count === 1 ? '' : 's'}. Here are the saved mockups.${records(application?.manual).length ? ' Products listed as manual were not customized.' : ''}`,
      tone: "complete", rows: swagRows(result) };
  }
  const published = result.published === true;
  const stores = records(result.stores).map(store => String(store.name || "")).filter(Boolean);
  const verified = published && stores.length > 0 && result.status === "ready";
  return { title: verified ? "Collection published" : published ? "Publication needs review" : "Design saved",
    message: verified ? `Your ${String(result.name || "swag")} collection has been published to ${stores.join(", ")}.`
      : published ? "Publication details could not be verified. Check the recorded result."
        : `Your ${String(result.name || "swag")} design is saved for later. It has not been published.`,
    tone: published && !verified ? "pending" : "complete", rows: swagRows(result) };
}

/** Decision-relevant facts stay visible; the full immutable receipt is expandable. */
export function swagCompactRows(value: Record<string, unknown>): Row[] {
  const application = value.application as Record<string, unknown> | undefined;
  if (value.action === 'apply') {
    const targets = records(application?.targets);
    return [
      { label: 'Artwork', value: String(value.artworkName || 'Uploaded company logo') },
      { label: 'Products', value: String(value.productCount ?? records(value.products).length) },
      { label: 'Application', value: application?.requestedAll === false && targets.length ? targets.map(target => target.name).join(', ')
        : targets.length === 2 && !records(application?.manual).length && !records(application?.preserved).length ? 'Both eligible products'
          : `${targets.length} eligible product${targets.length === 1 ? '' : 's'}` },
    ];
  }
  return [
    { label: 'Collection', value: String(value.name || 'Unavailable') },
    { label: 'Products', value: String(value.productCount ?? records(value.products).length) },
    ...(value.action === 'publish' || value.published === true ? [
      { label: 'Stores', value: records(value.stores).map(store => `${store.name}${store.status === 'draft' ? ' (draft store)' : ''}`).join(', ') || 'Unavailable' },
      { label: 'Artwork', value: String(value.artworkStatus || 'Unavailable')
        .replace('Saved design references (review product-specific previews)', 'Saved artwork · see previews') },
    ] : [{ label: 'Status', value: 'Draft' }]),
  ];
}

export function swagWarnings(value: Record<string, unknown>): string[] {
  const application = value.application as Record<string, unknown> | undefined;
  return [
    ...(records(value.stores).some(store => store.status === 'draft') ? ['Draft stores remain draft. Publishing this collection does not make those stores public.'] : []),
    ...(records(application?.manual).length ? [`Manual design required: ${records(application?.manual).map(p => p.name).join(', ')}. These products are not customized by this application.`] : []),
    ...(records(application?.preserved).length ? [`Existing designs kept: ${records(application?.preserved).map(p => p.name).join(', ')}.`] : []),
    ...(application?.replace === true ? ['The entire saved design on each listed product, including other print areas, will be replaced.'] : []),
    ...(value.action === 'save' && /upload|logo saved/i.test(String(value.artworkStatus)) ? ['Your logo is uploaded but hasn’t been applied yet.'] : []),
  ];
}
