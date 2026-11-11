import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { importFromShopify } from '../src/modules/catalog/shopifyImport.service.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import mongoose from 'mongoose';

const KIT = { id: 111, title: 'Welcome Aboard Employee Kit', handle: 'welcome-kit', product_type: 'Kit', vendor: 'Acme', variants: [{ price: '1200', sku: 'KIT-1' }], images: [], options: [] };
const TEE = { id: 222, title: 'Cotton Tee', handle: 'cotton-tee', product_type: 'Apparel', vendor: 'Acme', variants: [{ price: '499', sku: 'TEE-1' }], images: [], options: [] };

function fakeRes(bodyObj, text = '') {
  return { ok: true, status: 200, json: async () => bodyObj, text: async () => text, headers: { get: () => null } };
}

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/products.json')) return fakeRes({ products: [KIT, TEE] });
    if (u.includes('/metafields')) return fakeRes({ metafields: [] });
    return fakeRes({}, '');
  });
});

describe('Shopify import sorts kits from catalog products', () => {
  it.each([true, false])('repairs legacy variant image URLs while preserving curated kit data (Shopify content changed=%s)', async (contentChanged) => {
    const imageUrl = 'https://cdn.shopify.com/employee-kit.webp';
    const labeledImageId = new mongoose.Types.ObjectId();
    // Bypass the current schema to reproduce a kit saved with the old string[] format.
    const { insertedId } = await PlatformKit.collection.insertOne({
      name: contentChanged ? 'Old kit name' : KIT.title,
      description: '',
      status: 'active',
      imageUrls: [],
      heroImage: imageUrl,
      galleryImages: [imageUrl],
      itemImages: [{ imageUrl, label: 'Kit contents' }],
      variantImages: [imageUrl, { _id: labeledImageId, imageUrl: `${imageUrl}?color=blue`, label: 'Blue' }],
      rules: { fixedComposition: true, customizationAllowed: false, requireLogo: false, minQtyPerRecipient: 2, maxQtyPerRecipient: 10 },
      source: { provider: 'shopify', domain: 'demo.myshopify.com', externalId: String(KIT.id) },
    });

    const summary = await importFromShopify({ domain: 'demo.myshopify.com', token: 't', only: 'kits' });
    expect(summary.failed).toBe(0);
    expect(summary.kits.updated).toBe(1);
    expect(summary.items).toEqual([{ title: KIT.title, status: 'updated', kind: 'kit' }]);

    const saved = await PlatformKit.collection.findOne({ _id: insertedId });
    expect(saved.name).toBe(KIT.title);
    expect(saved.variantImages).toEqual([
      expect.objectContaining({ imageUrl, label: '' }),
      { _id: labeledImageId, imageUrl: `${imageUrl}?color=blue`, label: 'Blue' },
    ]);
    expect(saved).toMatchObject({
      heroImage: imageUrl, galleryImages: [imageUrl], itemImages: [{ imageUrl, label: 'Kit contents' }],
      rules: { customizationAllowed: false, requireLogo: false, minQtyPerRecipient: 2, maxQtyPerRecipient: 10 },
    });
    const again = await importFromShopify({ domain: 'demo.myshopify.com', token: 't', only: 'kits' });
    expect(again.failed).toBe(0);
    expect(again.kits.skipped).toBe(1);
    expect(await PlatformKit.countDocuments()).toBe(1);
  });

  it('awaits independent progress snapshots after each completed item, including item failures', async () => {
    const snapshots = [];
    const create = vi.spyOn(CatalogProduct, 'create').mockRejectedValueOnce(new Error('Invalid product'));
    try {
      const summary = await importFromShopify({
        domain: 'demo.myshopify.com', token: 't',
        onProgress: async (partial) => {
          await Promise.resolve();
          snapshots.push(partial);
        },
      });
      expect(snapshots.map((snapshot) => snapshot.items.length)).toEqual([0, 1, 2]);
      expect(snapshots[0]).toMatchObject({ total: 2, imported: 0, failed: 0 });
      expect(snapshots[1]).toMatchObject({ imported: 1, kits: { imported: 1 }, failed: 0 });
      expect(snapshots[2]).toEqual(summary);
      expect(summary.failed).toBe(1);
      expect(summary.items[1]).toMatchObject({ title: 'Cotton Tee', status: 'failed', reason: 'Invalid product' });
    } finally {
      create.mockRestore();
    }
  });

  it("only: 'kits' imports only the bundle into PlatformKit", async () => {
    const summary = await importFromShopify({ domain: 'demo.myshopify.com', token: 't', only: 'kits' });
    expect(await PlatformKit.countDocuments()).toBe(1);
    expect(await CatalogProduct.countDocuments()).toBe(0);
    expect(summary.kits.imported).toBe(1);
    const kit = await PlatformKit.findOne({});
    expect(kit.name).toBe('Welcome Aboard Employee Kit');
    expect(kit.status).toBe('active');
    expect(kit.source.provider).toBe('shopify');
  });

  it("only: 'products' imports only the single product into the catalog", async () => {
    const summary = await importFromShopify({ domain: 'demo.myshopify.com', token: 't', only: 'products' });
    expect(await CatalogProduct.countDocuments()).toBe(1);
    expect(await PlatformKit.countDocuments()).toBe(0);
    expect(summary.products.imported).toBe(1);
    const product = await CatalogProduct.findOne({});
    expect(product.name).toBe('Cotton Tee');
  });
});
