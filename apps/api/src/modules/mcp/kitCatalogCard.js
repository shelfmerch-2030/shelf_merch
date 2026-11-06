import { catalogProductCardResourceDomains } from './catalogProductCard.js';
import { kitImageResourceOrigins } from './kitsRead.js';

export const KIT_CATALOG_CARD_URI = 'ui://shelfmerch/catalog-kit-card-v1.html';
export const KIT_CATALOG_CARD_MIME = 'text/html;profile=mcp-app';
const KIT_PAGE = 6;

export function kitCatalogCardToolMeta() {
  return {
    ui: { resourceUri: KIT_CATALOG_CARD_URI },
    'openai/outputTemplate': KIT_CATALOG_CARD_URI,
  };
}

export function kitCatalogCardResourceDomains() {
  const domains = [...catalogProductCardResourceDomains()];
  for (const origin of kitImageResourceOrigins()) {
    if (!domains.includes(origin)) domains.push(origin);
  }
  return domains;
}

export function kitCatalogCardResourceMeta() {
  return {
    ui: {
      prefersBorder: true,
      csp: { resourceDomains: kitCatalogCardResourceDomains() },
    },
  };
}

function kitCatalogCardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kit catalog</title>
<style>
  body { margin: 0; font: 14px/1.4 "Segoe UI", system-ui, sans-serif; color: var(--color-text-primary, #1c1d24); background: transparent; overflow-x: hidden; }
  #message { padding: 16px; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 2px solid #3D5FD9; outline-offset: 2px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 10px; }
  .toolbar, .note, .more { grid-column: 1 / -1; }
  .filters, .search { display: flex; flex-wrap: wrap; gap: 8px; }
  .search input { flex: 1 1 160px; min-width: 0; border: 1px solid var(--color-border-primary, #d5dbe8); background: var(--color-background-primary, #fff); color: inherit; border-radius: 999px; padding: 8px 12px; }
  .chip, .more, .back, .details { border: 1px solid var(--color-border-primary, #d5dbe8); background: var(--color-background-primary, #fff); color: inherit; border-radius: 999px; padding: 6px 10px; }
  .chip[aria-pressed="true"] { background: #3D5FD9; color: #fff; border-color: #3D5FD9; }
  .card, .kit { min-width: 0; background: var(--color-background-primary, #fff); border: 1px solid var(--color-border-primary, #e4e7ee); border-radius: 12px; overflow: hidden; }
  .card { display: flex; flex-direction: column; }
  .media { position: relative; overflow: hidden; background: var(--color-background-secondary, #f7f9fe); }
  .card .media { height: 160px; }
  .media.large { aspect-ratio: 4 / 3; height: auto; max-height: 320px; width: 100%; }
  .media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .image-fallback { margin: 0; padding: 12px; text-align: center; }
  .body, .kit { padding: 12px; }
  .card .body { padding: 8px 10px; }
  .card h2 { font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .kit { display: block; }
  h1, h2, p { margin: 0; overflow-wrap: anywhere; }
  h1 { font-size: 1.25rem; }
  .meta-line, .price, .contents p { margin-top: 4px; }
  .price { font-weight: 700; }
  .hint, .note { color: var(--color-text-secondary, #5c6370); }
  .details, .more, .back { margin-top: 8px; min-height: 36px; }
  @media (min-width: 520px) { .grid { grid-template-columns: 1fr 1fr; } .card .media { height: 168px; } }
  @media (prefers-color-scheme: dark) {
    body { color: var(--color-text-primary, #f4f4f5); }
    .card, .kit, .chip, .more, .back, .details, .search input { background: var(--color-background-primary, #1c1c1f); border-color: var(--color-border-primary, #3a3a40); }
    .chip[aria-pressed="true"] { background: #3D5FD9; color: #fff; }
    .media { background: var(--color-background-secondary, #111114); }
    .hint, .note { color: var(--color-text-secondary, #c4c4cc); }
  }
</style>
</head>
<body>
<p id="message" aria-live="polite">Waiting for kits.</p>
<div id="cards" hidden></div>
<script>
const PAGE = ${KIT_PAGE};
const message = document.getElementById('message');
const cards = document.getElementById('cards');
let session = { mode: 'grid', kits: [] };
let typeId = 'all';
let statusId = 'all';
let query = '';
let refocusSearch = false;
let shown = PAGE;
let detailId = '';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function httpsImage(value) {
  const raw = text(value);
  if (!raw || raw.length > 2000) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function money(kit) {
  const amount = Number(kit.priceInr);
  if (!Number.isFinite(amount) || amount <= 0) return 'Price unavailable';
  return '₹' + Math.round(amount);
}

function priceLabel(kit) {
  const kind = kit.type === 'curated' ? 'Estimated card price' : 'Listed price';
  return kind + ' ' + money(kit);
}

function showMessage(value) {
  message.hidden = false;
  message.textContent = value;
  cards.hidden = true;
  cards.replaceChildren();
}

function readBody(result) {
  const source = result && typeof result === 'object' ? result : {};
  if (source.structuredContent && typeof source.structuredContent === 'object') return source.structuredContent;
  return source;
}

function readSession(result) {
  const body = readBody(result);
  if (Array.isArray(body.items)) return { mode: 'grid', kits: body.items };
  if (body && (body.name || body.imageUrl || body.id)) return { mode: 'detail', kits: [body] };
  return { mode: 'grid', kits: [] };
}

function optionCounts(key) {
  const counts = new Map();
  for (const kit of session.kits) {
    const label = text(kit[key]);
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => a.localeCompare(b)).map((label) => ({ id: label, label, count: counts.get(label) }));
}

function matches(kit) {
  if (typeId !== 'all' && kit.type !== typeId) return false;
  if (statusId !== 'all' && kit.status !== statusId) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [kit.name, kit.description, kit.type, kit.status].map(text).join(' ').toLowerCase();
  return haystack.includes(needle);
}

function filtered() {
  return session.kits.filter(matches);
}

function paintImage(media, kit) {
  function unavailable() {
    media.replaceChildren();
    const fallback = document.createElement('p');
    fallback.className = 'image-fallback';
    fallback.textContent = 'Image unavailable';
    media.append(fallback);
  }
  const src = httpsImage(kit.imageUrl);
  if (!src) {
    unavailable();
    return;
  }
  const image = document.createElement('img');
  image.alt = text(kit.name) || 'Kit';
  image.addEventListener('error', unavailable, { once: true });
  image.src = src;
  media.append(image);
}

function paintSummary(kit) {
  const article = document.createElement('article');
  article.className = 'card';
  const media = document.createElement('div');
  media.className = 'media';
  paintImage(media, kit);
  const body = document.createElement('div');
  body.className = 'body';
  const name = document.createElement('h2');
  name.textContent = text(kit.name) || 'Kit';
  const kind = document.createElement('p');
  kind.className = 'meta-line';
  kind.textContent = (kit.type === 'curated' ? 'Curated' : 'Customized') + (kit.status ? ' · ' + kit.status : '');
  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = priceLabel(kit);
  const count = document.createElement('p');
  count.textContent = (Number(kit.itemCount) || 0) + ' items';
  body.append(name, kind, price, count);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'details';
  action.textContent = 'View details';
  action.addEventListener('click', () => {
    detailId = text(kit.id);
    paintDetail();
  });
  body.append(action);
  article.append(media, body);
  return article;
}

function paintChips(group, label, options, current, choose) {
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = option.label + ' (' + option.count + ')';
    button.setAttribute('aria-pressed', option.id === current ? 'true' : 'false');
    button.addEventListener('click', () => choose(option.id));
    group.append(button);
  }
}

function paintGrid() {
  const rows = filtered();
  message.hidden = true;
  cards.hidden = false;
  cards.className = 'grid';
  cards.replaceChildren();
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  const search = document.createElement('div');
  search.className = 'search';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter loaded kits';
  input.setAttribute('aria-label', 'Filter loaded kits');
  input.value = query;
  input.addEventListener('input', () => {
    query = input.value;
    shown = PAGE;
    refocusSearch = true;
    paintGrid();
  });
  search.append(input);
  bar.append(search);
  const types = optionCounts('type');
  if (types.length > 1) {
    const group = document.createElement('div');
    group.className = 'filters';
    paintChips(group, 'Kit type', [{ id: 'all', label: 'All', count: session.kits.length }, ...types], typeId, (id) => {
      typeId = id;
      shown = PAGE;
      paintGrid();
    });
    bar.append(group);
  }
  const statuses = optionCounts('status');
  if (statuses.length > 1) {
    const group = document.createElement('div');
    group.className = 'filters';
    paintChips(group, 'Kit status', [{ id: 'all', label: 'All statuses', count: session.kits.length }, ...statuses], statusId, (id) => {
      statusId = id;
      shown = PAGE;
      paintGrid();
    });
    bar.append(group);
  }
  cards.append(bar);
  if (refocusSearch) {
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    refocusSearch = false;
  }
  if (!session.kits.length) {
    showMessage('No matching kits.');
    return;
  }
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = 'No kits in this group on the loaded page.';
    cards.append(empty);
    return;
  }
  for (const kit of rows.slice(0, shown)) cards.append(paintSummary(kit));
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
      shown += PAGE;
      paintGrid();
    });
    cards.append(more);
  }
}

function paintDetail() {
  const kit = session.kits.find((item) => text(item.id) === detailId) || session.kits[0];
  if (!kit) {
    showMessage('Kit not found.');
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
  article.className = 'kit';
  const media = document.createElement('div');
  media.className = 'media large';
  paintImage(media, kit);
  const name = document.createElement('h1');
  name.textContent = text(kit.name) || 'Kit';
  const kind = document.createElement('p');
  kind.className = 'meta-line';
  kind.textContent = (kit.type === 'curated' ? 'Curated' : 'Customized') + (kit.status ? ' · ' + kit.status : '');
  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = priceLabel(kit);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Stored card price, not the checkout total.';
  article.append(media, name, kind, price, hint);
  const description = text(kit.description);
  if (description) {
    const heading = document.createElement('h2');
    heading.textContent = 'Description';
    const copy = document.createElement('p');
    copy.textContent = description;
    article.append(heading, copy);
  }
  const products = Array.isArray(kit.products) ? kit.products : [];
  const contents = document.createElement('div');
  contents.className = 'contents';
  const heading = document.createElement('h2');
  heading.textContent = 'Contents';
  contents.append(heading);
  if (!products.length) {
    const empty = document.createElement('p');
    empty.textContent = (Number(kit.itemCount) || 0) + ' items';
    contents.append(empty);
  } else {
    for (const product of products) {
      const line = document.createElement('p');
      const qty = Math.max(1, Math.round(Number(product.quantity) || 1));
      line.textContent = (text(product.name) || 'Item') + ' × ' + qty;
      contents.append(line);
    }
  }
  article.append(contents);
  cards.append(article);
}

function renderResult(params) {
  const result = params && typeof params === 'object' ? params : {};
  if (result.isError) {
    const block = Array.isArray(result.content) ? result.content.find((item) => item && item.type === 'text' && item.text) : null;
    showMessage(block ? block.text : 'Kit not found.');
    return;
  }
  session = readSession(result);
  typeId = 'all';
  statusId = 'all';
  query = '';
  shown = PAGE;
  detailId = session.mode === 'detail' && session.kits[0] ? text(session.kits[0].id) : '';
  if (!session.kits.length) {
    showMessage('No matching kits.');
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
  appInfo: { name: 'shelfmerch-catalog-kit-card', version: '0.1.0' },
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
</script>
</body>
</html>`;
}

export function readKitCatalogCard() {
  return {
    contents: [
      {
        uri: KIT_CATALOG_CARD_URI,
        mimeType: KIT_CATALOG_CARD_MIME,
        text: kitCatalogCardHtml(),
        _meta: kitCatalogCardResourceMeta(),
      },
    ],
  };
}

export { kitCatalogCardHtml };
