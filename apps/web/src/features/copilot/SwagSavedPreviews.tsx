import { resolveMediaUrl } from "@/lib/mediaUrl";
import { useState } from "react";
import { ImageOff } from "lucide-react";

function PublishMockup({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="sm-swag-publish__image">
    {src && !failed ? <img src={src} alt={`Saved design for ${name}`} width={160} height={160} loading="lazy" onError={() => setFailed(true)} />
      : <span><ImageOff size={20} aria-hidden="true" />{failed ? 'Saved preview unavailable' : 'No saved customized preview'}</span>}
  </div>;
}

/** Existing persisted mockups only; this component never generates artwork. */
export function SwagSavedPreviews({ source, expanded = false, snapshot = false, inline = false, publish = false }: { source: Record<string, unknown>; expanded?: boolean; snapshot?: boolean; inline?: boolean; publish?: boolean }) {
  const designs = Array.isArray(source.designs) ? source.designs as Record<string, unknown>[] : [];
  const products = Array.isArray(source.products) ? source.products as Record<string, unknown>[] : [];
  const saved = designs.filter(design => typeof design?.mockupUrl === "string" && design.mockupUrl);
  if (publish) {
    const byProduct = new Map(saved.map(design => [design.productId, design.mockupUrl as string]));
    return products.length > 0 ? <div className="sm-swag-previews sm-swag-publish__gallery" aria-label="Product previews for publication">{products.map(product => {
      const name = String(product.name || 'Selected product');
      const src = resolveMediaUrl(byProduct.get(product.id));
      return <figure key={String(product.id)}><PublishMockup key={src} src={src} name={name} /><figcaption>{name}</figcaption></figure>;
    })}</div> : <p className="sm-swag-warning">Product previews are unavailable for this review.</p>;
  }
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
