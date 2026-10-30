import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { BlogPost } from '../src/modules/blog/blogPost.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';

vi.mock('../src/services/storage.service.js', async (original) => ({
  ...await original(),
  uploadFile: vi.fn(async () => ({ key: 'platform/blog/test.png', url: '/uploads/platform/blog/test.png', driver: 'local' })),
  readStoredFile: vi.fn(async () => (await import('node:stream')).Readable.from(Buffer.from([137, 80, 78, 71]))),
}));

let app;
let sales;
let superAdmin;
let ops;
let auditor;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const content = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Useful guide' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Practical advice.' }] },
] };
const input = { slug: 'better-merch', title: 'Better merch', excerpt: 'How to choose useful merch.',
  content, authorName: 'ShelfMerch', coverImageUrl: '', coverImageAlt: '', seoTitle: '', seoDescription: '' };

async function tokenFor(role) {
  const user = await User.create({ name: role, email: `${role}@blog.test`, status: 'active' });
  const assignment = await RoleAssignment.create({ userId: user._id, role, scopeType: 'platform' });
  return signAccessToken(user, assignment);
}

beforeAll(async () => { await connectTestDb(); app = createApp(); });
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  sales = await tokenFor('platform_sales_manager');
  superAdmin = await tokenFor('platform_super_admin');
  ops = await tokenFor('platform_ops_admin');
  auditor = await tokenFor('platform_readonly_auditor');
});

describe('blog publishing', () => {
  it('renders the public guides hub without exposing draft articles', async () => {
    await BlogPost.create({ ...input, slug: 'private-draft', title: 'Private draft title', status: 'draft' });
    const hub = await request(app).get('/blog');
    expect(hub.status).toBe(200);
    expect(hub.text).toContain('Blog &amp; Guides | Shelf Merch');
    expect(hub.text).toContain('/images/logo/shelfmerch-wordmark.png');
    expect(hub.text).toContain('id="guides"');
    expect(hub.text).toContain('/case-studies/zoho-people');
    expect(hub.text).toContain('/docs/zoho-people/admin-guide');
    expect(hub.text).toContain('New articles are on their way.');
    expect(hub.text).not.toContain('Private draft title');
    expect(hub.text).not.toContain('/blog/private-draft');
  });

  it('paginates published articles and rejects invalid public page numbers', async () => {
    await BlogPost.insertMany(Array.from({ length: 13 }, (_, index) => ({ ...input, slug: `article-${index}`, title: `Article ${index}`, status: 'published', publishedAt: new Date(2026, 0, index + 1) })));
    const first = await request(app).get('/blog');
    expect(first.text).toContain('/blog?page=2#articles');
    expect(first.text).toContain('Article 12');
    expect(first.text).not.toContain('href="/blog/article-0"');
    const second = await request(app).get('/blog?page=2');
    expect(second.status).toBe(200);
    expect(second.text).toContain('Article 0');
    expect(second.text).toContain('/blog#articles');
    expect((await request(app).get('/blog?page=0')).status).toBe(404);
    expect((await request(app).get('/blog?page=3')).status).toBe(404);
  });

  it('keeps drafts private and updates public HTML and sitemap when published or unpublished', async () => {
    const created = await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send(input);
    expect(created.status).toBe(201);
    const id = created.body._id;
    expect((await request(app).get('/blog/better-merch')).status).toBe(404);
    expect((await request(app).get('/sitemap-blog.xml')).text).not.toContain('/blog/better-merch');

    const published = await request(app).post(`/api/v1/platform/blog-posts/${id}/publish`).set(auth(sales));
    expect(published.status).toBe(200);
    const article = await request(app).get('/blog/better-merch');
    expect(article.status).toBe(200);
    expect(article.text).toContain('<h1>Better merch</h1>');
    expect(article.text).toContain('<h2>Useful guide</h2>');
    expect(article.text).toContain('https://shelfmerch.io/blog/better-merch');
    expect(article.text).toContain('"@type":"BlogPosting"');
    expect(article.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/blog')).text).toContain('Better merch');
    const sitemap = await request(app).get('/sitemap-blog.xml');
    expect(sitemap.text).toContain('<loc>https://shelfmerch.io/blog/better-merch</loc>');
    expect(sitemap.text).toMatch(/<lastmod>\d{4}-\d\d-\d\dT/);
    expect(sitemap.headers['cache-control']).toBe('no-store');

    const changed = await request(app).patch(`/api/v1/platform/blog-posts/${id}`).set(auth(sales)).send({ title: 'Better merch updated' });
    expect(changed.status).toBe(200);
    expect((await request(app).get('/blog/better-merch')).text).toContain('Better merch updated');
    expect((await request(app).patch(`/api/v1/platform/blog-posts/${id}`).set(auth(sales)).send({ excerpt: '' })).status).toBe(422);
    expect((await request(app).post(`/api/v1/platform/blog-posts/${id}/unpublish`).set(auth(sales))).status).toBe(200);
    expect((await request(app).get('/blog/better-merch')).status).toBe(404);
    expect((await request(app).get('/sitemap-blog.xml')).text).not.toContain('/blog/better-merch');
    expect((await request(app).get('/sitemap.xml')).text).toContain('/sitemap-blog.xml');
  });

  it('enforces write roles, duplicate slugs and permanent published URLs', async () => {
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(ops)).send(input)).status).toBe(403);
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(auditor)).send(input)).status).toBe(403);
    const first = await request(app).post('/api/v1/platform/blog-posts').set(auth(superAdmin)).send(input);
    expect(first.status).toBe(201);
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send(input)).status).toBe(409);
    expect((await request(app).post(`/api/v1/platform/blog-posts/${first.body._id}/publish`).set(auth(superAdmin))).status).toBe(200);
    expect((await request(app).patch(`/api/v1/platform/blog-posts/${first.body._id}`).set(auth(sales)).send({ slug: 'changed-url' })).status).toBe(409);
    expect((await request(app).get('/api/v1/platform/blog-posts').set(auth(auditor))).status).toBe(200);
  });

  it('rejects unsafe editor content and only accepts blog-uploaded images', async () => {
    const unsafe = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    ] }] };
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send({ ...input, content: unsafe })).status).toBe(422);
    const foreignImage = { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://evil.test/image.png', alt: 'Example' } }] };
    expect((await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send({ ...input, content: foreignImage })).status).toBe(422);
    expect((await request(app).post('/api/v1/platform/blog-posts/images').set(auth(sales))
      .attach('image', Buffer.from('<svg/>'), { filename: 'unsafe.svg', contentType: 'image/svg+xml' })).status).toBe(415);

    const upload = await request(app).post('/api/v1/platform/blog-posts/images').set(auth(sales))
      .attach('image', Buffer.from([137, 80, 78, 71]), { filename: 'cover.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    const media = await request(app).get(upload.body.url);
    expect(media.status).toBe(200);
    expect(media.headers['content-type']).toMatch(/image\/png/);
    expect(media.headers['x-content-type-options']).toBe('nosniff');
    const created = await request(app).post('/api/v1/platform/blog-posts').set(auth(sales))
      .send({ ...input, coverImageUrl: upload.body.url, coverImageAlt: 'A useful gift' });
    expect(created.status).toBe(201);
  });

  it('escapes article text and metadata in crawler HTML', async () => {
    const dangerous = { ...input, slug: 'escaped-article', title: '<script>alert(1)</script>',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] }] } };
    const created = await request(app).post('/api/v1/platform/blog-posts').set(auth(sales)).send(dangerous);
    expect(created.status).toBe(201);
    expect((await request(app).post(`/api/v1/platform/blog-posts/${created.body._id}/publish`).set(auth(sales))).status).toBe(200);
    const html = (await request(app).get('/blog/escaped-article')).text;
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
