import { BlogPost } from './blogPost.model.js';
import { BlogAsset } from './blogAsset.model.js';
import { escapeHtml, renderBlogContent } from './blogContent.js';
import { SITE_ORIGIN } from '../seo/sitemap.controller.js';
import { readStoredFile } from '../../services/storage.service.js';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';

const STYLES = `
  :root{font-family:Inter,Arial,sans-serif;color:#121212;background:#f7f3ea}
  *{box-sizing:border-box}body{margin:0}a{color:inherit}img{max-width:100%}
  .blog-header{background:#fff;border-bottom:1px solid #e7e2d9;padding:18px max(20px,5vw);display:flex;align-items:center;justify-content:space-between;gap:20px}
  .blog-brand{font-family:'Bricolage Grotesque',sans-serif;font-size:22px;font-weight:800;text-decoration:none;letter-spacing:-.05em}
  .blog-header nav{display:flex;gap:22px;font-size:14px;font-weight:600}.blog-header nav a{text-decoration:none}
  .blog-wrap{width:min(1100px,calc(100% - 40px));margin:0 auto;padding:65px 0 100px}
  .blog-eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:12px;color:#3155ff;font-weight:800}
  h1,h2,h3{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.045em}h1{font-size:clamp(42px,6vw,78px);line-height:1.02;margin:12px 0 20px}
  .blog-intro{font-size:18px;line-height:1.65;color:#555;max-width:720px}.blog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:48px}
  .blog-card{background:#fff;border:1px solid #e7e2d9;border-radius:18px;overflow:hidden}.blog-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
  .blog-card-body{padding:22px}.blog-card h2{font-size:26px;line-height:1.12;margin:12px 0}.blog-card h2 a{text-decoration:none}.blog-card p{line-height:1.6;color:#555}
  .blog-meta{font-size:13px;color:#777}.blog-pagination{display:flex;justify-content:space-between;margin-top:40px}
  .blog-article{max-width:760px;margin:auto}.blog-article .blog-intro{font-size:22px}.blog-cover{width:100%;max-height:470px;object-fit:cover;border-radius:20px;margin:30px 0}
  .blog-content{font-size:18px;line-height:1.8}.blog-content h2{font-size:36px;margin-top:55px}.blog-content h3{font-size:27px;margin-top:38px}
  .blog-content p,.blog-content ul,.blog-content ol{margin:22px 0}.blog-content blockquote{border-left:4px solid #3155ff;padding-left:20px;color:#444;margin:30px 0}
  .blog-content figure{margin:36px 0}.blog-content figure img{border-radius:14px}.blog-content a{color:#3155ff}
  .blog-footer{background:#121212;color:#fff;padding:35px max(20px,5vw);font-size:14px}.blog-footer a{margin-right:20px}
  @media(max-width:800px){.blog-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:580px){.blog-grid{grid-template-columns:1fr}.blog-header nav{gap:12px;font-size:12px}.blog-wrap{padding-top:42px}}
`;

function absoluteImage(url) {
  return url?.startsWith('/') ? `${SITE_ORIGIN}${url}` : url;
}

function htmlPage({ title, description, canonical, body, image = '', type = 'website', jsonLd = null, robots = 'index,follow' }) {
  const socialImage = image ? `<meta property="og:image" content="${escapeHtml(absoluteImage(image))}" />` : '';
  const structuredData = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robots}" />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
    <meta property="og:type" content="${type}" /><meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ''}
    ${socialImage}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
    <link rel="icon" href="/favicon-32x32.png" type="image/png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" />
    <style>${STYLES}</style>${structuredData}</head><body>
    <header class="blog-header"><a class="blog-brand" href="/">shelfmerch</a><nav aria-label="Site"><a href="/blog">Blog</a><a href="/resources">Resources</a><a href="/apps/catalog">Catalog</a><a href="/request-demo">Book a demo</a></nav></header>
    ${body}<footer class="blog-footer"><a href="/">ShelfMerch</a><a href="/blog">Blog</a><a href="/legal/privacy-policy">Privacy</a></footer>
    </body></html>`;
}

function dateText(value) {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export async function sendBlogIndex(req, res) {
  const page = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return res.status(404).type('html').set('Cache-Control', 'no-store').send(htmlPage({
      title: 'Blog page not found', description: '', robots: 'noindex,follow', body: '<main class="blog-wrap"><h1>Page not found</h1></main>',
    }));
  }
  const limit = 12;
  const [posts, total] = await Promise.all([
    BlogPost.find({ status: 'published' }).select('slug title excerpt coverImageUrl coverImageAlt publishedAt').sort({ publishedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    BlogPost.countDocuments({ status: 'published' }),
  ]);
  if (page > 1 && posts.length === 0) {
    return res.status(404).type('html').set('Cache-Control', 'no-store').send(htmlPage({
      title: 'Blog page not found', description: '', robots: 'noindex,follow', body: '<main class="blog-wrap"><h1>Page not found</h1></main>',
    }));
  }
  const cards = posts.map((post) => `<article class="blog-card">
    ${post.coverImageUrl ? `<a href="/blog/${post.slug}"><img src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.coverImageAlt)}" loading="lazy" /></a>` : ''}
    <div class="blog-card-body"><span class="blog-meta">${dateText(post.publishedAt)}</span>
    <h2><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.excerpt)}</p>
    <a href="/blog/${post.slug}">Read article →</a></div></article>`).join('');
  const body = `<main class="blog-wrap"><span class="blog-eyebrow">ShelfMerch Blog</span>
    <h1>Ideas for better merch and recognition.</h1><p class="blog-intro">Stories, guides and practical ideas from ShelfMerch.</p>
    ${posts.length ? `<div class="blog-grid">${cards}</div>` : '<p>New articles are on their way.</p>'}
    <nav class="blog-pagination" aria-label="Blog pages">${page > 1 ? `<a href="${page === 2 ? '/blog' : `/blog?page=${page - 1}`}">← Previous</a>` : '<span></span>'}
    ${page * limit < total ? `<a href="/blog?page=${page + 1}">Next →</a>` : ''}</nav></main>`;
  const canonical = `${SITE_ORIGIN}/blog${page > 1 ? `?page=${page}` : ''}`;
  res.status(200).type('html').set('Cache-Control', 'no-store').send(htmlPage({
    title: 'Blog | ShelfMerch', description: 'Stories, guides and practical ideas for merchandise, gifting and recognition.', canonical, body,
  }));
}

export async function sendBlogArticle(req, res) {
  const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' }).lean();
  if (!post) {
    return res.status(404).type('html').set('Cache-Control', 'no-store').send(htmlPage({
      title: 'Article not found | ShelfMerch', description: '', robots: 'noindex,follow',
      body: '<main class="blog-wrap"><h1>Article not found</h1><a href="/blog">Back to blog</a></main>',
    }));
  }
  const canonical = `${SITE_ORIGIN}/blog/${post.slug}`;
  const title = post.seoTitle || `${post.title} | ShelfMerch`;
  const description = post.seoDescription || post.excerpt;
  const datePublished = post.publishedAt.toISOString();
  const dateModified = post.updatedAt.toISOString();
  const body = `<main class="blog-wrap blog-article"><a href="/blog">← All articles</a>
    <article><span class="blog-eyebrow">ShelfMerch Blog</span><h1>${escapeHtml(post.title)}</h1>
    <p class="blog-intro">${escapeHtml(post.excerpt)}</p><p class="blog-meta">By ${escapeHtml(post.authorName || 'ShelfMerch')} · <time datetime="${datePublished}">${dateText(post.publishedAt)}</time></p>
    ${post.coverImageUrl ? `<img class="blog-cover" src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.coverImageAlt)}" />` : ''}
    <div class="blog-content">${renderBlogContent(post.content)}</div></article></main>`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
    description, mainEntityOfPage: canonical, datePublished, dateModified,
    author: { '@type': post.authorName && post.authorName !== 'ShelfMerch' ? 'Person' : 'Organization', name: post.authorName || 'ShelfMerch' },
    publisher: { '@type': 'Organization', name: 'ShelfMerch', url: SITE_ORIGIN },
    ...(post.coverImageUrl ? { image: absoluteImage(post.coverImageUrl) } : {}),
  };
  res.status(200).type('html').set('Cache-Control', 'no-store').send(htmlPage({
    title, description, canonical, body, image: post.coverImageUrl, type: 'article', jsonLd,
  }));
}

export async function sendBlogMedia(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
  const asset = await BlogAsset.findById(req.params.id).lean();
  if (!asset) return res.status(404).end();
  const stream = await readStoredFile(asset);
  res.status(200).type(asset.contentType)
    .set('X-Content-Type-Options', 'nosniff')
    .set('Content-Security-Policy', "default-src 'none'; sandbox")
    .set('Cache-Control', 'public, max-age=31536000, immutable');
  await pipeline(stream, res);
}
