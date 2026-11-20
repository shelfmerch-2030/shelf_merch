import { useEffect, useRef, useState } from "react";
import { browseSwagCatalog } from "./swagApi";
import { Link } from "react-router";
import { ImageOff } from "lucide-react";
import { tenantPath } from "@/lib/workspaceSlug";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type {
  CopilotArtifact,
  CopilotConfirmationArtifact,
  CopilotDepartmentBudgetsArtifact,
  CopilotSuccessArtifact,
  CopilotWalletBalanceArtifact,
} from "./api";
import { CopilotConfirmationCard, CopilotWriteSuccess } from "./CopilotConfirmationCard";
import type { Curation } from "./curatorTypes";
import {
  CopilotDepartmentBudgetsCard,
  CopilotWalletBalanceCard,
} from "./CopilotBalanceCard";

function formatInr(value: unknown) {
  if (value == null || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function GiftingChatGroups({ curation }: { curation: Curation }) {
  const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
  return <>{curation.chat?.groups.map((group, index) => <section className="sm-copilot-gift-group" key={`${group.name}-${index}`} aria-label={group.name}>
    <span className="sm-copilot-gift-group__label">{group.kind === "combination" ? "AI-suggested catalog combination" : group.kind === "existing_kit" ? "Existing ShelfMerch kit" : "Individual catalog options"}</span>
    <h3>{group.name}</h3>
    {group.rationale ? <p>{group.rationale}</p> : null}
    <CopilotArtifacts artifacts={group.artifacts} />
    {group.subtotal != null ? <div className="sm-copilot-gift-group__cost">
      <strong>{group.completePrice ? group.kind === "existing_kit" ? "Stored kit item estimate" : "Item subtotal" : "Partial known item subtotal"}: {money(group.subtotal)} per employee</strong>
      {group.total != null && curation.brief.recipients ? <span>{money(group.total)} for {curation.brief.recipients} recipients</span> : null}
      {group.missingPrices ? <span>{group.missingPrices} {group.missingPrices === 1 ? "price needs" : "prices need"} confirmation; no complete total is available.</span> : null}
      {group.budgetDifference != null ? <span>{money(Math.abs(group.budgetDifference))} {group.budgetDifference >= 0 ? "under" : "over"} budget per employee</span> : null}
      <small>Catalog item estimate only. Packaging, branding, customisation and shipping are excluded.</small>
    </div> : null}
  </section>)}</>;
}

/** Kit MCP summaries expose `imageUrl`; older payloads used heroImage / imageUrls. */
function kitImageSrc(kit: Record<string, unknown>): string {
  const urls = Array.isArray(kit.imageUrls) ? (kit.imageUrls as unknown[]) : [];
  const raw = kit.imageUrl || kit.heroImage || kit.primaryImageUrl || urls[0] || "";
  return resolveMediaUrl(String(raw || "")) || "";
}

function productImageSrc(product: Record<string, unknown>): string {
  const urls = Array.isArray(product.imageUrls) ? (product.imageUrls as unknown[]) : [];
  const raw = product.primaryImageUrl || product.imageUrl || urls[0] || "";
  return resolveMediaUrl(String(raw || "")) || "";
}

function CardImage({ src, alt, emptyLabel }: { src: string; alt: string; emptyLabel: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <ImageOff size={22} aria-label={emptyLabel} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Customer-facing availability only — never exact stock counts. */
export function stockLabel(product: Record<string, unknown>) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) {
    if (product.inStock === true || product.available === true) return "In stock";
    if (product.inStock === false || product.available === false) return "Out of stock";
    return "Availability unknown";
  }
  let known = false;
  let available = false;
  for (const row of variants) {
    const n = Number((row as { stock?: number })?.stock);
    if (!Number.isFinite(n)) continue;
    known = true;
    if (n > 0) available = true;
  }
  if (!known) return "Availability unknown";
  return available ? "In stock" : "Out of stock";
}

function kitHref(kit: Record<string, unknown>) {
  const id = String(kit.id || "");
  if (!id) return undefined;
  if (kit.recommendation && (kit.curated || kit.type === "curated")) return tenantPath("/kits");
  // Workspace kits include status; platform curated summaries do not.
  if (kit.status) return tenantPath(`/kits/${encodeURIComponent(id)}`);
  if (Boolean(kit.curated) || kit.type === "curated") return tenantPath("/kits");
  return tenantPath(`/kits/${encodeURIComponent(id)}`);
}

export type SwagProductControls = { selectedIds: string[]; busy: boolean; onToggle: (id: string) => void };
export function CopilotArtifacts({
  artifacts,
  conversationId,
  onArtifactChange,
  swag,
  onSwagEdit,
}: {
  artifacts?: CopilotArtifact[];
  conversationId?: string | null;
  onArtifactChange?: (index: number, next: CopilotArtifact) => void;
  swag?: SwagProductControls;
  onSwagEdit?: () => void;
}) {
  const [visible, setVisible] = useState(6);
  const [extra, setExtra] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const key = `${conversationId}:${JSON.stringify((artifacts || []).filter(a => a.kind === 'product' || a.kind === 'catalog_page'))}`;
  const current = useRef(key); current.current = key;
  const moreLock = useRef(false);
  useEffect(() => { setVisible(6); setExtra([]); setPage(null); setPageCount(null); setCatalogError(null); }, [key]);
  if (!artifacts?.length) return null;
  const allProducts = [...artifacts.filter((row) => row.kind === "product"), ...extra.map(product => ({ kind: 'product' as const, product }))];
  const products = swag ? [...new Map(allProducts.map((row, index) => [String(row.product.id || `${row.product.name}-${index}`), row])).values()] : allProducts;
  const catalog = artifacts.find((a): a is Extract<CopilotArtifact, { kind: 'catalog_page' }> => a.kind === 'catalog_page')?.catalog;
  const canFetch = Boolean(catalog && (page ?? catalog.pagination.page) < (pageCount ?? catalog.pagination.totalPages) && conversationId);
  async function showMore() {
    if (visible < products.length) { setVisible(value => value + 6); return; }
    if (!catalog || !conversationId || moreLock.current) return;
    const requestKey = key;
    moreLock.current = true; setLoading(true); setCatalogError(null);
    try {
      const result = await browseSwagCatalog(conversationId, { ...catalog.query, limit: catalog.query.limit || catalog.pagination.limit || 10, page: (page ?? catalog.pagination.page) + 1 });
      if (current.current !== requestKey) return;
      setExtra(previous => [...new Map([...previous, ...result.items].map(item => [String(item.id), item])).values()]);
      setPage(result.pagination.page); setPageCount(result.pagination.totalPages); setVisible(value => value + 6);
    } catch (err) { if (current.current === requestKey) setCatalogError(err instanceof Error ? err.message : 'Could not load more products'); }
    finally { moreLock.current = false; setLoading(false); }
  }
  const kits = artifacts.filter((row) => row.kind === "kit");
  const wallets = artifacts.filter(
    (row): row is CopilotWalletBalanceArtifact => row.kind === "wallet_balance",
  );
  const hasWalletCards = wallets.length > 0;
  const departmentGroups = artifacts.filter(
    (row): row is CopilotDepartmentBudgetsArtifact => row.kind === "department_budgets",
  );
  const confirmations = artifacts
    .map((row, index) => ({ row, index }))
    .filter((entry): entry is { row: CopilotConfirmationArtifact; index: number } => entry.row.kind === "confirmation");
  const successes = artifacts.filter((row): row is CopilotSuccessArtifact => row.kind === "success");

  return (
    <div className="sm-copilot-products" aria-label="Results">
      {artifacts.filter((row): row is Extract<CopilotArtifact, { kind: "curation" }> => row.kind === "curation" && Boolean(row.curation.chat)).map((row, index) => <GiftingChatGroups key={`gifting-${index}`} curation={row.curation} />)}
      {confirmations.map(({ row, index }) => (
        <CopilotConfirmationCard
          key={row.confirmationId || index}
          artifact={row}
          onEditSwag={onSwagEdit}
          conversationId={conversationId}
          onChange={(next) => onArtifactChange?.(index, next)}
        />
      ))}
      {successes.map((row, index) => (
        <CopilotWriteSuccess key={`success-${index}`} artifact={row} />
      ))}
      {wallets.map((row, index) => (
        <CopilotWalletBalanceCard key={row.wallet?.id || `wallet-${index}`} artifact={row} />
      ))}
      {!hasWalletCards
        ? departmentGroups.map((row, index) => (
            <CopilotDepartmentBudgetsCard key={`departments-${index}`} artifact={row} />
          ))
        : null}
      {(swag ? products.slice(0, visible) : products).map((row) => {
        const product = row.product;
        const id = String(product.id || "");
        const name = String(product.name || "Product");
        const img = productImageSrc(product);
        const href = id ? tenantPath(`/catalog/${encodeURIComponent(id)}`) : undefined;
        const price = formatInr(product.sellingPriceInr);
        const body = (
          <>
            <div className="sm-copilot-product__img">
              <CardImage src={img} alt={name} emptyLabel="No product image available" />
            </div>
            <div className="sm-copilot-product__meta">
              <strong>{name}</strong>
              <span>{price ? `${price} incl. GST` : "Price on request"}</span>
              <span>{stockLabel(product)}</span>
              {product.recommendation && Array.isArray(product.variants) ? <span>{[...new Set(product.variants.flatMap((variant: { color?: string; size?: string }) => [variant.color, variant.size]).filter(Boolean))].slice(0, 6).join(" · ")}</span> : null}
              {href ? <span className="sm-copilot-product__link">View details ↗</span> : null}
            </div>
          </>
        );
        if (swag && id && href) return <div key={id} className="sm-copilot-product sm-copilot-product--selectable">
          <Link to={href} aria-label={`View ${name}`}>{body}</Link>
          <button type="button" className="sm-copilot-confirm__cancel" aria-label={`${swag.selectedIds.includes(id) ? 'Remove' : 'Select'} ${name}`}
            aria-pressed={swag.selectedIds.includes(id)} disabled={swag.busy} onClick={() => swag.onToggle(id)}>
            {swag.selectedIds.includes(id) ? '✓ Selected · Remove' : '+ Select'}
          </button>
        </div>;
        return href ? (
          <Link
            key={id || name}
            to={href}
            className="sm-copilot-product"
            aria-label={`View ${name}`}
          >
            {body}
          </Link>
        ) : (
          <div key={name} className="sm-copilot-product">
            {body}
          </div>
        );
      })}
      {swag && (visible < products.length || canFetch) ? <button type="button" className="sm-copilot-text-button sm-swag-full" disabled={loading || swag.busy} onClick={() => void showMore()}>{loading ? 'Loading products…' : 'Show More'}</button> : null}
      {swag && catalogError ? <p className="sm-copilot-attach-error sm-swag-full" role="alert">{catalogError}</p> : null}
      {kits.map((row, index) => {
        const kit = row.kit;
        const name = String(kit.name || "Kit");
        const img = kitImageSrc(kit);
        const curated = Boolean(kit.curated) || kit.type === "curated";
        const href = kitHref(kit);
        const price =
          kit.approxValueInr != null
            ? formatInr(kit.approxValueInr)
            : kit.priceInr != null
              ? formatInr(kit.priceInr)
              : "";
        const body = (
          <>
            <div className="sm-copilot-product__img">
              <CardImage src={img} alt={name} emptyLabel="No kit image available" />
            </div>
            <div className="sm-copilot-product__meta">
              <strong>{name}</strong>
              <span>{curated ? "Curated kit" : "Customized kit"}</span>
              {price ? <span>~{price}</span> : null}
              {kit.recommendation && ["In stock", "Out of stock", "Availability unknown"].includes(String(kit.availability)) ? <span>{String(kit.availability)}</span> : null}
              {kit.recommendation && Array.isArray(kit.products) ? <span>{kit.products.map((product: { name?: string; quantity?: number }) => `${product.name || "Item"}${product.quantity ? ` × ${product.quantity}` : ""}`).join(" · ")}</span> : null}
              {href ? <span className="sm-copilot-product__link">View details ↗</span> : null}
            </div>
          </>
        );
        return href ? (
          <Link
            key={`${name}-${index}`}
            to={href}
            className="sm-copilot-product"
            aria-label={`View ${name}`}
          >
            {body}
          </Link>
        ) : (
          <div key={`${name}-${index}`} className="sm-copilot-product">
            {body}
          </div>
        );
      })}
    </div>
  );
}
