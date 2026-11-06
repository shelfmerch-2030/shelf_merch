import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import { makeTenant, makeUser } from './helpers.js';
import { getCuratedKit, getKit, listCuratedKits, listKits } from '../src/modules/mcp/kitsRead.js';

let tenant;
let admin;
let manager;
let finance;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'kit-read' });
  admin = await makeUser(tenant, 'company_admin', 'tenant');
  manager = await makeUser(tenant, 'entity_manager', 'entity');
  finance = await makeUser(tenant, 'company_finance_user', 'tenant');
});

describe('workspace and curated kit reads', () => {
  it('lists customized and curated copies for this workspace only', async () => {
    const product = await CatalogProduct.create({
      sku: 'SM-MUG-1',
      name: 'Desk Mug',
      category: 'Drinkware',
      group: 'mug',
      basePriceInr: 118,
      primaryImageUrl: 'https://cdn.shopify.com/mug.png',
    });
    await Kit.create({
      tenantId: tenant._id,
      name: 'Onboarding Kit',
      description: 'For new hires',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'live',
      kitPrice: 118,
      artworkUrl: 'https://cdn.shopify.com/kit.png',
    });
    await Kit.create({
      tenantId: tenant._id,
      name: 'Archived Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'archived',
      kitPrice: 118,
    });
    const other = await makeTenant({ slug: 'other-kits' });
    await Kit.create({
      tenantId: other._id,
      name: 'Secret Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Desk Mug', brand: '', group: 'mug' }],
      status: 'live',
      kitPrice: 900,
    });

    const listed = await listKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { query: 'onboard' },
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      name: 'Onboarding Kit',
      type: 'customized',
      status: 'live',
      itemCount: 1,
      priceInr: 118,
      imageUrl: 'https://cdn.shopify.com/kit.png',
      sendEligible: true,
    });
    expect(JSON.stringify(listed)).not.toContain('Secret Kit');

    const detail = await getKit({
      tenantId: tenant._id,
      user: { role: 'entity_manager', userId: manager.user._id },
      kitId: listed.items[0].id,
    });
    expect(detail.products).toEqual([
      expect.objectContaining({ name: 'Desk Mug', quantity: 1, imageUrl: 'https://cdn.shopify.com/mug.png' }),
    ]);
    await expect(getKit({
      tenantId: other._id,
      user: { role: 'company_admin', userId: admin.user._id },
      kitId: listed.items[0].id,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listKits({
      tenantId: tenant._id,
      user: { role: 'company_finance_user', userId: finance.user._id },
    })).rejects.toMatchObject({ status: 403 });
  });

  it('lists active curated kits by name and budget without copying them', async () => {
    const welcome = await PlatformKit.create({
      name: 'Welcome Box',
      description: 'Onboarding gifts',
      status: 'active',
      approxValueInr: 1500,
      heroImage: 'https://cdn.shopify.com/welcome.png',
      items: [],
      itemImages: [{ imageUrl: 'https://cdn.shopify.com/notebook.png', label: 'Notebook' }],
      rules: { requireLogo: false },
    });
    await PlatformKit.create({
      name: 'Executive Box',
      description: 'Leadership',
      status: 'active',
      approxValueInr: 4000,
      heroImage: 'https://cdn.shopify.com/exec.png',
    });
    await PlatformKit.create({
      name: 'Hidden Draft',
      status: 'draft',
      approxValueInr: 100,
    });

    const listed = await listCuratedKits({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      input: { query: 'onboarding', maxPriceInr: 1500 },
    });
    expect(listed.items.map((kit) => kit.name)).toEqual(['Welcome Box']);
    expect(listed.items[0]).toMatchObject({
      type: 'curated',
      priceInr: 1500,
      itemCount: 1,
      requireLogo: false,
      imageUrl: 'https://cdn.shopify.com/welcome.png',
    });
    expect(await Kit.countDocuments({ tenantId: tenant._id })).toBe(0);

    const detail = await getCuratedKit({
      tenantId: tenant._id,
      user: { role: 'entity_manager', userId: manager.user._id },
      platformKitId: String(welcome._id),
    });
    expect(detail.products).toEqual([
      expect.objectContaining({ name: 'Notebook', quantity: 1 }),
    ]);
    await expect(getCuratedKit({
      tenantId: tenant._id,
      user: { role: 'company_admin', userId: admin.user._id },
      platformKitId: '6a82b7d8a03ad62bdb7f3bc9',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
