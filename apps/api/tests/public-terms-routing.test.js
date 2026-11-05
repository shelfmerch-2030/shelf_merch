import path from 'node:path';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Exercise production document handling without changing configuration, writing
// build artifacts, connecting to MongoDB, or starting application workers.
vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, env: { ...actual.env, NODE_ENV: 'production' } };
});
// Public document routes do not use OAuth or API rate limiting. Avoid their
// unrelated production initialization (issuer keys and Redis connections).
vi.mock('../src/modules/oauth/createOidcProvider.js', () => ({ getOidcProvider: () => ({}) }));
vi.mock('../src/middleware/globalRateLimit.middleware.js', () => ({
  globalHttpRateLimit: (_req, _res, next) => next(),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  const dist = path.resolve(import.meta.dirname, '../../web/dist');
  return {
    ...actual,
    existsSync: (file) => [dist, path.join(dist, 'index.html')].includes(path.resolve(String(file))) || actual.existsSync(file),
    readFileSync: (file, ...args) => path.resolve(String(file)) === path.join(dist, 'index.html')
      ? '<!doctype html><html><head><title>Fixture</title></head><body><div id="root"></div></body></html>'
      : actual.readFileSync(file, ...args),
  };
});

import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';

const canonical = '/legal/terms-of-service';
const agents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
];

describe('public Terms routing through the production Express document handler', () => {
  let app;
  let tenantLookup;
  beforeAll(() => {
    tenantLookup = vi.spyOn(Tenant, 'exists').mockImplementation(({ slug }) => ({
      setOptions: () => Promise.resolve(slug === 'routing-test-workspace' ? { _id: 'fixture' } : null),
    }));
    app = createApp();
  });
  beforeEach(() => {
    tenantLookup.mockClear();
  });
  afterAll(() => vi.restoreAllMocks());

  for (const agent of agents) {
    for (const method of ['get', 'head']) {
      for (const alias of ['/terms', '/terms-condition', '/terms/index.html', '/terms/', '/terms-condition/']) {
        it(`${method.toUpperCase()} ${alias} permanently redirects without auth (${agent.split(' ')[0]})`, async () => {
          const redirect = await request(app)[method](`${alias}?source=slack`).set('User-Agent', agent);
          expect(redirect.status).toBe(301);
          expect(redirect.headers.location).toBe(`${canonical}?source=slack`);
          const final = await request(app)[method](redirect.headers.location).set('User-Agent', agent);
          expect(final.status).toBe(200);
          expect(final.headers['content-type']).toMatch(/text\/html/);
          expect(final.headers.location).toBeUndefined();
          if (method === 'get') {
            expect(final.text).toContain('id="acceptance"');
            expect(final.text).toContain('https://shelfmerch.io/legal/terms-of-service');
            expect(final.text).not.toContain('id="root"');
          } else {
            expect(final.text).toBeUndefined();
          }
          expect(tenantLookup).not.toHaveBeenCalled();
        });
      }
      it(`${method.toUpperCase()} canonical, homepage, privacy and workspace routes still work (${agent.split(' ')[0]})`, async () => {
        for (const url of [canonical, '/', '/privacy', '/legal/privacy-policy', '/routing-test-workspace', '/routing-test-workspace/shops']) {
          const res = await request(app)[method](url).set('User-Agent', agent);
          expect(res.status, url).toBe(200);
          expect(res.headers['content-type']).toMatch(/text\/html/);
          if (method === 'get' && ['/', '/privacy', '/routing-test-workspace', '/routing-test-workspace/shops'].includes(url)) {
            expect(res.text).toContain('id="root"');
            expect(res.text).not.toContain('Page not found');
          }
        }
        expect(tenantLookup).toHaveBeenCalledTimes(2);
        expect(tenantLookup).toHaveBeenCalledWith({ slug: 'routing-test-workspace', status: { $ne: 'archived' } });
      });
      it(`${method.toUpperCase()} unknown public paths and missing workspaces stay 404 (${agent.split(' ')[0]})`, async () => {
        for (const url of ['/no/such-marketing-page', '/missing-routing-workspace', '/routing-test-workspace/not-a-route', '/terms-condition/shops']) {
          const res = await request(app)[method](url).set('User-Agent', agent);
          expect(res.status, url).toBe(404);
          if (method === 'get') expect(res.text).toContain('<h1>Page not found</h1>');
        }
        expect(tenantLookup).toHaveBeenCalledTimes(1);
      });
    }
  }
});
