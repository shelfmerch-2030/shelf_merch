import { useEffect, useRef, useState, type ReactNode } from "react";
import { browseSwagCatalog, type SwagCatalogQuery } from "./swagApi";
import { Link } from "react-router";
import { ImageOff, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCatalogProduct } from "@/features/catalog/model";
import { CatalogPrice } from "@/features/catalog/views/CatalogPrice";
import { CatalogProductCardContent, catalogProductCardClass } from "@/features/catalog/views/ProductCard";
import { tenantPath } from "@/lib/workspaceSlug";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { extractVariantColors } from "@/lib/variantColors";
import { sanitizeCopilotAssistantText } from "./sanitizeCopilotText";
import { replyRepeatsWalletBalance } from "./walletBalancePresentation";
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
  CopilotDepartmentBudgetsReply,
  CopilotWalletBalanceReply,
} from "./CopilotBalanceReply";

function formatInr(value: unknown) {
  if (value == null || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function GiftingChatGroups({ curation }: { curation: Curation }) {
  const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
  return <>{curation.chat?.groups.map((group, index) => {
    const firstArtifact = group.artifacts[0];
    const kit = group.kind === "existing_kit" && group.artifacts.length === 1 && firstArtifact?.kind === "kit"
      ? firstArtifact.kit : undefined;
    const cards = <CopilotArtifacts artifacts={group.artifacts} showProductAvailability />;
    return (
      <section className={`sm-copilot-gift-group${kit ? " sm-copilot-gift-group--kit" : ""}`} key={`${group.name}-${index}`} aria-label={group.name}>
        {kit ? cards : null}
        <span className="sm-copilot-gift-group__label">{group.kind === "combination" ? "AI-suggested catalog combination" : group.kind === "existing_kit" ? "Existing ShelfMerch kit" : "Individual catalog options"}</span>
        {!kit || group.name !== kit.name ? <h3>{group.name}</h3> : null}
        {group.rationale && (!kit || group.rationale !== "An existing ShelfMerch kit. Contents and stored price come from the kit READ service.")
          ? <p>{group.rationale}</p> : null}
        {!kit ? cards : null}
        {group.subtotal != null ? <div className="sm-copilot-gift-group__cost">
          <strong>{group.completePrice ? group.kind === "existing_kit" ? "Stored kit item estimate" : "Item subtotal" : "Partial known item subtotal"}: {money(group.subtotal)} per employee</strong>
          {group.total != null && curation.brief.recipients ? <span>{money(group.total)} for {curation.brief.recipients} recipients</span> : null}
          {group.missingPrices ? <span>{group.missingPrices} {group.missingPrices === 1 ? "price needs" : "prices need"} confirmation; no complete total is available.</span> : null}
          {group.budgetDifference != null ? <span>{money(Math.abs(group.budgetDifference))} {group.budgetDifference >= 0 ? "under" : "over"} budget per employee</span> : null}
          <small>Catalog item estimate only. Packaging, branding, customisation and shipping are excluded.</small>
        </div> : null}
      </section>
    );
  })}</>;
}

/** Kit MCP summaries expose `imageUrl`; older payloads used heroImage / imageUrls. */
function kitImageSrc(kit: Record<string, unknown>): string {
  const urls = Array.isArray(kit.imageUrls) ? (kit.imageUrls as unknown[]) : [];
  const raw = kit.imageUrl || kit.heroImage || kit.primaryImageUrl || urls[0] || "";
  return resolveMediaUrl(String(raw || "")) || "";
}

export function productImageSrc(product: Record<string, unknown>): string {
  const urls = Array.isArray(product.imageUrls) ? product.imageUrls : [];
  const gallery = Array.isArray(product.images) ? product.images : [];
  const raw = product.primaryImageUrl || product.imageUrl || urls[0] || gallery[0] || "";
  return resolveMediaUrl(String(raw || "")) || "";
}

export function CardImage({ src, alt, emptyLabel }: { src: string; alt: string; emptyLabel: string }) {
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

function CatalogCardBody({ product, name, showAvailability }: {
  product: Record<string, unknown>;
  name: string;
  showAvailability: boolean;
}) {
  const image = productImageSrc(product);
  const variants = Array.isArray(product.variants) ? product.variants.map(row => ({
    color: typeof row?.color === "string" ? row.color : undefined,
    colorHex: typeof row?.colorHex === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(row.colorHex) ? row.colorHex : undefined,
    size: typeof row?.size === "string" ? row.size.trim() : undefined,
  })) : [];
  const { colors, colorHexByName } = extractVariantColors(variants);
  const swatches = colors.filter(color => Object.hasOwn(colorHexByName, color)).slice(0, 5);
  const sizes = [...new Set(variants.map(row => row.size).filter(Boolean))];
  const price = formatInr(product.sellingPriceInr);
  const minimum = typeof product.moq === "number" && Number.isInteger(product.moq) && product.moq > 0 ? product.moq : undefined;
  const priceText = price ? `${price} incl. GST` : "Price on request";

  return <CatalogProductCardContent
    name={name}
    brand={typeof product.brand === "string" ? product.brand.trim() : undefined}
    minimum={minimum}
    showPriceLabel={Boolean(price)}
    price={price && !showAvailability ? <CatalogPrice price={price} /> : <div className="pr">{priceText}</div>}
    image={<>
      <CardImage key={image} src={image} alt={name} emptyLabel="No product image available" />
      {swatches.length ? <span className="sm-copilot-catalog-card__colors" role="img" aria-label={`Colors: ${colors.join(", ")}`} title={colors.join(", ")}>
        {swatches.map(color => <span key={color} aria-hidden="true" style={{ backgroundColor: colorHexByName[color] }} />)}
        {colors.length > swatches.length ? <small aria-hidden="true">+{colors.length - swatches.length}</small> : null}
      </span> : null}
    </>}
    note={showAvailability ? <div className="sm-copilot-catalog-card__note">
      <div>{stockLabel(product)}</div>
      {product.recommendation && sizes.length ? <div>{sizes.slice(0, 6).join(" · ")}</div> : null}
    </div> : null}
  />;
}

const copilotCatalogCardClass = `${catalogProductCardClass} sm-copilot-product--catalog`;

type CatalogPreview = { id: string; name: string; href: string; trigger: HTMLAnchorElement };

function CatalogProductPreview({ selection, onClose }: { selection: CatalogPreview; onClose: () => void }) {
  const { data, isPending, isError, refetch } = useCatalogProduct(selection.id);
  const title = useRef<HTMLHeadingElement>(null);
  const product = data?.id === selection.id ? data : undefined;
  const name = product?.nm?.trim() || selection.name;
  const image = resolveMediaUrl(product?.photoUrl || product?.imageUrls?.[0] || product?.baseImageUrl) || "";
  const variants = product?.variants ?? [];
  const sizes = [...new Set(variants.flatMap(row => row.size?.trim() ? [row.size.trim()] : []))];
  const knownStock = variants.filter((row): row is typeof row & { stock: number } => "stock" in row && typeof row.stock === "number" && Number.isFinite(row.stock));
  const price = product?.basePriceInr && product.basePriceInr > 0 ? formatInr(product.basePriceInr) : "";

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sm-copilot-dialog sm-copilot-catalog-preview"
      onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={event => { event.preventDefault(); selection.trigger.focus({ preventScroll: true }); }}>
      <DialogTitle ref={title} tabIndex={-1}>{name}</DialogTitle>
      <DialogDescription className="sr-only">Catalog product details</DialogDescription>
      {product ? <div className="sm-copilot-catalog-preview__grid">
        <div className="sm-copilot-catalog-preview__image"><CardImage key={image} src={image} alt={name} emptyLabel="No product image available" /></div>
        <div className="sm-copilot-catalog-preview__info">
          <div className="sm-copilot-catalog-preview__price"><strong>{price || "Price on request"}</strong>{price ? <small> incl. GST</small> : null}</div>
          <p className="sm-copilot-catalog-preview__availability">{stockLabel({ variants: knownStock })}</p>
          <dl>
            {product.brand ? <div><dt>Brand</dt><dd>{product.brand}</dd></div> : null}
            {product.category ? <div><dt>Category</dt><dd>{product.category}</dd></div> : null}
            {product.colors?.length ? <div><dt>Colors</dt><dd>{product.colors.join(", ")}</dd></div> : null}
            {sizes.length ? <div><dt>Sizes</dt><dd>{sizes.join(", ")}</dd></div> : null}
          </dl>
          {product.description?.trim() ? <p className="sm-copilot-catalog-preview__description">{product.description}</p> : null}
          {product.keyFeatures?.trim() ? <details><summary>Key features</summary><p className="sm-copilot-catalog-preview__description">{product.keyFeatures}</p></details> : null}
          {isError ? <p role="status">Could not refresh these catalog details.</p> : null}
        </div>
      </div> : isPending ? <p role="status">Loading catalog details…</p> : <div role="alert">
        <p>Could not load catalog details.</p>
        <button type="button" className="sm-copilot-catalog-preview__link" onClick={() => void refetch()}>Try again</button>
      </div>}
      <footer><Link className="sm-copilot-catalog-preview__link" to={selection.href}>Open full catalog page</Link></footer>
    </DialogContent>
  </Dialog>;
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

export type SwagProductControls = { selectedIds: string[]; busy: boolean; selectionPending?: boolean; pendingProductId?: string; readOnly?: boolean; onToggle: (id: string) => void };
export function CopilotArtifacts({
  artifacts,
  conversationId,
  onArtifactChange,
  swag,
  onSwagEdit,
  currentSwagCollectionId,
  onContinueSwag,
  onApplyLogo,
  onSwagBrowse,
  renderSwagFooter,
  swagReadOnly,
  showAllProducts = false,
  showProductAvailability = false,
  assistantReply,
}: {
  artifacts?: CopilotArtifact[];
  conversationId?: string | null;
  onArtifactChange?: (index: number, next: CopilotArtifact) => void;
  swag?: SwagProductControls;
  onSwagEdit?: () => void;
  currentSwagCollectionId?: string;
  onContinueSwag?: () => void;
  onApplyLogo?: () => void;
  onSwagBrowse?: (query: SwagCatalogQuery) => Promise<void>;
  renderSwagFooter?: (exploreMore: ReactNode) => ReactNode;
  swagReadOnly?: boolean;
  showAllProducts?: boolean;
  showProductAvailability?: boolean;
  assistantReply?: { text: string; streaming?: boolean };
}) {
  const [visible, setVisible] = useState(4);
  const [extra, setExtra] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogPreview, setCatalogPreview] = useState<(CatalogPreview & { conversationId: typeof conversationId }) | null>(null);
  const key = `${conversationId}:${JSON.stringify((artifacts || []).filter(a => a.kind === 'product' || a.kind === 'catalog_page'))}`;
  const current = useRef(key); current.current = key;
  const moreLock = useRef(false);
  useEffect(() => { setVisible(4); setExtra([]); setPage(null); setPageCount(null); setCatalogError(null); }, [key]);
  if (!artifacts?.length) return null;
  const allProducts = [...artifacts.filter((row) => row.kind === "product"), ...extra.map(product => ({ kind: 'product' as const, product }))];
  const products = swag ? [...new Map(allProducts.map((row, index) => [String(row.product.id || `${row.product.name}-${index}`), row])).values()] : allProducts;
  const catalog = artifacts.find((a): a is Extract<CopilotArtifact, { kind: 'catalog_page' }> => a.kind === 'catalog_page')?.catalog;
  const canFetch = Boolean(catalog && (page ?? catalog.pagination.page) < (pageCount ?? catalog.pagination.totalPages) && conversationId);
  async function showMore() {
    if (visible < products.length) { setVisible(value => value + 4); return; }
    if (!catalog || !conversationId || moreLock.current) return;
    const requestKey = key;
    moreLock.current = true; setLoading(true); setCatalogError(null);
    try {
      if (onSwagBrowse) { await onSwagBrowse({ ...catalog.query, page: (page ?? catalog.pagination.page) + 1 }); return; }
      const result = await browseSwagCatalog(conversationId, { ...catalog.query, limit: catalog.query.limit || catalog.pagination.limit || 10, page: (page ?? catalog.pagination.page) + 1 });
      if (current.current !== requestKey) return;
      setExtra(previous => [...new Map([...previous, ...result.items].map(item => [String(item.id), item])).values()]);
      setPage(result.pagination.page); setPageCount(result.pagination.totalPages); setVisible(value => value + 4);
    } catch (err) { if (current.current === requestKey) setCatalogError(err instanceof Error ? err.message : 'Could not load more products'); }
    finally { moreLock.current = false; setLoading(false); }
  }
  const kits = artifacts.filter((row) => row.kind === "kit");
  const wallets = artifacts.filter(
    (row): row is CopilotWalletBalanceArtifact => row.kind === "wallet_balance",
  );
  const departmentGroups = artifacts.filter(
    (row): row is CopilotDepartmentBudgetsArtifact => row.kind === "department_budgets",
  );
  const repeatsAmounts = Boolean(assistantReply?.text && wallets.length === 1
    && replyRepeatsWalletBalance(sanitizeCopilotAssistantText(assistantReply.text, artifacts), wallets[0]));
  const departmentsInWallets = new Set(wallets.flatMap(row => row.departments ?? []).map(row => row.entityId || row.name));
  const balanceResults = assistantReply?.streaming ? null : <>
    {wallets.map((row, index) => (
      <CopilotWalletBalanceReply key={row.wallet?.id || `wallet-${index}`} artifact={row} repeatsAmounts={repeatsAmounts} />
    ))}
    {departmentGroups.map((row, index) => {
      const departments = row.departments?.filter(department => !departmentsInWallets.has(department.entityId || department.name));
      if (row.departments?.length && !departments?.length) return null;
      return <CopilotDepartmentBudgetsReply key={`departments-${index}`} departments={departments ?? []}
        showTotal={departments?.length === row.departments?.length} />;
    })}
  </>;
  if (wallets.length + departmentGroups.length === artifacts.length) return balanceResults;
  const confirmations = artifacts
    .map((row, index) => ({ row, index }))
    .filter((entry): entry is { row: CopilotConfirmationArtifact; index: number } => entry.row.kind === "confirmation");
  const successes = artifacts.filter((row): row is CopilotSuccessArtifact => row.kind === "success");
  const latestSwagReview = confirmations.filter(({ row }) => row.operation === 'swag.collection').at(-1)?.row.confirmationId;
  const exploreMore = swag && !swag.readOnly && (visible < products.length || canFetch) ? (
    <button type="button" className="sm-copilot-confirm__cancel sm-swag-full sm-swag-more sm-swag-footer-action"
      disabled={loading || swag.busy || swag.selectionPending} aria-busy={loading} onClick={() => void showMore()}>
      {loading ? 'Loading products…' : 'Explore more'}
    </button>
  ) : null;

  return (
    <>
    {balanceResults}
    <div className={`sm-copilot-products${swag ? ' sm-copilot-products--swag' : ''}`} aria-label="Results">
      {artifacts.filter((row): row is Extract<CopilotArtifact, { kind: "curation" }> => row.kind === "curation" && Boolean(row.curation.chat)).map((row, index) => <GiftingChatGroups key={`gifting-${index}`} curation={row.curation} />)}
      {confirmations.map(({ row, index }) => (
        <CopilotConfirmationCard
          key={row.confirmationId || index}
          artifact={row}
          readOnly={row.operation === 'swag.collection' && (swagReadOnly || row.confirmationId !== latestSwagReview)}
          onEditSwag={onSwagEdit}
          conversationId={conversationId}
          onChange={(next) => onArtifactChange?.(index, next)}
        />
      ))}
      {successes.map((row, index) => (
        <CopilotWriteSuccess key={`success-${index}`} artifact={row}
          onContinueSwag={row.operation === 'swag.collection' && row.result?.id === currentSwagCollectionId ? onContinueSwag : undefined}
          onApplyLogo={row.operation === 'swag.collection' && row.result?.id === currentSwagCollectionId ? onApplyLogo : undefined} />
      ))}
      {(swag && !showAllProducts ? products.slice(0, visible) : products).map((row) => {
        const product = row.product;
        const id = String(product.id || "");
        const name = String(product.name || "Product");
        const productPending = swag?.pendingProductId === id;
        const href = id ? tenantPath(`/catalog/${encodeURIComponent(id)}`) : undefined;
        const body = <CatalogCardBody product={product} name={name} showAvailability={Boolean(swag || product.recommendation || showProductAvailability)} />;
        if (swag && id && href) return <div key={id} className={`${copilotCatalogCardClass} sm-copilot-product--selectable`}>
          {body}<div className="sm-swag-product-actions">
          <Link className="sm-swag-product-detail" to={href} aria-label={`View ${name}`}>Details</Link>
          {!swag.readOnly ? <button type="button" data-swag-product-id={id} className="sm-swag-product-add" aria-label={`${swag.selectedIds.includes(id) ? 'Remove' : 'Add'} ${name}`}
            aria-pressed={swag.selectedIds.includes(id)} disabled={swag.busy} aria-busy={productPending || undefined}
            aria-disabled={swag.selectionPending || undefined} onClick={() => { if (!swag.selectionPending) swag.onToggle(id); }}>
            {productPending ? <LoaderCircle size={14} className="sm-copilot-spin" aria-hidden="true" /> : swag.selectedIds.includes(id) ? '✓ Added' : '+ Add'}
          </button> : null}</div>
        </div>;
        return href ? (
          <Link
            key={id || name}
            to={href}
            className={copilotCatalogCardClass}
            aria-label={`View ${name}`}
            aria-haspopup={swag ? undefined : "dialog"}
            onClick={swag ? undefined : event => {
              if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setCatalogPreview({ id, name, href, trigger: event.currentTarget, conversationId });
            }}
          >
            {body}
            {!swag ? <span className="sm-copilot-catalog-card__action">View details</span> : null}
          </Link>
        ) : (
          <div key={name} className={copilotCatalogCardClass}>
            {body}
          </div>
        );
      })}
      {renderSwagFooter ? <div className="sm-swag-full sm-swag-catalog-footer">{renderSwagFooter(exploreMore)}</div> : exploreMore}
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
        const availability = String(kit.availability);
        const contents = kit.recommendation && Array.isArray(kit.products)
          ? kit.products.map((product: { name?: string; quantity?: number }) => `${product.name || "Item"}${product.quantity ? ` × ${product.quantity}` : ""}`).join(" · ")
          : "";
        const body = <CatalogProductCardContent
          name={name}
          brand={curated ? "Curated kit" : "Customized kit"}
          image={<CardImage key={img} src={img} alt={name} emptyLabel="No kit image available" />}
          price={price ? <CatalogPrice price={`Est. ${price}`} /> : <div className="pr">Price on request</div>}
          showPriceLabel={false}
          note={kit.recommendation ? <div className="sm-copilot-catalog-card__note">
            {["In stock", "Out of stock", "Availability unknown"].includes(availability) ? <div>{availability}</div> : null}
            {contents ? <div>{contents}</div> : null}
          </div> : null}
        />;
        return href ? (
          <Link
            key={`${name}-${index}`}
            to={href}
            className={copilotCatalogCardClass}
            aria-label={`View ${name}`}
          >
            {body}
            <span className="sm-copilot-catalog-card__action">View details</span>
          </Link>
        ) : (
          <div key={`${name}-${index}`} className={copilotCatalogCardClass}>
            {body}
          </div>
        );
      })}
      {catalogPreview && catalogPreview.conversationId === conversationId ? <CatalogProductPreview
        key={catalogPreview.id} selection={catalogPreview} onClose={() => setCatalogPreview(null)} /> : null}
    </div>
    </>
  );
}
