import { isIP } from 'node:net';
import dns from 'node:dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import { env } from '../../config/env.js';

const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_URL_LENGTH = 2048;
const UNSUITABLE_IMAGE = /(?:1x1|pixel|spacer|blank|placeholder|sprite|logo[_-]?only|favicon|tracking|badge|icon[_-]?\d{0,3}\.(?:png|gif|svg)|data:image\/svg)/i;

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

function metaContent(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function resolveAgainst(baseUrl, candidate) {
  try {
    return new URL(candidate, baseUrl).href;
  } catch {
    return null;
  }
}

export function extractListingImageUrl(html, pageUrl) {
  if (typeof html !== 'string' || !html) return null;
  const slice = html.slice(0, MAX_HTML_BYTES);
  const raw = metaContent(slice, 'og:image')
    || metaContent(slice, 'og:image:secure_url')
    || metaContent(slice, 'twitter:image')
    || metaContent(slice, 'twitter:image:src');
  if (!raw) return null;
  const absolute = resolveAgainst(pageUrl, raw);
  const safe = publicHttpsUrl(absolute);
  if (!safe || UNSUITABLE_IMAGE.test(safe)) return null;
  const path = new URL(safe).pathname;
  if (/\.(?:svg|xml)(?:$|\?)/i.test(path)) return null;
  return safe;
}

async function readCappedBody(response, maxBytes = MAX_HTML_BYTES) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length && length > maxBytes) return null;
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > maxBytes ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
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

export async function fetchListingHtml(url, {
  signal,
  timeoutMs = env.EMBEDDED_COPILOT_EXTERNAL_IMAGE_ENRICHMENT_TIMEOUT_MS,
  fetchImpl,
  lookup = dns.lookup,
} = {}) {
  const safe = publicHttpsUrl(url);
  if (!safe) return null;
  const parsed = new URL(safe);
  const addresses = await resolvePublicHostname(parsed.hostname, lookup);
  if (!addresses) return null;

  const deadline = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const dispatcher = fetchImpl ? undefined : pinnedAgent(parsed.hostname, addresses);
  try {
    const response = await (fetchImpl || undiciFetch)(safe, {
      method: 'GET',
      redirect: 'error',
      signal: requestSignal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'ShelfMerchCopilotResearch/1.0',
      },
    });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!type || (!type.includes('html') && !type.includes('xhtml'))) return null;
    const buffer = await readCappedBody(response, MAX_HTML_BYTES);
    if (!buffer) return null;
    return buffer.toString('utf8');
  } catch {
    return null;
  } finally {
    if (dispatcher) {
      try { await dispatcher.close(); } catch { /* ignore */ }
    }
  }
}

/**
 * Enrich verified listing URLs with merchant OG/meta images.
 * Returns Map<productUrl, { imageUrl, provenance }>. Failures omit the entry (UI uses placeholder).
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
  for (const url of unique) {
    if (signal?.aborted) break;
    const html = await fetchListingHtml(url, { signal, timeoutMs, fetchImpl, lookup });
    if (!html) continue;
    const imageUrl = extractListingImageUrl(html, url);
    if (!imageUrl || !publicHttpsUrl(imageUrl)) continue;
    const provenance = (metaContent(html, 'og:image') || metaContent(html, 'og:image:secure_url'))
      ? 'merchant_og'
      : 'merchant_meta';
    images.set(url, { imageUrl, provenance });
  }
  return images;
}
