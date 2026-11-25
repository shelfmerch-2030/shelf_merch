/**
 * Infer a custom REST field mapping from a real API response.
 *
 * Every leaf path in a sample order is scored per target field on:
 *   1. key name   — ranked synonym lists (exact synonym beats partial match)
 *   2. context    — parent object (customer fields under customer/buyer/billing,
 *                   address fields under shipping/delivery/ship_to…)
 *   3. value type — email/date/phone/pincode/number validators
 * The best candidate above a threshold wins. Nothing here is trusted blindly:
 * the UI shows the value each path resolves to before the admin saves.
 */

const MAX_DEPTH = 5;

/** lowercase, alphanumerics only: "zip_code" → "zipcode", "Address-Line1" → "addressline1" */
export function normKey(key) {
  return String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isNum = (v) => (typeof v === 'number' && Number.isFinite(v)) || (isStr(v) && /^-?\d+(\.\d+)?$/.test(v.trim()));
const isDate = (v) => {
  if (typeof v === 'number') return v > 1e9; // unix seconds or ms
  if (!isStr(v) || v.length < 8 || /^\d+(\.\d+)?$/.test(v) && Number(v) < 1e9) return false;
  return !Number.isNaN(new Date(v).getTime());
};
const isScalar = (v) => isStr(v) || typeof v === 'number';

const SHIP_CONTEXT = ['shippingaddress', 'shipping', 'shipto', 'shippinginfo', 'deliveryaddress', 'delivery', 'destination', 'consignee', 'recipient', 'address'];
const BILL_CONTEXT = ['billingaddress', 'billing', 'billto'];
const CUSTOMER_CONTEXT = ['customer', 'buyer', 'client', 'user', 'contact', 'purchaser'];

/**
 * Per-field rules. `keys` are ranked synonyms (earlier = stronger).
 * `context`: preferred parent keys (normalized). `avoidContext`: parents that make a match unlikely.
 * `scope`: 'order' (whole order) or 'item' (one line item).
 */
const RULES = {
  externalId: { scope: 'order', keys: ['id', 'orderid', 'uuid', 'orderuuid', 'oid'], test: isScalar, topLevel: true, exactOnly: true },
  externalNumber: {
    scope: 'order',
    keys: ['ordernumber', 'orderno', 'number', 'displayid', 'reference', 'referencenumber', 'ordercode', 'name', 'code', 'ref'],
    test: isScalar,
    topLevel: true,
    exactOnly: true,
  },
  createdAt: { scope: 'order', keys: ['createdat', 'created', 'orderdate', 'placedat', 'createdon', 'ordercreatedat', 'date', 'createdtime'], test: isDate, topLevel: true },
  updatedAt: { scope: 'order', keys: ['updatedat', 'modifiedat', 'lastmodified', 'modified', 'updated', 'updatedon', 'lastupdated', 'updatedtime'], test: isDate, topLevel: true },
  status: { scope: 'order', keys: ['status', 'orderstatus', 'state', 'financialstatus', 'paymentstatus'], test: isStr, topLevel: true },
  total: { scope: 'order', keys: ['total', 'grandtotal', 'totalprice', 'ordertotal', 'totalamount', 'amount', 'amounttotal'], test: isNum, topLevel: true },

  customerName: { scope: 'order', keys: ['name', 'fullname', 'customername', 'buyername', 'contactname', 'displayname', 'firstname'], test: isStr, context: CUSTOMER_CONTEXT, fallback: 'shipName' },
  customerEmail: { scope: 'order', keys: ['email', 'customeremail', 'buyeremail', 'emailaddress', 'contactemail', 'mail'], test: (v) => isStr(v) && EMAIL_RE.test(v.trim()), context: CUSTOMER_CONTEXT },
  customerPhone: { scope: 'order', keys: ['phone', 'mobile', 'customerphone', 'phonenumber', 'contactnumber', 'mobilenumber', 'tel', 'contact'], test: (v) => isScalar(v) && String(v).replace(/\D/g, '').length >= 7, context: CUSTOMER_CONTEXT, fallback: 'shipPhone' },

  shipName: { scope: 'order', keys: ['fullname', 'name', 'recipientname', 'contactname', 'consigneename', 'shiptoname'], test: isStr, context: SHIP_CONTEXT, requireContext: true },
  shipPhone: { scope: 'order', keys: ['phone', 'mobile', 'phonenumber', 'contactnumber', 'mobilenumber', 'tel'], test: (v) => isScalar(v) && String(v).replace(/\D/g, '').length >= 7, context: SHIP_CONTEXT, requireContext: true },
  shipLine1: { scope: 'order', keys: ['address1', 'line1', 'addressline1', 'street', 'street1', 'streetaddress', 'address'], test: isStr, context: SHIP_CONTEXT, requireContext: true },
  shipLine2: { scope: 'order', keys: ['address2', 'line2', 'addressline2', 'street2', 'landmark', 'area', 'locality'], test: (v) => typeof v === 'string', context: SHIP_CONTEXT, requireContext: true },
  shipCity: { scope: 'order', keys: ['city', 'town', 'district', 'cityname'], test: isStr, context: SHIP_CONTEXT, requireContext: true },
  shipState: { scope: 'order', keys: ['state', 'province', 'region', 'statename', 'statecode', 'provincecode'], test: isStr, context: SHIP_CONTEXT, requireContext: true },
  shipPincode: { scope: 'order', keys: ['pincode', 'zipcode', 'zip', 'postalcode', 'postcode', 'pin'], test: (v) => isScalar(v) && /^[A-Za-z0-9 -]{3,10}$/.test(String(v).trim()), context: SHIP_CONTEXT, requireContext: true },
  shipCountry: { scope: 'order', keys: ['country', 'countrycode', 'countryname', 'nation'], test: isStr, context: SHIP_CONTEXT, requireContext: true },

  itemSku: { scope: 'item', keys: ['sku', 'variantsku', 'productsku', 'itemsku', 'skucode', 'itemcode', 'productcode', 'code', 'variantid', 'productid', 'itemid', 'id'], test: isScalar },
  itemName: { scope: 'item', keys: ['name', 'productname', 'title', 'itemname', 'producttitle', 'description'], test: isStr },
  itemQty: { scope: 'item', keys: ['quantity', 'qty', 'count', 'units', 'quantityordered'], test: isNum },
  itemPrice: { scope: 'item', keys: ['price', 'unitprice', 'rate', 'sellingprice', 'priceperunit', 'amount', 'mrp'], test: isNum },
  itemSize: { scope: 'item', keys: ['size', 'sizename', 'option1'], test: isScalar },
  itemColor: { scope: 'item', keys: ['color', 'colour', 'colorname', 'option2'], test: isStr },
};

export const REQUIRED_FIELDS = ['externalId', 'items', 'itemSku', 'itemQty', 'shipLine1', 'shipCity', 'shipPincode'];

/** All leaf (scalar) paths of an object, skipping arrays except the explicit `keepArrays` path. */
export function leafPaths(obj, prefix = '', depth = 0, out = []) {
  if (obj === null || obj === undefined || depth > MAX_DEPTH) return out;
  if (Array.isArray(obj)) return out;
  if (typeof obj !== 'object') {
    out.push({ path: prefix, value: obj });
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    leafPaths(v, prefix ? `${prefix}.${k}` : k, depth + 1, out);
  }
  return out;
}

function parentKeys(path) {
  return path.split('.').slice(0, -1).map(normKey);
}

function scoreCandidate(rule, path, value) {
  const segments = path.split('.');
  const key = normKey(segments[segments.length - 1]);
  const parents = parentKeys(path);

  let rank = rule.keys.indexOf(key);
  let keyScore;
  if (rank >= 0) {
    keyScore = 100 - rank * 6;
  } else {
    // Prefixed forms: "customer_email" for email, "shipping_zip" for zip.
    if (rule.exactOnly) return -1;
    rank = rule.keys.findIndex((k) => k.length >= 3 && (key.endsWith(k) || key.startsWith(k)));
    if (rank < 0) return -1;
    keyScore = 60 - rank * 4;
  }
  if (!rule.test(value)) return -1;

  let score = keyScore;
  const inContext = rule.context ? parents.some((p) => rule.context.includes(p)) : false;
  const inBilling = parents.some((p) => BILL_CONTEXT.includes(p));
  if (rule.requireContext && !inContext) return -1;
  if (inContext) score += 25;
  if (inBilling) score -= 20; // ship fields should come from shipping, not billing
  if (rule.topLevel) score -= parents.length * 15; // order-level ids/dates live at the top
  if (rule.scope === 'order' && !rule.context && parents.length) score -= 5 * parents.length;
  // Customer email/phone named "customer_*" at top level is a strong signal.
  if (rule.context === CUSTOMER_CONTEXT && !parents.length && /^(customer|buyer)/.test(key)) score += 20;
  return score;
}

function bestPath(rule, leaves, exclude = new Set()) {
  let best = null;
  for (const { path, value } of leaves) {
    if (exclude.has(path)) continue;
    const s = scoreCandidate(rule, path, value);
    if (s >= 0 && (!best || s > best.score)) best = { path, score: s, value };
  }
  return best;
}

/** The array of line items: an array of objects whose entries carry a quantity-like field. */
function findItemsArray(order, prefix = '', depth = 0) {
  if (!order || typeof order !== 'object' || depth > 3) return null;
  let best = null;
  for (const [k, v] of Object.entries(order)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && !Array.isArray(v[0])) {
      const keys = Object.keys(v[0]).map(normKey);
      const hasQty = keys.some((x) => RULES.itemQty.keys.includes(x));
      const hasIdent = keys.some((x) => RULES.itemSku.keys.includes(x) || RULES.itemName.keys.includes(x));
      const nameBonus = ['items', 'lineitems', 'lines', 'products', 'orderitems', 'orderlines'].includes(normKey(k)) ? 20 : 0;
      const score = (hasQty ? 50 : 0) + (hasIdent ? 30 : 0) + nameBonus;
      if (score >= 50 && (!best || score > best.score)) best = { path, score, sample: v[0] };
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = findItemsArray(v, path, depth + 1);
      if (inner && (!best || inner.score > best.score)) best = inner;
    }
  }
  return best;
}

function confidence(score) {
  if (score >= 100) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

/** Suggest `fields` for one raw order. Returns { fields, confidence } (only detected fields). */
export function suggestFields(order) {
  const fields = {};
  const conf = {};
  if (!order || typeof order !== 'object') return { fields, confidence: conf };

  const orderLeaves = leafPaths(order);
  const used = new Set();
  const shipPaths = new Set();
  // Order matters: specific/top-level fields first so generic ones ("name") can't steal them.
  const orderFieldOrder = [
    'externalId', 'externalNumber', 'createdAt', 'updatedAt', 'status', 'total',
    'shipLine1', 'shipLine2', 'shipCity', 'shipState', 'shipPincode', 'shipCountry', 'shipName', 'shipPhone',
    'customerEmail', 'customerName', 'customerPhone',
  ];
  for (const field of orderFieldOrder) {
    const rule = RULES[field];
    // Customer name/phone may share the shipping path (same person), never an order-level path.
    const exclude = ['customerName', 'customerPhone'].includes(field)
      ? new Set([...used].filter((p) => !shipPaths.has(p)))
      : used;
    const hit = bestPath(rule, orderLeaves, exclude);
    if (hit && field.startsWith('ship')) shipPaths.add(hit.path);
    if (hit) {
      fields[field] = hit.path;
      conf[field] = confidence(hit.score);
      used.add(hit.path);
    } else if (rule.fallback && fields[rule.fallback]) {
      fields[field] = fields[rule.fallback];
      conf[field] = 'medium';
    }
  }
  if (!fields.externalNumber && fields.externalId) {
    fields.externalNumber = fields.externalId;
    conf.externalNumber = 'medium';
  }
  if (!fields.updatedAt && fields.createdAt) {
    fields.updatedAt = fields.createdAt;
    conf.updatedAt = 'low';
  }

  const items = findItemsArray(order);
  if (items) {
    fields.items = items.path;
    conf.items = items.score >= 80 ? 'high' : 'medium';
    const itemLeaves = leafPaths(items.sample);
    const itemUsed = new Set();
    for (const field of ['itemQty', 'itemPrice', 'itemSku', 'itemName', 'itemSize', 'itemColor']) {
      const hit = bestPath(RULES[field], itemLeaves, itemUsed);
      if (hit) {
        fields[field] = hit.path;
        conf[field] = confidence(hit.score);
        itemUsed.add(hit.path);
      }
    }
  }
  return { fields, confidence: conf };
}

/** Arrays of objects anywhere in a response (depth ≤ 3) — candidate order lists. */
export function findArrayPaths(body, prefix = '', depth = 0, out = []) {
  if (Array.isArray(body)) {
    if (body.length === 0 || (body[0] && typeof body[0] === 'object' && !Array.isArray(body[0]))) out.push(prefix);
    return out;
  }
  if (!body || typeof body !== 'object' || depth >= 3) return out;
  for (const [key, value] of Object.entries(body)) {
    findArrayPaths(value, prefix ? `${prefix}.${key}` : key, depth + 1, out);
  }
  return out;
}

/** Pick the order list: prefer order-ish names, then the largest non-empty array. */
export function suggestItemsPath(body, get) {
  const candidates = findArrayPaths(body);
  if (!candidates.length) return null;
  const named = (p) => /(^|\.)(data|orders|results|items|records|rows|list|content)$/i.test(p) || p === '';
  const scored = candidates.map((p) => {
    const arr = get(body, p);
    const first = Array.isArray(arr) ? arr[0] : null;
    const looksLikeOrder = first && typeof first === 'object' && findItemsArray(first) ? 50 : 0;
    return { path: p, score: looksLikeOrder + (named(p) ? 20 : 0) + Math.min(10, Array.isArray(arr) ? arr.length : 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].path;
}

/** Pagination style from the non-list part of a response. */
export function suggestPagination(body, itemsPath) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const leaves = leafPaths(body).filter((l) => !itemsPath || !l.path.startsWith(`${itemsPath}.`));
  const byKey = (names) => leaves.find((l) => names.includes(normKey(l.path.split('.').pop())));
  const keyNames = new Set(leaves.map((l) => normKey(l.path.split('.').pop())));

  const cursor = byKey(['nextcursor', 'nextpagetoken', 'nexttoken', 'cursor', 'endcursor', 'after']);
  if (cursor) return { type: 'cursor', nextCursorPath: cursor.path, cursorParam: normKey(cursor.path.split('.').pop()) === 'nextpagetoken' ? 'page_token' : 'cursor' };

  const sizeParam = ['perpage', 'pagesize', 'limit'].find((k) => keyNames.has(k));
  const sizeName = { perpage: 'per_page', pagesize: 'page_size', limit: 'limit' }[sizeParam] ?? 'limit';
  if (['currentpage', 'page', 'totalpages', 'lastpage', 'pagecount'].some((k) => keyNames.has(k))) {
    const current = byKey(['currentpage', 'page']);
    const startPage = current && Number(current.value) === 0 ? 0 : 1;
    return { type: 'page', pageParam: 'page', sizeParam: sizeName, startPage };
  }
  if (keyNames.has('offset')) return { type: 'offset', offsetParam: 'offset', sizeParam: sizeName };
  return null;
}

/**
 * Full suggestion from one response body.
 * `get` is the adapter's dotted-path reader (kept injectable to avoid a cycle).
 */
export function suggestCustomRestConfig(body, get) {
  const itemsPath = suggestItemsPath(body, get);
  const list = itemsPath === null ? null : get(body, itemsPath);
  const first = Array.isArray(list) ? list[0] : null;
  const { fields, confidence: conf } = suggestFields(first);
  return {
    itemsPath,
    pagination: suggestPagination(body, itemsPath),
    fields,
    confidence: conf,
  };
}

const FIELD_ORDER = [
  'externalId', 'externalNumber', 'createdAt', 'updatedAt', 'status', 'total',
  'customerName', 'customerEmail', 'customerPhone',
  'shipName', 'shipPhone', 'shipLine1', 'shipLine2', 'shipCity', 'shipState', 'shipPincode', 'shipCountry',
  'items', 'itemSku', 'itemName', 'itemQty', 'itemPrice', 'itemSize', 'itemColor',
];

function display(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  if (typeof value === 'object') return '{…}';
  const s = String(value);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

/**
 * For each field: the configured path, the value it resolves to on the first
 * order (item fields on its first line), the suggested path, and whether it's required.
 */
export function buildFieldReport(order, configFields, suggestion, get) {
  const itemsArr = order ? get(order, configFields.items) : undefined;
  const firstItem = Array.isArray(itemsArr) ? itemsArr[0] : undefined;
  return FIELD_ORDER.map((field) => {
    const path = configFields[field] ?? '';
    const isItem = field.startsWith('item') && field !== 'items';
    const raw = !order ? undefined : isItem ? (firstItem ? get(firstItem, path) : undefined) : get(order, path);
    const ok = field === 'items' ? Array.isArray(raw) && raw.length > 0 : raw !== undefined && raw !== null && raw !== '' && typeof raw !== 'object';
    const suggested = suggestion?.fields?.[field] ?? null;
    let suggestedValue = null;
    if (suggested && suggested !== path && order) {
      const sItems = get(order, suggestion.fields.items ?? configFields.items);
      const sFirst = Array.isArray(sItems) ? sItems[0] : undefined;
      suggestedValue = display(isItem ? (sFirst ? get(sFirst, suggested) : undefined) : get(order, suggested));
    }
    return {
      field,
      path,
      value: display(raw),
      ok,
      required: REQUIRED_FIELDS.includes(field),
      suggested: suggested && suggested !== path ? suggested : null,
      suggestedValue,
      confidence: suggestion?.confidence?.[field] ?? null,
    };
  });
}
