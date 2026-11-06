import { env } from '../../config/env.js';

export const CATALOG_PRODUCT_CARD_URI = 'ui://shelfmerch/catalog-product-card-v2.html';
export const CATALOG_PRODUCT_CARD_MIME = 'text/html;profile=mcp-app';

const SHOPIFY_IMAGE_ORIGIN = 'https://cdn.shopify.com';

function httpsOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
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

/**
 * View model for any catalog_get_product result. The price is the catalog
 * selling price. Variant overrides are not displayed.
 */
export function catalogProductCardView(product) {
  const source = product && typeof product === 'object' ? product : {};
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
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
        };
      })
    : [];
  const colors = [];
  for (const variant of variants) {
    if (variant.color && !colors.includes(variant.color)) colors.push(variant.color);
  }
  const description = text(source.description);
  return {
    name: text(source.name) || 'Catalog product',
    productId: text(source.id),
    priceLabel: rupeeLabel(source.sellingPriceInr),
    hasInformation: Boolean(description),
    information: description || 'No product information available.',
    imageUrl: officialCatalogImageUrl(source.primaryImageUrl),
    colors,
    variants,
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

function startCatalogProductCard() {
  const message = document.getElementById('message');
  const cards = document.getElementById('cards');

  function showMessage(value) {
    message.hidden = false;
    message.textContent = value;
    cards.hidden = true;
    cards.replaceChildren();
  }

  function stockLine(variant) {
    const parts = [variant.color, variant.size, variant.sku].filter(Boolean);
    if (!parts.length) return variant.stockLabel;
    return parts.join(' · ') + ' · ' + variant.stockLabel;
  }

  function paintCard(view, showEmptyInformation) {
    const article = document.createElement('article');
    article.className = 'product';
    const media = document.createElement('div');
    media.className = 'media';
    function unavailable() {
      media.replaceChildren();
      const fallback = document.createElement('p');
      fallback.className = 'image-fallback';
      fallback.textContent = 'Image unavailable';
      media.append(fallback);
    }
    if (!view.imageUrl) {
      unavailable();
    } else {
      const image = document.createElement('img');
      image.alt = view.name;
      image.addEventListener('error', unavailable);
      image.src = view.imageUrl;
      media.append(image);
    }
    const name = document.createElement('h1');
    name.textContent = view.name;
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = view.priceLabel;
    const colors = document.createElement('div');
    colors.className = 'colors';
    const variants = document.createElement('div');
    function renderVariants(color) {
      variants.replaceChildren();
      const rows = view.variants.filter((variant) => !color || variant.color === color);
      if (!rows.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No variants';
        variants.append(empty);
        return;
      }
      for (const variant of rows) {
        const line = document.createElement('p');
        line.textContent = stockLine(variant);
        variants.append(line);
      }
    }
    view.colors.forEach((color, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = color;
      button.addEventListener('click', () => {
        for (const child of colors.children) child.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
        renderVariants(color);
      });
      if (index === 0) button.setAttribute('aria-pressed', 'true');
      colors.append(button);
    });
    renderVariants(view.colors[0] || '');
    article.append(media, name, price, colors, variants);
    if (view.hasInformation || showEmptyInformation) {
      const heading = document.createElement('h2');
      heading.textContent = 'Product Information';
      const info = document.createElement('p');
      info.className = 'information';
      info.textContent = view.information;
      article.append(heading, info);
    }
    const idLine = document.createElement('p');
    const id = document.createElement('span');
    id.textContent = view.productId;
    idLine.append('Product id ', id);
    article.append(idLine);
    return article;
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
    const views = catalogProductCards(result);
    if (!views.length) {
      showMessage('Waiting for catalog product');
      return;
    }
    message.hidden = true;
    cards.hidden = false;
    const showEmptyInformation = views.length === 1;
    cards.replaceChildren(...views.map((view) => paintCard(view, showEmptyInformation)));
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
    appInfo: { name: 'shelfmerch-catalog-product-card', version: '0.2.0' },
    appCapabilities: { availableDisplayModes: ['inline'] },
  })
    .then((result) => {
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
    })
    .catch(() => {
      renderHostOutput();
    });
}

export function catalogProductCardHtml() {
  const script = [
    officialCatalogImageUrl.toString(),
    rupeeLabel.toString(),
    catalogProductCardView.toString(),
    catalogProductCards.toString(),
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
  body { margin: 0; font-family: Georgia, serif; color: var(--color-text-primary, #172033); background: var(--color-background-primary, #fff); }
  #message, #cards { padding: 16px; }
  #cards { display: grid; gap: 16px; }
  .product { display: grid; gap: 12px; }
  .media { min-height: 180px; display: grid; place-items: center; background: var(--color-background-secondary, #f4f6f8); }
  img { max-width: 100%; max-height: 280px; object-fit: contain; }
  h1, h2, p { margin: 0; }
  h1 { font-size: 1.25rem; }
  .price { font-size: 1.5rem; font-weight: 700; }
  .colors { display: flex; flex-wrap: wrap; gap: 8px; }
  button { font: inherit; padding: 6px 10px; border: 1px solid var(--color-border-primary, #c5ced9); background: transparent; }
  button[aria-pressed="true"] { border-color: var(--color-text-primary, #172033); }
  .information { white-space: pre-wrap; }
</style>
</head>
<body>
<p id="message">Waiting for catalog product</p>
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
