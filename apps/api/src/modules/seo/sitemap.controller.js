import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { BlogPost } from '../blog/blogPost.model.js';
import { tenantCatalogFilter } from '../catalog/catalogFilters.js';
import { NotFoundError } from '../../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Canonical production origin for sitemap loc values. */
export const SITE_ORIGIN = 'https://shelfmerch.io';

/** Sitemap protocol max URLs per file; keep well under the 50k limit. */
export const SITEMAP_URL_LIMIT = 50_000;

/** Source files shipped via Vite `public/` (also copied into web/dist). */
export const WEB_PUBLIC_DIR = path.resolve(__dirname, '../../../../web/public');

const CACHE_CONTROL = 'public, max-age=3600';

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Build a urlset XML document for public catalog product detail URLs. */
export function buildCatalogSitemapXml(productIds) {
  const body = productIds
    .map((id) => {
      const loc = escapeXml(`${SITE_ORIGIN}/apps/catalog/${id}`);
      return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${body}\n` +
    `</urlset>\n`
  );
}

/** Serve a static SEO file from apps/web/public (works in test + production). */
export function sendSeoPublicFile(filename) {
  return (req, res, next) => {
    const filePath = path.join(WEB_PUBLIC_DIR, filename);
    if (!existsSync(filePath)) {
      return next(new NotFoundError(`${filename} not found`));
    }
    res.setHeader('Cache-Control', CACHE_CONTROL);
    if (filename.endsWith('.xml')) {
      res.type('application/xml');
    } else if (filename.endsWith('.txt')) {
      res.type('text/plain');
    }
    return res.sendFile(filePath);
  };
}

/**
 * Runtime catalog sitemap — active public catalog products only.
 * Registered before the SPA catch-all so DB failures return JSON, not index.html.
 */
export async function sendCatalogSitemap(_req, res) {
  const products = await CatalogProduct.find({
    status: 'active',
    ...tenantCatalogFilter(),
  })
    .select({ _id: 1 })
    .sort({ _id: 1 })
    .limit(SITEMAP_URL_LIMIT)
    .lean();

  const xml = buildCatalogSitemapXml(products.map((p) => String(p._id)));
  res
    .status(200)
    .type('application/xml')
    .set('Cache-Control', CACHE_CONTROL)
    .send(xml);
}

export function buildBlogSitemapXml(posts) {
  const body = posts.map((post) => `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}/blog/${post.slug}`)}</loc>\n    <lastmod>${new Date(post.updatedAt).toISOString()}</lastmod>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Queried on every request so publish/unpublish is reflected immediately. */
export async function sendBlogSitemap(_req, res) {
  const posts = await BlogPost.find({ status: 'published' })
    .select('slug updatedAt')
    .sort({ slug: 1 })
    .limit(SITEMAP_URL_LIMIT)
    .lean();
  res.status(200).type('application/xml').set('Cache-Control', 'no-store').send(buildBlogSitemapXml(posts));
}
