import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { ShopifyImportJob } from '../src/modules/catalog/shopifyImportJob.model.js';
import { runShopifyImportJob } from '../src/modules/catalog/shopifyImportJob.service.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import * as shopifyImportService from '../src/modules/catalog/shopifyImport.service.js';

function fakeRes(bodyObj, text = '') {
  return {
    ok: true,
    status: 200,
    json: async () => bodyObj,
    text: async () => text,
    headers: { get: () => null },
  };
}

const TEE = {
  id: 222,
  title: 'Cotton Tee',
  handle: 'cotton-tee',
  product_type: 'Apparel',
  vendor: 'Acme',
  body_html: '<p>Soft</p>',
  variants: [{ price: '499', sku: 'TEE-1', inventory_item_id: 9001 }],
  images: [],
  options: [],
  status: 'active',
};

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/products.json')) return fakeRes({ products: [TEE] });
    if (u.includes('/metafields')) return fakeRes({ metafields: [] });
    if (u.includes('/inventory_items.json')) {
      return fakeRes({ inventory_items: [{ id: 9001, harmonized_system_code: '610520' }] });
    }
    return fakeRes({}, '');
  });
});

describe('ShopifyImportJob runner', () => {
  it('keeps accumulated counts on fatal failure and redacts credentials from stored errors', async () => {
    const job = await ShopifyImportJob.create({ kind: 'products', domain: 'demo.myshopify.com' });
    const importer = vi.spyOn(shopifyImportService, 'importFromShopify').mockImplementation(async ({ onProgress }) => {
      await onProgress({
        imported: 1, updated: 0, skipped: 0, failed: 1, total: 3,
        products: { imported: 1, updated: 0, skipped: 0 }, kits: { imported: 0, updated: 0, skipped: 0 },
        items: [{ title: 'Tee', status: 'imported', kind: 'product' },
          { title: 'Bottle', status: 'failed', reason: 'Bad response shpat_secret' }],
      });
      throw new Error('Shopify rejected shpat_secret');
    });
    try {
      const failed = await runShopifyImportJob({ jobId: job._id, domain: job.domain, accessToken: 'shpat_secret', only: 'products' });
      expect(failed).toMatchObject({ status: 'failed', imported: 1, failed: 1, error: 'Shopify rejected [redacted]' });
      expect(failed.items).toHaveLength(2);
      expect(JSON.stringify(await ShopifyImportJob.findById(job._id).lean())).not.toContain('shpat_secret');
    } finally {
      importer.mockRestore();
    }
  });

  it('marks the job done and persists progress items without storing the token', async () => {
    const job = await ShopifyImportJob.create({
      kind: 'products',
      domain: 'demo.myshopify.com',
      status: 'queued',
    });

    const done = await runShopifyImportJob({
      jobId: job._id,
      domain: 'demo.myshopify.com',
      accessToken: 'shpat_test_token',
      only: 'products',
    });

    expect(done.status).toBe('done');
    expect(done.imported).toBe(1);
    expect(done.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Cotton Tee', status: 'imported', kind: 'product' })]),
    );
    expect(await CatalogProduct.countDocuments()).toBe(1);

    const stored = await ShopifyImportJob.findById(job._id).lean();
    expect(stored.status).toBe('done');
    expect(stored.items).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain('shpat_test_token');
    expect(stored.accessToken).toBeUndefined();
    expect(stored.token).toBeUndefined();
    // An enqueue acknowledgement failure must not import or append a second time.
    const again = await runShopifyImportJob({ jobId: job._id, domain: job.domain, accessToken: 'shpat_test_token', only: 'products' });
    expect(again.items).toHaveLength(1);
    expect(again.imported).toBe(1);
  });

  it('marks the job failed when Shopify rejects the token', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ errors: 'Unauthorized' }),
      headers: { get: () => null },
    }));

    const job = await ShopifyImportJob.create({
      kind: 'products',
      domain: 'demo.myshopify.com',
      status: 'queued',
    });

    const failed = await runShopifyImportJob({
      jobId: job._id,
      domain: 'demo.myshopify.com',
      accessToken: 'shpat_bad',
      only: 'products',
    });

    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/unauthorized|token|shopify/i);
  });
});
