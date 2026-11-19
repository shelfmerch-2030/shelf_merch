import { resolveMediaUrl } from "@/lib/mediaUrl";

/** Existing persisted mockups only; this component never generates artwork. */
export function SwagSavedPreviews({ source, expanded = false, snapshot = false, inline = false }: { source: Record<string, unknown>; expanded?: boolean; snapshot?: boolean; inline?: boolean }) {
  const designs = Array.isArray(source.designs) ? source.designs as Record<string, unknown>[] : [];
  const products = Array.isArray(source.products) ? source.products as Record<string, unknown>[] : [];
  const saved = designs.filter(design => typeof design?.mockupUrl === "string" && design.mockupUrl);
  if (!saved.length) return null;
  const gallery = <div className="sm-swag-previews" aria-label="Saved design previews">{saved.map(design => {
      const product = products.find(p => p.id === design.productId);
      return <figure key={String(design.productId)}>
        <img src={resolveMediaUrl(String(design.mockupUrl))} alt={`Saved design for ${String(product?.name || "selected product")}`} width={160} height={160} loading="lazy" />
        <figcaption>{String(product?.name || "Selected product")}</figcaption>
      </figure>;
    })}</div>;
  if (inline) return gallery;
  return <details className="sm-copilot-confirm__original" open={expanded}>
    <summary>Saved design previews</summary>
    {snapshot ? <p>Saved at completion of this operation. Later edits appear in your active design review.</p> : null}
    {gallery}
  </details>;
}
