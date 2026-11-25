import crypto from 'node:crypto';
import { ApiError } from '../../../utils/errors.js';
import { CUSTOM_WEBHOOK_SIGNATURE_HEADER } from '../orderSources.constants.js';
import { customRestConfigSchema, customRestCredentialsSchema } from './customRest.config.js';
import { emptyAddress, toMoney } from './normalizedOrder.js';
import { safeFetch } from './safeFetch.js';
import { buildFieldReport, findArrayPaths, suggestCustomRestConfig } from './customRest.detect.js';

export { findArrayPaths };

const PREVIEW_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/** Read a dotted path ("a.b.0.c"). '' returns the value itself. */
export function getPath(obj, path) {
  if (!path) return obj;
  let cur = obj;
  for (const key of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

function str(v) {
  if (v == null) return '';
  return typeof v === 'object' ? '' : String(v).trim();
}

/** ISO strings, unix seconds or unix ms → Date (or null). */
export function toDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One client order object → NormalizedOrder, using the connection's field map. */
export function normalizeCustomOrder(raw, config) {
  const f = config.fields;
  const status = str(getPath(raw, f.status)).toLowerCase();
  const items = getPath(raw, f.items);
  const country = str(getPath(raw, f.shipCountry)).toUpperCase();
  return {
    externalId: str(getPath(raw, f.externalId)),
    externalNumber: str(getPath(raw, f.externalNumber)),
    createdAt: toDate(getPath(raw, f.createdAt)),
    updatedAt: toDate(getPath(raw, f.updatedAt)) ?? toDate(getPath(raw, f.createdAt)),
    status: config.cancelledStatuses.includes(status) ? 'cancelled' : 'open',
    financialStatus: '',
    fulfillmentStatus: '',
    currency: 'INR',
    note: '',
    customer: {
      name: str(getPath(raw, f.customerName)),
      email: str(getPath(raw, f.customerEmail)),
      phone: str(getPath(raw, f.customerPhone)),
    },
    shippingAddress: {
      ...emptyAddress(),
      name: str(getPath(raw, f.shipName)) || str(getPath(raw, f.customerName)),
      phone: str(getPath(raw, f.shipPhone)) || str(getPath(raw, f.customerPhone)),
      line1: str(getPath(raw, f.shipLine1)),
      line2: str(getPath(raw, f.shipLine2)),
      city: str(getPath(raw, f.shipCity)),
      state: str(getPath(raw, f.shipState)),
      pincode: str(getPath(raw, f.shipPincode)).replace(/\s+/g, ''),
      // Accept "IN" or "India".
      country: !country || country === 'INDIA' ? 'IN' : country,
    },
    items: (Array.isArray(items) ? items : []).map((li, idx) => ({
      externalLineId: String(idx),
      externalSku: str(getPath(li, f.itemSku)),
      name: str(getPath(li, f.itemName)),
      qty: Number(getPath(li, f.itemQty)) || 0,
      unitPrice: toMoney(getPath(li, f.itemPrice)),
      variant: { size: str(getPath(li, f.itemSize)), color: str(getPath(li, f.itemColor)) },
    })),
    totals: { subtotal: 0, shipping: 0, tax: 0, total: toMoney(getPath(raw, f.total)) },
  };
}

function formatSince(since, format) {
  const d = new Date(since);
  if (format === 'unix') return String(Math.floor(d.getTime() / 1000));
  if (format === 'unix_ms') return String(d.getTime());
  return d.toISOString();
}

function authParts(config, credentials) {
  const headers = {};
  const query = {};
  const { type, headerName, queryParam } = config.auth;
  if (type === 'api_key_header') headers[headerName] = credentials.apiKey ?? '';
  if (type === 'api_key_query') query[queryParam] = credentials.apiKey ?? '';
  if (type === 'bearer') headers.Authorization = `Bearer ${credentials.token ?? ''}`;
  if (type === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.username ?? ''}:${credentials.password ?? ''}`).toString('base64')}`;
  }
  return { headers, query };
}

function buildUrl(config, path, query) {
  const url = new URL(config.baseUrl.replace(/\/+$/, '') + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function parseConfig(config) {
  const parsed = customRestConfigSchema.safeParse(config ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ApiError(422, `Invalid custom API config — ${msg}`, 'ORDER_SOURCE_CONFIG_INVALID');
  }
  return parsed.data;
}

function requireCredentials(config, credentials) {
  const need = {
    api_key_header: ['apiKey'],
    api_key_query: ['apiKey'],
    bearer: ['token'],
    basic: ['username', 'password'],
    none: [],
  }[config.auth.type];
  const missing = need.filter((k) => !credentials?.[k]);
  if (missing.length) {
    throw new ApiError(422, `Missing credentials: ${missing.join(', ')}`, 'ORDER_SOURCE_CREDENTIALS_MISSING');
  }
}

function shapeOf(value) {
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'object') {
    const keys = Object.keys(value).slice(0, 8);
    return `an object with keys: ${keys.join(', ') || '(none)'}`;
  }
  return `a ${typeof value}`;
}

/** Explain a wrong "orders array" path in terms the admin can act on. */
export function describeItemsPathMiss(body, itemsPath) {
  const where = itemsPath ? `"${itemsPath}"` : 'the response root';
  let msg = `No array of orders at ${where} — the API returned ${shapeOf(body)}.`;
  const candidates = findArrayPaths(body);
  if (candidates.length) {
    const shown = candidates.slice(0, 3).map((c) => (c === '' ? '(leave blank — the response itself is the array)' : `"${c}"`));
    msg += ` Set "Orders array in response" to ${shown.join(' or ')}.`;
  } else if (typeof body === 'string') {
    msg += ' The response is not JSON — check the base URL and orders path.';
  }
  return msg;
}

/** One HTTP call for a page. Returns the raw body; does not interpret it. */
async function requestPage(config, credentials, { since, cursor }, deps) {
  const p = config.orders.pagination;
  const auth = authParts(config, credentials);
  const query = { ...config.orders.query, ...auth.query };
  if (config.orders.sinceParam && since) query[config.orders.sinceParam] = formatSince(since, config.orders.sinceFormat);
  if (p.type !== 'none') query[p.sizeParam] = p.pageSize;
  if (p.type === 'page') query[p.pageParam] = cursor ?? p.startPage;
  if (p.type === 'offset') query[p.offsetParam] = cursor ?? 0;
  if (p.type === 'cursor' && cursor) query[p.cursorParam] = cursor;

  const url = buildUrl(config, config.orders.path, query);
  // What we called, safe to show an admin: secret query values and header values masked.
  const request = {
    method: 'GET',
    url: redactUrl(url, Object.keys(auth.query)),
    headers: Object.keys(auth.headers).map((h) => `${h}: ••••`),
  };
  let body;
  try {
    ({ body } = await safeFetch(url, { headers: auth.headers }, deps));
  } catch (err) {
    err.message = `${err.message} — request: GET ${request.url}`;
    err.request = request;
    throw err;
  }
  return { body, request };
}

async function fetchPage(config, credentials, { since, cursor }, deps) {
  const p = config.orders.pagination;
  const { body, request } = await requestPage(config, credentials, { since, cursor }, deps);
  const list = getPath(body, config.orders.itemsPath);
  if (!Array.isArray(list)) {
    const err = new ApiError(
      422,
      `${describeItemsPathMiss(body, config.orders.itemsPath)} — request: GET ${request.url}`,
      'ORDER_SOURCE_CONFIG_INVALID',
    );
    err.request = request;
    throw err;
  }

  let nextCursor = null;
  const full = list.length >= p.pageSize;
  if (p.type === 'page' && full) nextCursor = Number(cursor ?? p.startPage) + 1;
  if (p.type === 'offset' && full) nextCursor = Number(cursor ?? 0) + list.length;
  if (p.type === 'cursor') nextCursor = str(getPath(body, p.nextCursorPath)) || null;
  return { list, nextCursor, request };
}

/**
 * Flatten one client product (with optional variants array) into catalog rows,
 * one per sellable SKU, for bulk catalog matching.
 */
export function normalizeCatalogProduct(raw, productsConfig) {
  const f = productsConfig.fields;
  const base = {
    sku: str(getPath(raw, f.sku)),
    barcode: str(getPath(raw, f.barcode)),
    name: str(getPath(raw, f.name)),
    brand: str(getPath(raw, f.brand)),
    model: str(getPath(raw, f.model)),
    category: str(getPath(raw, f.category)),
    size: str(getPath(raw, f.size)),
    color: str(getPath(raw, f.color)),
    material: str(getPath(raw, f.material)),
    imageUrl: str(getPath(raw, f.imageUrl)),
  };
  const variants = getPath(raw, f.variants);
  if (!Array.isArray(variants) || !variants.length) return [base];
  return variants.map((v) => ({
    ...base,
    sku: str(getPath(v, f.variantSku)) || base.sku,
    barcode: str(getPath(v, f.variantBarcode)) || base.barcode,
    size: str(getPath(v, f.variantSize)) || base.size,
    color: str(getPath(v, f.variantColor)) || base.color,
  }));
}

/**
 * Read the client's whole product catalog (up to `maxPages` pages) from the
 * connection's products endpoint. Returns { rows, pages, truncated, request }.
 */
export async function fetchClientCatalog({ config, credentials }, { maxPages = 50 } = {}, deps = {}) {
  const parsed = parseConfig(config);
  if (!parsed.products) {
    throw new ApiError(422, 'This connection has no products endpoint configured', 'ORDER_SOURCE_NO_PRODUCTS_ENDPOINT');
  }
  // Reuse the orders request machinery with the products path, and no "since" filter.
  const asOrders = {
    ...parsed,
    orders: { ...parsed.orders, path: parsed.products.path, itemsPath: parsed.products.itemsPath, query: parsed.products.query, sinceParam: '' },
  };
  const rows = [];
  let cursor = null;
  let request = null;
  let pages = 0;
  for (; pages < maxPages; pages += 1) {
    const page = await fetchPage(asOrders, credentials, { since: null, cursor }, deps);
    request ??= page.request;
    for (const raw of page.list) rows.push(...normalizeCatalogProduct(raw, parsed.products));
    if (!page.nextCursor) {
      pages += 1;
      return { rows, pages, truncated: false, request };
    }
    cursor = page.nextCursor;
  }
  return { rows, pages, truncated: true, request };
}

function redactUrl(raw, secretParams) {
  const u = new URL(raw);
  for (const k of secretParams) if (u.searchParams.has(k)) u.searchParams.set(k, '••••');
  return decodeURIComponent(u.toString());
}

function hexHmac(secret, rawBody) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export const customRestAdapter = {
  provider: 'custom_rest',
  supportsWebhookRegistration: false,

  /** Input from the connect form → stored shape. A webhook secret is generated for the client. */
  prepareConnection({ config, credentials }) {
    const parsed = parseConfig(config);
    const creds = customRestCredentialsSchema.parse(credentials ?? {});
    requireCredentials(parsed, creds);
    return {
      shopDomain: new URL(parsed.baseUrl).host.toLowerCase(),
      config: parsed,
      credentials: creds,
      webhookSecret: crypto.randomBytes(32).toString('hex'),
    };
  },

  parseConfig,

  /**
   * Preview: one real request, then everything an admin needs to get the
   * mapping right — normalized sample, the first raw order, a per-field
   * report (value each path resolves to) and an auto-detected suggestion.
   * A wrong orders-array path is reported, not thrown, so the suggestion
   * can fix it.
   */
  async testConnection({ config, credentials }, deps = {}) {
    const parsed = parseConfig(config);
    const { body, request } = await requestPage(
      parsed,
      credentials,
      { since: new Date(Date.now() - PREVIEW_LOOKBACK_MS), cursor: null },
      deps,
    );
    const suggestion = suggestCustomRestConfig(body, getPath);
    const list = getPath(body, parsed.orders.itemsPath);
    const listOk = Array.isArray(list);
    const rawFirst = listOk ? list[0] ?? null : null;
    const suggestedList = suggestion.itemsPath === null ? null : getPath(body, suggestion.itemsPath);
    return {
      shopName: new URL(parsed.baseUrl).host,
      request,
      sample: listOk ? list.slice(0, 5).map((raw) => normalizeCustomOrder(raw, parsed)) : [],
      rawSample: rawFirst ?? (Array.isArray(suggestedList) ? suggestedList[0] ?? null : null),
      itemsPathError: listOk ? null : describeItemsPathMiss(body, parsed.orders.itemsPath),
      suggestion,
      fieldReport: buildFieldReport(rawFirst, parsed.fields, suggestion, getPath),
    };
  },

  async fetchOrders({ config, credentials }, { since, cursor = null }, deps = {}) {
    const parsed = parseConfig(config);
    const { list, nextCursor } = await fetchPage(parsed, credentials, { since, cursor }, deps);
    return {
      orders: list.map((raw) => ({ ...normalizeCustomOrder(raw, parsed), raw })),
      nextCursor,
    };
  },

  /** Hex HMAC-SHA256 of the raw body with our generated secret; "sha256=" prefix allowed. */
  verifyWebhook({ headers, rawBody, secret }) {
    const header = String(headers[CUSTOM_WEBHOOK_SIGNATURE_HEADER] ?? '').replace(/^sha256=/i, '').trim();
    if (!secret || !/^[0-9a-f]{64}$/i.test(header) || !Buffer.isBuffer(rawBody)) return false;
    const expected = Buffer.from(hexHmac(secret, rawBody), 'hex');
    return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
  },

  /** Body is one order, an array of orders, or { orders: [...] } — always the full order. */
  parseWebhook({ body, connection }) {
    const config = parseConfig(connection.config);
    const list = Array.isArray(body) ? body : Array.isArray(body?.orders) ? body.orders : [body];
    const orders = list.map((raw) => ({ ...normalizeCustomOrder(raw, config), raw }));
    if (orders.some((o) => !o.externalId)) {
      throw new ApiError(400, `Webhook order is missing "${config.fields.externalId}"`, 'WEBHOOK_INVALID');
    }
    return { refetchIds: [], orders };
  },

  async pushFulfillment({ config, credentials }, payload, deps = {}) {
    const parsed = parseConfig(config);
    if (!parsed.fulfillment?.path) return { pushed: false, unsupported: true, reason: 'No fulfillment endpoint configured' };
    const auth = authParts(parsed, credentials);
    const path = parsed.fulfillment.path.replace('{externalId}', encodeURIComponent(payload.externalId));
    await safeFetch(
      buildUrl(parsed, path, auth.query),
      {
        method: parsed.fulfillment.method,
        headers: { ...auth.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalId: payload.externalId,
          externalNumber: payload.externalNumber ?? '',
          status: 'shipped',
          trackingNumber: payload.trackingNumber ?? '',
          trackingUrl: payload.trackingUrl ?? '',
          courier: payload.courier ?? '',
          shippedAt: (payload.shippedAt ?? new Date()).toISOString(),
        }),
      },
      deps,
    );
    return { pushed: true };
  },
};
