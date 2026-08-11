import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { LOCAL_UPLOAD_DIR } from '../../services/storage.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_PROXY_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Allowlisted upstreams as parsed {host, pathPrefix} pairs. Matching on the
 * parsed URL's hostname (exact equality) rather than a raw-string prefix avoids
 * the classic bypass where `https://s3.region.amazonaws.com.evil.com/...` passes
 * a `startsWith` check.
 */
function allowedRemoteTargets() {
  const bucket = env.S3_BUCKET_NAME;
  const region = env.AWS_REGION;
  const raw = [];
  if (bucket && region) {
    raw.push(`https://s3.${region}.amazonaws.com/${bucket}/`);
    raw.push(`https://${bucket}.s3.${region}.amazonaws.com/`);
  }
  if (env.S3_PUBLIC_BASE_URL) raw.push(`${env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/`);
  if (env.R2_ENDPOINT && env.R2_BUCKET) raw.push(`${env.R2_ENDPOINT.replace(/\/$/, '')}/${env.R2_BUCKET}/`);
  // Shopify product photos used as production-mask fallbacks need canvas proxying.
  raw.push('https://cdn.shopify.com/');
  raw.push('https://cdn.shopifycdn.net/');

  const targets = [];
  for (const entry of raw) {
    try {
      const u = new URL(entry);
      targets.push({ host: u.hostname.toLowerCase(), pathPrefix: u.pathname });
    } catch {
      // Skip malformed config entries.
    }
  }
  return targets;
}

/** @param {URL} target */
function isAllowedRemoteTarget(target) {
  const host = target.hostname.toLowerCase();
  // Exact CDN hosts, plus shop-scoped Shopify CDN paths (…myshopify.com/cdn/…).
  if (host.endsWith('.myshopify.com') && target.pathname.startsWith('/cdn/')) {
    return true;
  }
  return allowedRemoteTargets().some(
    (allowed) => host === allowed.host && target.pathname.startsWith(allowed.pathPrefix),
  );
}

const router = Router();

/** Same-origin proxy so the browser can canvas-tint remote mask PNGs (S3/R2). */
router.get(
  '/proxy',
  asyncHandler(async (req, res) => {
    const raw = req.query.url;
    if (!raw || typeof raw !== 'string') throw new ApiError(400, 'url query param required', 'URL_REQUIRED');

    if (raw.startsWith('/uploads/')) {
      const rel = raw.slice('/uploads/'.length);
      // Reject NUL bytes outright, then resolve and confirm the result stays
      // inside LOCAL_UPLOAD_DIR using path.relative containment (a plain
      // `startsWith` check is bypassable, e.g. a sibling "<dir>-evil").
      if (rel.includes('\0')) throw new ApiError(400, 'invalid path', 'INVALID_PATH');
      const base = path.resolve(LOCAL_UPLOAD_DIR);
      const file = path.resolve(base, rel);
      const relToBase = path.relative(base, file);
      if (relToBase.startsWith('..') || path.isAbsolute(relToBase)) {
        throw new ApiError(403, 'path not allowed', 'PATH_DENIED');
      }
      const buf = await fs.readFile(file);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(buf);
    }

    let target;
    try {
      target = new URL(raw);
    } catch {
      throw new ApiError(400, 'invalid url', 'INVALID_URL');
    }
    if (!['http:', 'https:'].includes(target.protocol) || !isAllowedRemoteTarget(target)) {
      throw new ApiError(403, 'url not allowed', 'URL_DENIED');
    }

    // §security hardening C2 — SSRF defence: refuse redirects (a 3xx could bounce
    // an allowlisted URL to an internal host), cap the response, bound the wait,
    // and only pass through image content types.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetch(target, { redirect: 'error', signal: controller.signal });
    } catch {
      throw new ApiError(502, 'upstream fetch failed', 'UPSTREAM_ERROR');
    } finally {
      clearTimeout(timeout);
    }
    if (!upstream.ok) throw new ApiError(502, 'upstream fetch failed', 'UPSTREAM_ERROR');

    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new ApiError(415, 'unsupported upstream content type', 'UNSUPPORTED_CONTENT');
    }
    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength && declaredLength > MAX_PROXY_BYTES) {
      throw new ApiError(413, 'upstream response too large', 'RESPONSE_TOO_LARGE');
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_PROXY_BYTES) {
      throw new ApiError(413, 'upstream response too large', 'RESPONSE_TOO_LARGE');
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  }),
);

export default router;
