import { env } from '../../config/env.js';

export const CATALOG_PRODUCT_CARD_URI = 'ui://shelfmerch/catalog-product-card-v5.html';

export const CATALOG_PRODUCT_CARD_MIME = 'text/html;profile=mcp-app';

export const CATALOG_GRID_PAGE = 6;

const SHOPIFY_IMAGE_ORIGIN = 'https://cdn.shopify.com';

function httpsOrigin(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** Origins the host may allow for the official catalog image. No credentials. */
export function catalogProductCardResourceDomains() {
  const domains = [SHOPIFY_IMAGE_ORIGIN];
  const configured = httpsOrigin(env.S3_PUBLIC_BASE_URL);
  if (configured && !domains.includes(configured)) domains.push(configured);
  return domains;
}

export function catalogProductCardToolMeta() {
  return {
    ui: { resourceUri: CATALOG_PRODUCT_CARD_URI },
    'openai/outputTemplate': CATALOG_PRODUCT_CARD_URI,
  };
}

export function catalogProductCardResourceMeta() {
  return {
    ui: {
      prefersBorder: true,
      csp: {
        resourceDomains: catalogProductCardResourceDomains(),
      },
    },
  };
}

/** Accept only an https catalog URL, unchanged, with no embedded credentials. */
const SITE_ORIGIN = 'https://shelfmerch.io';

/** Prefer the configured public site origin; localhost falls back to production. */
export function catalogSiteOrigin(bases = [env.CLIENT_URL, env.APP_URL, env.BASE_URL]) {
  for (const base of bases) {
    const candidate = httpsOrigin(base);
    if (candidate && !candidate.includes('localhost') && !candidate.includes('127.0.0.1')) return candidate;
  }
  return SITE_ORIGIN;
}

/** Public marketing product page. Localhost falls back to the production catalog origin. */
export function publicCatalogProductUrl(productId, bases = [env.CLIENT_URL, env.APP_URL, env.BASE_URL]) {
  const id = typeof productId === 'string' ? productId.trim() : '';
  if (!/^[a-f\d]{24}$/i.test(id)) return '';
  return `${catalogSiteOrigin(bases)}/apps/catalog/${id}`;
}

export function officialCatalogImageUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return '';
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  return url.href;
}

export function rupeeLabel(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return `₹${Math.round(value)}`;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * View model for any catalog_get_product result. The price is the catalog
 * selling price. Variant overrides are not displayed.
 */
export function catalogProductCardView(product) {
  const source = product && typeof product === 'object' ? product : {};
  const variants = Array.isArray(source.variants)
    ? source.variants.map((variant) => {
        const row = variant && typeof variant === 'object' ? variant : {};
        const stock = Number(row.stock);
        const available = Number.isFinite(stock) && stock > 0;
        return {
          sku: text(row.sku),
          color: text(row.color),
          size: text(row.size),
          stockLabel: available ? `In stock (${Math.round(stock)})` : 'Out of stock',
          available,
        };
      })
    : [];
  const colors = [];
  for (const variant of variants) {
    if (variant.color && !colors.includes(variant.color)) colors.push(variant.color);
  }
  const description = text(source.description);
  const knownStock = variants.filter((variant) => variant.stockLabel);
  const anyAvailable = variants.some((variant) => variant.available);
  const moq = Number(source.moq);
  return {
    name: text(source.name) || 'Catalog product',
    productId: text(source.id),
    priceLabel: rupeeLabel(source.sellingPriceInr),
    hasInformation: Boolean(description),
    information: description || 'No product information available.',
    imageUrl: officialCatalogImageUrl(source.primaryImageUrl),
    category: text(source.category),
    subcategory: text(source.subcategory),
    childCategory: text(source.childCategory),
    availabilityLabel: knownStock.length ? (anyAvailable ? 'In stock' : 'Out of stock') : '',
    moqLabel: Number.isFinite(moq) && moq > 0 ? `Minimum order ${Math.round(moq)}` : '',
    colors,
    variants,
    pageUrl: publicCatalogProductUrl(source.id),
  };
}

/** One card per product. Search results and a single product use the same view. */
export function catalogProductCards(result) {
  const source = result && typeof result === 'object' ? result : {};
  const body =
    source.structuredContent && typeof source.structuredContent === 'object'
      ? source.structuredContent
      : source;
  if (Array.isArray(body.items)) return body.items.map((item) => catalogProductCardView(item));
  if (body.name || body.primaryImageUrl || body.id || body.sellingPriceInr != null) {
    return [catalogProductCardView(body)];
  }
  return [];
}

/** A search payload stays a grid. A single product opens on its detail view. */
export function catalogCardSession(result) {
  const source = result && typeof result === 'object' ? result : {};
  const body =
    source.structuredContent && typeof source.structuredContent === 'object'
      ? source.structuredContent
      : source;
  const pagination = body.pagination && typeof body.pagination === 'object' ? body.pagination : null;
  return {
    mode: Array.isArray(body.items) ? 'grid' : 'detail',
    views: catalogProductCards(result),
    pagination: pagination
      ? {
          page: Number(pagination.page),
          limit: Number(pagination.limit),
          total: Number(pagination.total),
          totalPages: Number(pagination.totalPages),
        }
      : null,
  };
}

/** Groups come from the loaded page. They are not a second catalog search. */
export function catalogBrowseFilters(views) {
  const rows = Array.isArray(views) ? views : [];
  const options = [{ id: 'all', label: 'All', count: rows.length }];
  let field = null;
  for (const key of ['childCategory', 'subcategory', 'category']) {
    const labels = new Set(rows.map((view) => (view && view[key] ? view[key] : '')).filter(Boolean));
    if (labels.size > 1) {
      field = key;
      break;
    }
  }
  if (!field) return { field: null, options };
  const counts = new Map();
  for (const view of rows) {
    const label = view && view[field] ? view[field] : 'Other';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  for (const label of [...counts.keys()].sort((a, b) => a.localeCompare(b))) {
    options.push({ id: label, label, count: counts.get(label) });
  }
  return { field, options };
}

export function catalogColorPreview(colors) {
  const list = Array.isArray(colors) ? colors.filter(Boolean) : [];
  return { shown: list.slice(0, 3), more: Math.max(0, list.length - 3) };
}

export function catalogPageNote(loadedCount, pagination) {
  if (!pagination || !Number.isFinite(pagination.total) || pagination.total <= loadedCount) return '';
  return `Filters apply to the ${loadedCount} products loaded on this page, not all ${pagination.total} matches.`;
}

function startCatalogProductCard() {
  const message = document.getElementById('message');
  const cards = document.getElementById('cards');
  let session = { mode: 'grid', views: [], pagination: null };
  let filterId = 'all';
  let shown = CATALOG_GRID_PAGE;
  let detailId = '';

  function showMessage(value) {
    message.hidden = false;
    message.textContent = value;
    cards.hidden = true;
    cards.replaceChildren();
  }

  function groupLabel(view) {
    const filters = catalogBrowseFilters(session.views);
    if (!filters.field) return '';
    return view[filters.field] || 'Other';
  }

  function filteredViews() {
    const filters = catalogBrowseFilters(session.views);
    if (!filters.field || filterId === 'all') return session.views;
    return session.views.filter((view) => groupLabel(view) === filterId);
  }

  function layoutMode(count) {
    if (count <= 1) return 'hero';
    if (count <= 5) return 'list';
    return 'grid';
  }

  function paintImage(media, view) {
    function unavailable() {
      media.replaceChildren();
      const fallback = document.createElement('p');
      fallback.className = 'image-fallback';
      fallback.textContent = 'Image unavailable';
      media.append(fallback);
    }
    if (!view.imageUrl) {
      unavailable();
      return;
    }
    const image = document.createElement('img');
    image.alt = view.name;
    image.addEventListener('error', unavailable, { once: true });
    image.src = view.imageUrl;
    media.append(image);
  }

  function openExternal(url) {
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    }
  }

  function appendMeta(body, view) {
    if (view.availabilityLabel) {
      const stock = document.createElement('p');
      stock.className = 'stock';
      stock.textContent = view.availabilityLabel;
      body.append(stock);
    }
    const preview = catalogColorPreview(view.colors);
    if (preview.shown.length) {
      const colors = document.createElement('p');
      colors.className = 'swatches';
      colors.textContent = preview.more
        ? preview.shown.join(', ') + ' +' + preview.more + ' more'
        : preview.shown.join(', ');
      body.append(colors);
    }
  }

  function appendActions(body, view, { detailsClass = 'details' } = {}) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = detailsClass;
    action.textContent = 'View details';
    action.addEventListener('click', () => {
      detailId = view.productId;
      paintDetail();
    });
    actions.append(action);
    if (view.pageUrl) {
      const external = document.createElement('button');
      external.type = 'button';
      external.className = 'external';
      external.textContent = 'View on ShelfMerch';
      external.addEventListener('click', () => openExternal(view.pageUrl));
      actions.append(external);
    }
    body.append(actions);
  }

  function paintSummary(view, mode) {
    const article = document.createElement('article');
    article.className = mode === 'hero' ? 'hero' : mode === 'list' ? 'row' : 'card';
    const media = document.createElement('div');
    media.className = mode === 'hero' ? 'media hero-media' : mode === 'list' ? 'media row-media' : 'media';
    paintImage(media, view);
    const body = document.createElement('div');
    body.className = 'body';
    const name = document.createElement('h2');
    name.textContent = view.name;
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = view.priceLabel;
    body.append(name, price);
    appendMeta(body, view);
    appendActions(body, view);
    article.append(media, body);
    return article;
  }

  function paintGrid() {
    const rows = filteredViews();
    message.hidden = true;
    cards.hidden = false;
    const mode = layoutMode(rows.length);
    cards.className = mode === 'hero' ? 'stage hero-stage' : mode === 'list' ? 'stage list-stage' : 'stage grid';
    cards.replaceChildren();
    const filters = catalogBrowseFilters(session.views);
    const bar = document.createElement('div');
    bar.className = 'toolbar';
    if (filters.options.length > 1) {
      const group = document.createElement('div');
      group.className = 'filters';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Filter loaded products');
      for (const option of filters.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.textContent = option.label + ' (' + option.count + ')';
        button.setAttribute('aria-pressed', option.id === filterId ? 'true' : 'false');
        button.addEventListener('click', () => {
          filterId = option.id;
          shown = CATALOG_GRID_PAGE;
          paintGrid();
        });
        group.append(button);
      }
      bar.append(group);
    }
    const pageNote = catalogPageNote(session.views.length, session.pagination);
    if (pageNote) {
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = pageNote;
      bar.append(note);
    }
    if (bar.childNodes.length) cards.append(bar);
    if (!session.views.length) {
      showMessage('No matching products.');
      return;
    }
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'No products in this group on the loaded page.';
      cards.append(empty);
      return;
    }
    const visible = mode === 'grid' ? rows.slice(0, shown) : rows;
    for (const view of visible) cards.append(paintSummary(view, mode));
    if (mode === 'grid') {
      const status = document.createElement('p');
      status.className = 'note';
      status.textContent = 'Showing ' + Math.min(shown, rows.length) + ' of ' + rows.length + ' loaded.';
      cards.append(status);
      if (rows.length > shown) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'more';
        more.textContent = 'Show more';
        more.addEventListener('click', () => {
          shown += CATALOG_GRID_PAGE;
          paintGrid();
        });
        cards.append(more);
      }
    }
  }

  function paintDetail() {
    const view = session.views.find((item) => item.productId === detailId) || session.views[0];
    if (!view) {
      showMessage('Product not found.');
      return;
    }
    message.hidden = true;
    cards.hidden = false;
    cards.className = 'detail';
    cards.replaceChildren();
    if (session.mode === 'grid') {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'back';
      back.textContent = 'Back';
      back.addEventListener('click', () => paintGrid());
      cards.append(back);
    }
    const article = document.createElement('article');
    article.className = 'product';
    const media = document.createElement('div');
    media.className = 'media large';
    paintImage(media, view);
    const name = document.createElement('h1');
    name.textContent = view.name;
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = view.priceLabel;
    article.append(media, name, price);
    if (view.availabilityLabel) {
      const stock = document.createElement('p');
      stock.className = 'stock';
      stock.textContent = view.availabilityLabel;
      article.append(stock);
    }
    const heading = document.createElement('h2');
    heading.textContent = 'Product Information';
    const info = document.createElement('p');
    info.className = 'information';
    info.textContent = view.information;
    article.append(heading, info);
    const variantBox = document.createElement('div');
    variantBox.className = 'variants';
    function renderVariants(color) {
      variantBox.replaceChildren();
      const matches = view.variants.filter((variant) => !color || variant.color === color);
      if (!matches.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No variants';
        variantBox.append(empty);
        return;
      }
      for (const variant of matches) {
        const line = document.createElement('p');
        const parts = [variant.color, variant.size].filter(Boolean);
        line.textContent = parts.length ? parts.join(' / ') + ' — ' + variant.stockLabel : variant.stockLabel;
        variantBox.append(line);
      }
    }
    if (view.colors.length) {
      const colors = document.createElement('div');
      colors.className = 'colors';
      view.colors.forEach((color, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = color;
        button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
        button.addEventListener('click', () => {
          for (const child of colors.children) child.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-pressed', 'true');
          renderVariants(color);
        });
        colors.append(button);
      });
      article.append(colors);
    }
    renderVariants(view.colors[0] || '');
    article.append(variantBox);
    const details = document.createElement('div');
    details.className = 'meta';
    const metaHeading = document.createElement('h2');
    metaHeading.textContent = 'Details';
    details.append(metaHeading);
    if (view.moqLabel) {
      const moq = document.createElement('p');
      moq.textContent = view.moqLabel;
      details.append(moq);
    }
    if (view.pageUrl) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'external';
      link.textContent = 'View on ShelfMerch';
      link.addEventListener('click', () => openExternal(view.pageUrl));
      details.append(link);
    }
    article.append(details);
    cards.append(article);
  }

  function renderResult(params) {
    const result = params && typeof params === 'object' ? params : {};
    if (result.isError) {
      const block = Array.isArray(result.content)
        ? result.content.find((item) => item && item.type === 'text' && item.text)
        : null;
      showMessage(block ? block.text : 'Product not found.');
      return;
    }
    session = catalogCardSession(result);
    filterId = 'all';
    shown = CATALOG_GRID_PAGE;
    detailId = session.mode === 'detail' && session.views[0] ? session.views[0].productId : '';
    if (!session.views.length) {
      showMessage('No matching products.');
      return;
    }
    if (session.mode === 'detail') paintDetail();
    else paintGrid();
  }

  const pending = new Map();
  let nextId = 1;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.jsonrpc !== '2.0') return;
    if (data.id != null && pending.has(data.id)) {
      const waiter = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) waiter.reject(data.error);
      else waiter.resolve(data.result);
      return;
    }
    if (data.method === 'ui/notifications/tool-result') renderResult(data.params);
  });

  function request(method, params) {
    const id = nextId;
    nextId += 1;
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  function renderHostOutput() {
    const output = window.openai && window.openai.toolOutput;
    if (output && typeof output === 'object') renderResult(output);
  }

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appInfo: { name: 'shelfmerch-catalog-product-card', version: '0.6.0' },
    appCapabilities: { availableDisplayModes: ['inline'] },
  }).then((result) => {
    const variables = result?.hostContext?.styles?.variables;
    if (variables && typeof variables === 'object') {
      for (const [key, value] of Object.entries(variables)) {
        if (typeof key === 'string' && key.startsWith('--') && typeof value === 'string') {
          document.documentElement.style.setProperty(key, value);
        }
      }
    }
    window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized' }, '*');
    renderHostOutput();
  }).catch(() => {
    renderHostOutput();
  });
}


export function catalogProductCardHtml() {
  const script = [
    officialCatalogImageUrl.toString(),
    rupeeLabel.toString(),
    text.toString(),
    `const SITE_ORIGIN = ${JSON.stringify(catalogSiteOrigin())};`,
    `function publicCatalogProductUrl(productId) {
  const id = typeof productId === 'string' ? productId.trim() : '';
  if (!/^[a-f\\d]{24}$/i.test(id) || !SITE_ORIGIN) return '';
  return SITE_ORIGIN + '/apps/catalog/' + id;
}`,
    catalogProductCardView.toString(),
    catalogProductCards.toString(),
    catalogCardSession.toString(),
    catalogBrowseFilters.toString(),
    catalogColorPreview.toString(),
    catalogPageNote.toString(),
    `const CATALOG_GRID_PAGE = ${CATALOG_GRID_PAGE};`,
    startCatalogProductCard.toString(),
    'startCatalogProductCard();',
  ].join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Catalog product</title>
<style>
  body { margin: 0; font: 14px/1.4 "Segoe UI", system-ui, sans-serif; color: var(--color-text-primary, #1c1d24); background: transparent; overflow-x: hidden; }
  #message { padding: 16px; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid #3D5FD9; outline-offset: 2px; }
  .stage { display: grid; gap: 10px; padding: 10px; container-type: inline-size; }
  .toolbar, .note, .more { grid-column: 1 / -1; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip, .more, .back, .details, .external, .colors button { border: 1px solid var(--color-border-primary, #d5dbe8); background: var(--color-background-primary, #fff); color: inherit; border-radius: 999px; padding: 6px 10px; }
  .chip[aria-pressed="true"], .colors button[aria-pressed="true"] { background: #3D5FD9; color: #fff; border-color: #3D5FD9; }
  .card, .row, .hero, .product { min-width: 0; background: var(--color-background-primary, #fff); border: 1px solid var(--color-border-primary, #e4e7ee); border-radius: 12px; overflow: hidden; }
  .card { display: flex; flex-direction: column; }
  .row, .hero { display: flex; align-items: stretch; gap: 0; }
  .media { position: relative; overflow: hidden; background: var(--color-background-secondary, #f7f9fe); }
  .card .media { height: 160px; }
  .row-media { width: 112px; min-width: 112px; height: 112px; }
  .hero-media { width: 42%; min-width: 140px; max-width: 280px; min-height: 180px; }
  .media.large { aspect-ratio: 4 / 3; height: auto; max-height: 320px; width: 100%; }
  .media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .image-fallback { margin: 0; padding: 12px; text-align: center; }
  .body, .product { padding: 12px; }
  .card .body { padding: 8px 10px; }
  h1, h2, p { margin: 0; overflow-wrap: anywhere; }
  h1 { font-size: 1.25rem; }
  .card h2, .row h2, .hero h2 { font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .price { margin-top: 4px; font-weight: 700; }
  .stock, .swatches, .note, .information, .variants p, .meta p { margin-top: 4px; color: var(--color-text-secondary, #5c6370); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .details, .more, .back, .external { min-height: 36px; }
  .grid { grid-template-columns: 1fr; }
  .list-stage, .hero-stage { grid-template-columns: 1fr; }
  .colors { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
  .meta { margin-top: 16px; }
  @container (min-width: 520px) {
    .grid { grid-template-columns: 1fr 1fr; }
    .card .media { height: 168px; }
  }
  @container (max-width: 419px) {
    .row, .hero { flex-direction: column; }
    .row-media, .hero-media { width: 100%; max-width: none; height: 160px; min-height: 160px; }
  }
  @media (prefers-color-scheme: dark) {
    body { color: var(--color-text-primary, #f4f4f5); }
    .card, .row, .hero, .product, .chip, .more, .back, .details, .external, .colors button { background: var(--color-background-primary, #1c1c1f); border-color: var(--color-border-primary, #3a3a40); }
    .chip[aria-pressed="true"], .colors button[aria-pressed="true"] { background: #3D5FD9; color: #fff; }
    .media { background: var(--color-background-secondary, #111114); }
    .stock, .swatches, .note, .information, .variants p, .meta p { color: var(--color-text-secondary, #c4c4cc); }
  }
</style>
</head>
<body>
<p id="message" aria-live="polite">Waiting for catalog product</p>
<div id="cards" hidden></div>
<script>${script}</script>
</body>
</html>`;
}

export function readCatalogProductCard() {
  return {
    contents: [
      {
        uri: CATALOG_PRODUCT_CARD_URI,
        mimeType: CATALOG_PRODUCT_CARD_MIME,
        text: catalogProductCardHtml(),
        _meta: catalogProductCardResourceMeta(),
      },
    ],
  };
}
