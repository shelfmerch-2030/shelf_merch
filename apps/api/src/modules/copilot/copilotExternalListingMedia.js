import { isIP } from 'node:net';
import dns from 'node:dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import { env } from '../../config/env.js';

/** Keep a bounded HTML prefix for OG/meta parsing (tags live in <head>). Truncate — do not discard. */
const MAX_HTML_BYTES = 768 * 1024;
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_SAFE_REDIRECTS = 3;
const UNSUITABLE_IMAGE = /(?:1x1|pixel|spacer|blank|placeholder|sprite|logo[_-]?only|favicon|tracking|badge|icon[_-]?\d{0,3}\.(?:png|gif|svg)|data:image\/svg)/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Same public HTTPS constraints as research sourceUrl — never fetch user-supplied URLs.
 * Callers must only pass research-validated listing URLs.
 */
export function publicHttpsUrl(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_IMAGE_URL_LENGTH) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !host.includes('.') || isIP(host)
      || /\.(?:localhost|local|internal|test|invalid|example|onion)$/i.test(host)) return null;
    if ([...url.searchParams.keys()].some(key => /token|signature|password|api.?key|credential|session|auth/i.test(key))) {
      return null;
    }
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/** Image URLs from merchant meta may be http or protocol-relative; upgrade when the https form is public. */
export function publicHttpsImageUrl(raw, pageUrl) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let candidate = raw.trim();
  if (candidate.startsWith('//') && pageUrl) {
    try { candidate = new URL(candidate, pageUrl).href; } catch { return null; }
  } else if (pageUrl && !/^https?:\/\//i.test(candidate)) {
    try { candidate = new URL(candidate, pageUrl).href; } catch { return null; }
  }
  if (/^http:\/\//i.test(candidate)) {
    candidate = `https://${candidate.slice('http://'.length)}`;
  }
  const safe = publicHttpsUrl(candidate);
  if (!safe || UNSUITABLE_IMAGE.test(safe)) return null;
  try {
    const path = new URL(safe).pathname;
    if (/\.(?:svg|xml)(?:$|\?)/i.test(path)) return null;
  } catch {
    return null;
  }
  return safe;
}

/** True when the address must never be contacted by enrichment (SSRF). */
export function isBlockedIp(address) {
  if (typeof address !== 'string' || !address) return true;
  const family = isIP(address);
  if (!family) return true;

  if (family === 4) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100))) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')
    || normalized.startsWith('fea') || normalized.startsWith('feb')) return true; // link-local
  if (normalized.startsWith('ff')) return true; // multicast
  // IPv4-mapped IPv6
  const mapped = normalized.match(/^:{0,2}ffff:(\d+\.\d+\.\d+\.\d+)$/i)
    || normalized.match(/^:{0,2}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mapped) {
    if (mapped[1].includes('.')) return isBlockedIp(mapped[1]);
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return isBlockedIp(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  return false;
}

/**
 * Resolve hostname and reject when any answer is private/reserved.
 * Returns the public addresses used to pin the subsequent connect (anti-rebinding).
 */
export async function resolvePublicHostname(hostname, lookup = dns.lookup) {
  if (typeof hostname !== 'string' || !hostname.includes('.') || isIP(hostname)) return null;
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return null;
  }
  if (!Array.isArray(records) || !records.length) return null;
  const publicRecords = [];
  for (const row of records) {
    const address = row?.address;
    if (!address || isBlockedIp(address)) return null;
    publicRecords.push({ address, family: row.family || isIP(address) });
  }
  return publicRecords.length ? publicRecords : null;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/** Parse one meta/link tag's attributes regardless of order or quote style. */
function tagAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
  }
  return attrs;
}

function metaContent(html, property) {
  const wanted = property.toLowerCase();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key === wanted && attrs.content) return attrs.content;
  }
  return null;
}

function linkImageHref(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const rel = (attrs.rel || '').toLowerCase();
    if ((rel === 'image_src' || rel === 'thumbnail') && attrs.href) return attrs.href;
  }
  return null;
}

function itempropImage(html) {
  for (const match of html.matchAll(/<(?:meta|img|link)\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    if ((attrs.itemprop || '').toLowerCase() !== 'image') continue;
    if (attrs.content) return attrs.content;
    if (attrs.src) return attrs.src;
    if (attrs.href) return attrs.href;
  }
  return null;
}

export function extractListingImageUrl(html, pageUrl) {
  if (typeof html !== 'string' || !html) return null;
  const slice = html.slice(0, MAX_HTML_BYTES);
  const raw = metaContent(slice, 'og:image')
    || metaContent(slice, 'og:image:secure_url')
    || metaContent(slice, 'og:image:url')
    || metaContent(slice, 'twitter:image')
    || metaContent(slice, 'twitter:image:src')
    || linkImageHref(slice)
    || itempropImage(slice);
  if (!raw) return null;
  return publicHttpsImageUrl(raw, pageUrl);
}

export function imageProvenanceFromHtml(html) {
  if (metaContent(html, 'og:image') || metaContent(html, 'og:image:secure_url') || metaContent(html, 'og:image:url')) {
    return 'merchant_og';
  }
  return 'merchant_meta';
}

/**
 * Read up to maxBytes and return the prefix. Oversized bodies are truncated so <head> OG tags remain usable.
 * Returns { buffer, truncated }.
 */
async function readCappedBody(response, maxBytes = MAX_HTML_BYTES) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length <= maxBytes) return { buffer, truncated: false };
    return { buffer: buffer.subarray(0, maxBytes), truncated: true };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    if (total >= maxBytes) {
      truncated = true;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    const remaining = maxBytes - total;
    const piece = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(Buffer.from(piece));
    total += piece.byteLength;
    if (value.byteLength > remaining) {
      truncated = true;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
  }
  return { buffer: Buffer.concat(chunks, total), truncated };
}

function pinnedAgent(hostname, addresses) {
  return new Agent({
    connect: {
      // Pin TLS SNI / cert verification to the public hostname while connecting to resolved IPs only.
      servername: hostname,
      lookup(host, options, callback) {
        if (host !== hostname) {
          callback(new Error('hostname mismatch'));
          return;
        }
        const family = options?.family;
        const matched = family
          ? addresses.filter(row => row.family === family)
          : addresses;
        if (!matched.length) {
          callback(new Error('no public address'));
          return;
        }
        if (options?.all) {
          callback(null, matched.map(row => ({ address: row.address, family: row.family })));
          return;
        }
        callback(null, matched[0].address, matched[0].family);
      },
    },
  });
}

function emptyDiagnostics(overrides = {}) {
  return {
    attempted: false,
    skipped: false,
    skipReason: null,
    urlsConsidered: 0,
    urlsProcessed: 0,
    htmlFetched: 0,
    htmlTruncated: 0,
    dnsRejected: 0,
    redirectsFollowed: 0,
    redirectsRejected: 0,
    timeouts: 0,
    httpErrors: 0,
    contentTypeRejected: 0,
    fetchErrors: 0,
    missingImageMeta: 0,
    unsuitableOrInvalidImage: 0,
    imagesAttached: 0,
    ...overrides,
  };
}

/**
 * Fetch listing HTML with DNS pinning. Dangerous redirects (non-https / private DNS / credentialed)
 * are rejected; limited public-https hops are followed with per-hop revalidation.
 * Returns { html, failure, truncated, redirectsFollowed } — never throws for expected soft failures.
 */
export async function fetchListingHtml(url, {
  signal,
  timeoutMs = env.EMBEDDED_COPILOT_EXTERNAL_IMAGE_ENRICHMENT_TIMEOUT_MS,
  fetchImpl,
  lookup = dns.lookup,
  maxRedirects = MAX_SAFE_REDIRECTS,
} = {}) {
  let current = publicHttpsUrl(url);
  if (!current) return { html: null, failure: 'invalid_url', truncated: false, redirectsFollowed: 0 };

  const deadline = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const visited = new Set();
  let redirectsFollowed = 0;
  let lastFailure = 'fetch_error';

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (requestSignal.aborted) {
      return {
        html: null,
        failure: signal?.aborted ? 'cancelled' : deadline.aborted ? 'timeout' : 'aborted',
        truncated: false,
        redirectsFollowed,
      };
    }
    if (!current || visited.has(current)) {
      return { html: null, failure: 'redirect_rejected', truncated: false, redirectsFollowed };
    }
    visited.add(current);

    const parsed = new URL(current);
    const addresses = await resolvePublicHostname(parsed.hostname, lookup);
    if (!addresses) {
      return { html: null, failure: 'dns_rejected', truncated: false, redirectsFollowed };
    }

    const dispatcher = fetchImpl ? undefined : pinnedAgent(parsed.hostname, addresses);
    try {
      requestSignal.throwIfAborted();
      const response = await (fetchImpl || undiciFetch)(current, {
        method: 'GET',
        // Manual hops keep SSRF checks on every Location; never auto-follow into private space.
        redirect: 'manual',
        signal: requestSignal,
        ...(dispatcher ? { dispatcher } : {}),
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'ShelfMerchCopilotResearch/1.0 (+https://shelfmerch.io)',
          'Accept-Language': 'en-IN,en;q=0.8',
        },
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return { html: null, failure: 'redirect_rejected', truncated: false, redirectsFollowed };
        }
        let next;
        try {
          next = publicHttpsUrl(new URL(location, current).href);
        } catch {
          next = null;
        }
        if (!next) {
          return { html: null, failure: 'redirect_rejected', truncated: false, redirectsFollowed };
        }
        redirectsFollowed++;
        if (redirectsFollowed > maxRedirects) {
          return { html: null, failure: 'redirect_rejected', truncated: false, redirectsFollowed };
        }
        current = next;
        continue;
      }

      if (!response.ok) {
        return { html: null, failure: 'http_error', truncated: false, redirectsFollowed };
      }
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!type || (!type.includes('html') && !type.includes('xhtml'))) {
        return { html: null, failure: 'content_type', truncated: false, redirectsFollowed };
      }
      const { buffer, truncated } = await readCappedBody(response, MAX_HTML_BYTES);
      if (!buffer?.length) {
        return { html: null, failure: 'empty_body', truncated: false, redirectsFollowed };
      }
      return { html: buffer.toString('utf8'), failure: null, truncated, redirectsFollowed };
    } catch (err) {
      if (signal?.aborted) lastFailure = 'cancelled';
      else if (deadline.aborted) lastFailure = 'timeout';
      else lastFailure = 'fetch_error';
      return { html: null, failure: lastFailure, truncated: false, redirectsFollowed };
    } finally {
      if (dispatcher) {
        try { await dispatcher.close(); } catch { /* ignore */ }
      }
    }
  }

  return { html: null, failure: 'redirect_rejected', truncated: false, redirectsFollowed };
}

/**
 * Enrich verified listing URLs with merchant OG/meta images.
 * Returns { images: Map, diagnostics }. Failures omit the entry (UI uses placeholder).
 * Image URLs are validated with publicHttpsUrl only (browser-fetched); listing HTML fetches are DNS-pinned.
 */
export async function enrichListingImages(productUrls, {
  signal,
  fetchImpl,
  lookup = dns.lookup,
  max = env.EMBEDDED_COPILOT_EXTERNAL_IMAGE_ENRICHMENT_MAX,
  timeoutMs = env.EMBEDDED_COPILOT_EXTERNAL_IMAGE_ENRICHMENT_TIMEOUT_MS,
} = {}) {
  const images = new Map();
  const unique = [...new Set((productUrls || []).map(url => publicHttpsUrl(url)).filter(Boolean))]
    .slice(0, Math.max(0, max));
  const diagnostics = emptyDiagnostics({
    attempted: true,
    urlsConsidered: (productUrls || []).length,
    urlsProcessed: unique.length,
  });

  for (const url of unique) {
    if (signal?.aborted) {
      diagnostics.timeouts += 1;
      break;
    }
    const result = await fetchListingHtml(url, { signal, timeoutMs, fetchImpl, lookup });
    if (result.redirectsFollowed) diagnostics.redirectsFollowed += result.redirectsFollowed;
    if (!result.html) {
      switch (result.failure) {
        case 'dns_rejected': diagnostics.dnsRejected += 1; break;
        case 'redirect_rejected': diagnostics.redirectsRejected += 1; break;
        case 'timeout': case 'aborted': case 'cancelled': diagnostics.timeouts += 1; break;
        case 'http_error': diagnostics.httpErrors += 1; break;
        case 'content_type': diagnostics.contentTypeRejected += 1; break;
        default: diagnostics.fetchErrors += 1; break;
      }
      continue;
    }
    diagnostics.htmlFetched += 1;
    if (result.truncated) diagnostics.htmlTruncated += 1;

    const imageUrl = extractListingImageUrl(result.html, url);
    if (!imageUrl) {
      // Distinguish missing meta vs rejected image URL when raw meta exists.
      const raw = metaContent(result.html, 'og:image')
        || metaContent(result.html, 'og:image:secure_url')
        || metaContent(result.html, 'twitter:image')
        || metaContent(result.html, 'twitter:image:src');
      if (raw) diagnostics.unsuitableOrInvalidImage += 1;
      else diagnostics.missingImageMeta += 1;
      continue;
    }
    if (!publicHttpsUrl(imageUrl)) {
      diagnostics.unsuitableOrInvalidImage += 1;
      continue;
    }
    images.set(url, { imageUrl, provenance: imageProvenanceFromHtml(result.html) });
    diagnostics.imagesAttached += 1;
  }

  return { images, diagnostics };
}

export { MAX_HTML_BYTES, emptyDiagnostics };
