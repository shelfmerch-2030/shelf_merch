import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { McpShopAssetTicket } from '../src/modules/mcp/mcpShopAssetTicket.model.js';
import { completeShopAssetUpload, prepareShopAssetUpload } from '../src/modules/mcp/shopsAssetUpload.js';
import {
  executeProductArtworkDesign,
  getProductArtworkUpload,
  prepareProductArtworkDesign,
  prepareProductArtworkUpload,
} from '../src/modules/mcp/productArtworkWrite.js';
import { COPILOT_MCP_TOOL_NAMES } from '../src/modules/copilot/copilotMcpCatalog.js';
import { clearTenantLimitCache } from '../src/services/tenantGuardrails.service.js';
import { makeTenant, makeUser } from './helpers.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let app;
let tenant;
let admin;
let manager;
let otherTenant;
let otherAdmin;
let shop;
let otherShop;
let product;

function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

function makePng(pixelsPerMetre = 11811) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(pixelsPerMetre, 0);
  phys.writeUInt32BE(pixelsPerMetre, 4);
  phys[8] = 1;
  const idat = deflateSync(Buffer.from([0, 0, 0, 0]));
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('pHYs', phys),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const ARTWORK_PNG = makePng();

function actorOf(user) {
  return { tenantId: user.tenantId, actorUserId: user.user._id };
}

function designInput(extra = {}) {
  return {
    shopId: String(shop._id),
    name: 'Navy mug mark',
    catalogProductId: String(product._id),
    artworkTicketId: extra.artworkTicketId || 'ticket-placeholder',
    decorationArea: 'Front',
    placement: { centerXPercent: 50, centerYPercent: 40, widthPercent: 30, rotationDeg: 0 },
    variant: { sku: 'MUG-NAVY-M', color: 'Navy', size: 'M' },
    ...extra,
  };
}

async function uploadArtwork({ owner = admin, workspace = tenant, png = ARTWORK_PNG, name = 'mark.png' } = {}) {
  const prepared = await prepareProductArtworkUpload({
    ...actorOf({ ...owner, tenantId: workspace._id }),
    input: { originalName: name },
  });
  const completed = await completeShopAssetUpload({
    ticketId: prepared.ticketId,
    uploadToken: prepared.uploadToken,
    file: { buffer: png, originalname: name, mimetype: 'image/png' },
  });
  return { prepared, completed };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  clearTenantLimitCache();
  tenant = await makeTenant({ slug: 'artwork-a' });
  otherTenant = await makeTenant({ slug: 'artwork-b' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  manager = await makeUser(tenant, 'entity_manager', 'tenant');
  otherAdmin = await makeUser(otherTenant, 'company_admin', 'tenant');
  shop = await Shop.create({
    tenantId: tenant._id,
    name: 'HQ Store',
    slug: `hq-art-${Date.now()}`,
    status: 'live',
    activeListingKeys: ['keep:listing'],
  });
  otherShop = await Shop.create({
    tenantId: otherTenant._id,
    name: 'Other Store',
    slug: `other-art-${Date.now()}`,
    status: 'live',
    activeListingKeys: ['keep:other'],
  });
  product = await CatalogProduct.create({
    sku: `SM-ART-${Date.now()}`,
    name: 'Desk Mug',
    category: 'Drinkware',
    group: 'mug',
    basePriceInr: 400,
    baseImageUrl: 'https://cdn.test/mug-base.png',
    printAreas: [{ key: 'front', label: 'Front', widthIn: 3, heightIn: 3 }],
    variants: [
      { sku: 'MUG-NAVY-M', color: 'Navy', size: 'M', enabled: true },
      { sku: 'MUG-NAVY-S', color: 'Navy', size: 'S', enabled: false },
    ],
  });
});

describe('product artwork MCP', () => {
  it('keeps the new ChatGPT tools off the embedded copilot catalog', () => {
    for (const name of [
      'products_prepare_artwork_upload',
      'products_get_artwork_upload',
      'products_prepare_design',
      'products_execute_design',
    ]) {
      expect(COPILOT_MCP_TOOL_NAMES).not.toContain(name);
    }
  });

  it('rejects a non-admin and does not create an upload ticket', async () => {
    await expect(prepareProductArtworkUpload({
      ...actorOf({ ...manager, tenantId: tenant._id }),
      input: {},
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...manager, tenantId: tenant._id }),
      input: designInput({ artworkTicketId: '0123456789abcdef' }),
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await McpShopAssetTicket.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('issues a browser upload link and refuses to start product artwork from the store logo tool', async () => {
    const prepared = await prepareProductArtworkUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { originalName: 'mark.png' },
    });
    expect(prepared.kind).toBe('product_artwork');
    expect(prepared.uploadPageUrl).toContain(`#uploadToken=${encodeURIComponent(prepared.uploadToken)}`);
    expect(prepared.uploadPageUrl.split('#')[0]).not.toContain('uploadToken');
    expect(prepared.instructions).toContain('ChatGPT cannot forward');
    expect(prepared.assetUrl).toBeUndefined();

    const page = await request(app).get(`/api/v1/mcp/shop-assets/${prepared.ticketId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Upload product artwork');
    expect(page.text).toContain('Product artwork PNG');
    expect(page.text).toContain('accept=".png,image/png"');
    expect(page.text).not.toContain(prepared.uploadToken);

    await completeShopAssetUpload({
      ticketId: prepared.ticketId,
      uploadToken: prepared.uploadToken,
      file: { buffer: ARTWORK_PNG, originalname: 'mark.png', mimetype: 'image/png' },
    });
    const done = await request(app).get(`/api/v1/mcp/shop-assets/${prepared.ticketId}`);
    expect(done.status).toBe(200);
    expect(done.text).toContain('products_prepare_design');
    expect(done.text).toContain('not saved until you confirm');

    await expect(prepareShopAssetUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { kind: 'product_artwork' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects a non-PNG and a low-DPI PNG without storing an asset', async () => {
    const badType = await prepareProductArtworkUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: {},
    });
    await expect(completeShopAssetUpload({
      ticketId: badType.ticketId,
      uploadToken: badType.uploadToken,
      file: { buffer: Buffer.from('not-a-png'), originalname: 'logo.jpg', mimetype: 'image/jpeg' },
    })).rejects.toMatchObject({ code: 'INVALID_ARTWORK' });

    const lowDpi = await prepareProductArtworkUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: {},
    });
    await expect(completeShopAssetUpload({
      ticketId: lowDpi.ticketId,
      uploadToken: lowDpi.uploadToken,
      file: { buffer: makePng(2835), originalname: 'soft.png', mimetype: 'image/png' },
    })).rejects.toMatchObject({ code: 'INVALID_ARTWORK' });

    const damaged = await prepareProductArtworkUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: {},
    });
    await expect(completeShopAssetUpload({
      ticketId: damaged.ticketId,
      uploadToken: damaged.uploadToken,
      file: { buffer: Buffer.from('not-a-png'), originalname: 'mark.png', mimetype: 'image/png' },
    })).rejects.toMatchObject({ code: 'INVALID_ARTWORK' });

    const tickets = await McpShopAssetTicket.find({ tenantId: tenant._id });
    expect(tickets).toHaveLength(3);
    for (const ticket of tickets) {
      expect(ticket.status).toBe('pending');
      expect(ticket.assetUrl || '').toBe('');
    }
  });

  it('hides another tenant ticket and store', async () => {
    const { prepared } = await uploadArtwork();
    await expect(getProductArtworkUpload({
      tenantId: otherTenant._id,
      actorUserId: otherAdmin.user._id,
      ticketId: prepared.ticketId,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(prepareProductArtworkDesign({
      tenantId: otherTenant._id,
      actorUserId: otherAdmin.user._id,
      input: designInput({
        shopId: String(otherShop._id),
        artworkTicketId: prepared.ticketId,
      }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: designInput({
        shopId: String(otherShop._id),
        artworkTicketId: prepared.ticketId,
      }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await Collection.countDocuments({ tenantId: otherTenant._id })).toBe(0);
  });

  it('rejects an unready upload, a logo ticket, a bad area, a bad variant, a bad placement, and an arbitrary URL', async () => {
    const pending = await prepareProductArtworkUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: {},
    });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: designInput({ artworkTicketId: pending.ticketId }),
    })).rejects.toMatchObject({ code: 'ASSET_REQUIRED' });

    const logo = await prepareShopAssetUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { kind: 'logo' },
    });
    await completeShopAssetUpload({
      ticketId: logo.ticketId,
      uploadToken: logo.uploadToken,
      file: { buffer: ARTWORK_PNG, originalname: 'logo.png', mimetype: 'image/png' },
    });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: designInput({ artworkTicketId: logo.ticketId }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const { prepared } = await uploadArtwork();
    const base = designInput({ artworkTicketId: prepared.ticketId });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...base, decorationArea: 'Sleeve' },
    })).rejects.toMatchObject({ code: 'DECORATION_AREA_INVALID' });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...base, variant: { sku: 'MUG-NAVY-S' } },
    })).rejects.toMatchObject({ code: 'VARIANT_INVALID' });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...base, variant: { sku: 'NO-SUCH' } },
    })).rejects.toMatchObject({ code: 'VARIANT_INVALID' });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...base, placement: { centerXPercent: 5, centerYPercent: 50, widthPercent: 20 } },
    })).rejects.toMatchObject({ code: 'PLACEMENT_INVALID' });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...base, placement: { centerXPercent: 50, centerYPercent: 50, widthPercent: 80, rotationDeg: 45 } },
    })).rejects.toMatchObject({ code: 'PLACEMENT_INVALID' });
    await expect(prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...base, artworkUrl: 'https://evil.example/art.png' },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('previews without saving, rejects a bad confirmation, and persists one unpublished draft', async () => {
    const { prepared, completed } = await uploadArtwork();
    const input = designInput({ artworkTicketId: prepared.ticketId });
    const preview = await prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input,
    });
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(preview.preview).toMatchObject({
      action: 'create',
      status: 'draft',
      published: false,
      bakedMockup: false,
      artworkUrl: completed.assetUrl,
      productImageUrl: 'https://cdn.test/mug-base.png',
      decorationArea: { key: 'front', label: 'Front' },
      placement: { printCxPct: 50, printCyPct: 40, printWPct: 30, rot: 0 },
      variant: { sku: 'MUG-NAVY-M', color: 'Navy', size: 'M' },
    });
    expect(preview.preview.artworkUrl).toMatch(/^\/uploads\//);
    expect(preview.confirmationId).toBeTruthy();

    await expect(executeProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input,
      confirmationId: 'not-a-real-confirmation-token',
      idempotencyKey: 'art-missing-confirm',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

    await expect(executeProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...input, placement: { ...input.placement, widthPercent: 20 } },
      confirmationId: preview.confirmationId,
      idempotencyKey: 'art-mismatch',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);

    product.printAreas[0].key = 'chest';
    await product.save();
    await expect(executeProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input,
      confirmationId: preview.confirmationId,
      idempotencyKey: 'art-stale',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });
    product.printAreas[0].key = 'front';
    await product.save();

    const fresh = await prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input,
    });
    const saved = await executeProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input,
      confirmationId: fresh.confirmationId,
      idempotencyKey: 'art-save-1',
    });
    expect(saved).toMatchObject({
      name: 'Navy mug mark',
      status: 'draft',
      published: false,
      bakedMockup: false,
      artworkUrl: completed.assetUrl,
      shopId: String(shop._id),
      catalogProductId: String(product._id),
    });
    expect(saved.mockupUrl).toBeUndefined();

    const stored = await Collection.findOne({ _id: saved.id, tenantId: tenant._id });
    expect(stored.status).toBe('draft');
    expect(stored.shopId).toBeFalsy();
    expect(stored.shopIds).toEqual([]);
    expect(stored.artworkUrl).toBe(completed.assetUrl);
    expect(stored.preferredColors).toEqual(['Navy']);
    expect(stored.productRefs).toHaveLength(1);
    expect(stored.productRefs[0].mockupUrl || '').toBe('');
    expect(stored.productRefs[0].inheritArtwork).toBe(false);
    expect(stored.productRefs[0].placement).toMatchObject({
      printCxPct: 50, printCyPct: 40, printWPct: 30, rot: 0,
    });
    expect(stored.productRefs[0].placements[0]).toMatchObject({
      key: 'front',
      artworkUrl: completed.assetUrl,
      printWPct: 30,
    });

    const onDisk = await fs.readFile(path.join(apiRoot, completed.assetUrl.replace(/^\//, '')));
    expect(Buffer.compare(onDisk, ARTWORK_PNG)).toBe(0);

    const liveShop = await Shop.findOne({ _id: shop._id, tenantId: tenant._id });
    expect(liveShop.activeListingKeys).toEqual(['keep:listing']);
    const foreignShop = await Shop.findOne({ _id: otherShop._id, tenantId: otherTenant._id });
    expect(foreignShop.activeListingKeys).toEqual(['keep:other']);

    const again = await executeProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input,
      confirmationId: fresh.confirmationId,
      idempotencyKey: 'art-save-1',
    });
    expect(again.id).toBe(saved.id);
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);

    const ticket = await getProductArtworkUpload({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      ticketId: prepared.ticketId,
    });
    expect(ticket.status).toBe('consumed');
    expect(ticket.assetUrl).toBe(completed.assetUrl);

    const moved = await prepareProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...input, placement: { ...input.placement, widthPercent: 20 } },
    });
    await expect(executeProductArtworkDesign({
      ...actorOf({ ...admin, tenantId: tenant._id }),
      input: { ...input, placement: { ...input.placement, widthPercent: 20 } },
      confirmationId: moved.confirmationId,
      idempotencyKey: 'art-save-2',
    })).rejects.toMatchObject({ code: 'COLLECTION_EXISTS' });
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
  });
});
