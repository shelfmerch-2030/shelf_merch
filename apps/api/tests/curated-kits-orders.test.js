import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as ledger from '../src/services/ledger.service.js';

let app;
let tenant;
let entity;
let managerToken;
let adminToken;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix-curated' });

  const admin = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: 'admin-curated@test.io',
    status: 'active',
  });
  const adminAssignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: admin._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  adminToken = signAccessToken(admin, adminAssignment);

  const manager = await User.create({
    tenantId: tenant._id,
    name: 'Priya',
    email: 'priya-curated@test.io',
    status: 'active',
  });
  const mgrAssignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: manager._id,
    role: 'entity_manager',
    scopeType: 'entity',
    assignedEntityIds: [],
  });

  const wallet = await Wallet.create({ tenantId: tenant._id, name: 'Budget' });
  await ledger.createTransaction({
    tenantId: tenant._id,
    walletId: wallet._id,
    type: 'fund_in',
    amount: 500_000,
  });
  entity = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: 'Marketing' });
  await ledger.createTransaction({
    tenantId: tenant._id,
    walletId: wallet._id,
    type: 'allocation_to_entity',
    amount: 100_000,
    relatedEntityId: entity._id,
  });

  mgrAssignment.scopeId = entity._id;
  mgrAssignment.assignedEntityIds = [entity._id];
  await mgrAssignment.save();
  managerToken = signAccessToken(manager, mgrAssignment);

  await Shop.create({ tenantId: tenant._id, name: 'Rubix Store', status: 'live' });
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

function curatedNotes(platformKit) {
  return JSON.stringify({
    curated: true,
    originalId: String(platformKit._id),
    description: platformKit.description || '',
    approxValueInr: Math.round(Number(platformKit.approxValueInr) || 0),
    imageUrls: platformKit.imageUrls || [],
    heroImage: platformKit.heroImage || platformKit.imageUrls?.[0] || '',
    itemImages: platformKit.itemImages || [],
  });
}

describe('curated kits — clone, pricing, surprise fulfillment', () => {
  it('clones a Shopify curated platform kit without inventing tenant productRefs', async () => {
    const platformKit = await PlatformKit.create({
      name: 'Welcome Aboard Kit',
      approxValueInr: 1899,
      status: 'active',
      items: [],
      heroImage: '/uploads/kits/hero.png',
      itemImages: [
        { imageUrl: '/uploads/kits/mug.png', label: 'Mug' },
        { imageUrl: '/uploads/kits/notebook.png', label: 'Notebook' },
      ],
      source: { provider: 'shopify', externalId: 'gid://shopify/Product/99', handle: 'welcome' },
    });

    const cloned = await request(app)
      .post(`/api/v1/kits/from-platform/${platformKit._id}`)
      .set(auth(managerToken))
      .send({});
    expect(cloned.status).toBe(201);
    expect(cloned.body.productRefs).toEqual([]);
    expect(cloned.body.kitPrice).toBe(1899);
    expect(cloned.body.artworkUrl).toBe('/uploads/kits/hero.png');

    const meta = JSON.parse(cloned.body.designNotes);
    expect(meta.curated).toBe(true);
    expect(meta.originalId).toBe(String(platformKit._id));
    expect(meta.itemImages).toHaveLength(2);
    expect(meta.requireLogo).toBe(true);

    const reuse = await request(app)
      .post(`/api/v1/kits/from-platform/${platformKit._id}`)
      .set(auth(managerToken))
      .send({});
    expect(reuse.status).toBe(200);
    expect(reuse.body._id).toBe(cloned.body._id);
  });

  it('snapshots requireLogo:false and syncs it onto an existing curated clone', async () => {
    const platformKit = await PlatformKit.create({
      name: 'No Logo Bundle',
      approxValueInr: 999,
      status: 'active',
      items: [],
      heroImage: '/uploads/kits/nologo.png',
      rules: {
        fixedComposition: true,
        customizationAllowed: true,
        requireLogo: false,
        minQtyPerRecipient: 1,
        maxQtyPerRecipient: 1,
      },
      source: { provider: 'shopify', externalId: 'gid://shopify/Product/nologo', handle: 'nologo' },
    });

    const cloned = await request(app)
      .post(`/api/v1/kits/from-platform/${platformKit._id}`)
      .set(auth(managerToken))
      .send({});
    expect(cloned.status).toBe(201);
    expect(JSON.parse(cloned.body.designNotes).requireLogo).toBe(false);

    // Simulate a legacy clone that never stored requireLogo.
    const meta = JSON.parse(cloned.body.designNotes);
    delete meta.requireLogo;
    await Kit.updateOne(
      { _id: cloned.body._id, tenantId: tenant._id },
      { designNotes: JSON.stringify(meta) },
    );

    const synced = await request(app)
      .post(`/api/v1/kits/from-platform/${platformKit._id}`)
      .set(auth(managerToken))
      .send({});
    expect(synced.status).toBe(200);
    expect(synced.body._id).toBe(cloned.body._id);
    expect(JSON.parse(synced.body.designNotes).requireLogo).toBe(false);
  });

  it('surprise launch creates curated order lines and charges approxValueInr', async () => {
    const platformKit = await PlatformKit.create({
      name: 'Diwali Bundle',
      approxValueInr: 2100,
      status: 'active',
      items: [],
      heroImage: '/uploads/kits/diwali.png',
      itemImages: [{ imageUrl: '/uploads/kits/box.png', label: 'Gift box' }],
    });

    const kit = await Kit.create({
      tenantId: tenant._id,
      name: platformKit.name,
      productRefs: [],
      kitPrice: 2100,
      status: 'live',
      packaging: 'box',
      artworkUrl: platformKit.heroImage,
      designNotes: curatedNotes(platformKit),
    });

    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Alice',
      email: 'alice-curated@test.io',
      address: {
        line1: '12 Lake View',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        country: 'IN',
      },
    });

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set(auth(managerToken))
      .send({
        entityId: String(entity._id),
        name: 'Curated surprise send',
        type: 'kit',
        fulfillmentMode: 'surprise',
        kitId: String(kit._id),
        message: { from: 'Rubix', body: 'Enjoy!' },
        schedule: { mode: 'now' },
      });
    expect(created.status).toBe(201);
    const id = created.body._id;

    const imported = await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set(auth(managerToken))
      .send({
        recipients: [
          {
            contactId: String(contact._id),
            name: contact.name,
            email: contact.email,
          },
        ],
        packaging: 'box',
      });
    expect(imported.status).toBe(200);
    expect(imported.body.campaign.totalBudget).toBeGreaterThan(0);

    const entityBefore = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const expectedSpend = Math.round(imported.body.campaign.totalBudget);

    const launch = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set(auth(managerToken))
      .set('Idempotency-Key', `launch-curated-surprise-${id}`);
    expect(launch.status).toBe(200);
    expect(launch.body.status).toBe('redemption_open');

    const entityAfter = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    expect(entityAfter.spentAmount - entityBefore.spentAmount).toBe(expectedSpend);

    const order = await Order.findOne({ tenantId: tenant._id, campaignId: id });
    expect(order).toBeTruthy();
    expect(order.items).toHaveLength(1);
    expect(order.items[0].catalogProductId).toBeFalsy();
    expect(order.items[0].unitPriceInr).toBe(2100);
    expect(order.items[0].name).toBe('Diwali Bundle');
    expect(order.shippingAddress.pincode).toBe('560001');

    const recipient = await Recipient.findOne({ tenantId: tenant._id, campaignId: id });
    expect(recipient.redemptionStatus).toBe('order_created');
  });

  it('does not debit wallet when surprise fulfillment fails before launch charge', async () => {
    // Non-curated kit with no active product refs → KIT_EMPTY during order create.
    const kit = await Kit.create({
      tenantId: tenant._id,
      name: 'Broken Kit',
      productRefs: [],
      kitPrice: 500,
      status: 'live',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Bob',
      email: 'bob-curated@test.io',
      address: {
        line1: '1 Main',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
        country: 'IN',
      },
    });

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set(auth(managerToken))
      .send({
        entityId: String(entity._id),
        name: 'Should fail before debit',
        type: 'kit',
        fulfillmentMode: 'surprise',
        kitId: String(kit._id),
        schedule: { mode: 'now' },
      });
    const id = created.body._id;

    await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set(auth(managerToken))
      .send({
        recipients: [
          {
            contactId: String(contact._id),
            name: contact.name,
            email: contact.email,
          },
        ],
      });

    // Force approved + budget so launch would otherwise charge.
    const { Campaign } = await import('../src/modules/campaigns/campaign.model.js');
    await Campaign.updateOne(
      { _id: id, tenantId: tenant._id },
      { $set: { status: 'approved', totalBudget: 500 } },
    );

    const entityBefore = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const walletBefore = await Wallet.findOne({ _id: entity.walletId, tenantId: tenant._id });

    const launch = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set(auth(managerToken))
      .set('Idempotency-Key', `launch-fail-${id}`);
    expect(launch.status).toBeGreaterThanOrEqual(400);

    const entityAfter = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const walletAfter = await Wallet.findOne({ _id: entity.walletId, tenantId: tenant._id });
    expect(entityAfter.spentAmount).toBe(entityBefore.spentAmount);
    expect(walletAfter.balance).toBe(walletBefore.balance);
    expect(await Order.countDocuments({ tenantId: tenant._id, campaignId: id })).toBe(0);
  });

  it('company admin can also clone curated kits via campaignOps', async () => {
    const platformKit = await PlatformKit.create({
      name: 'Admin Clone Kit',
      approxValueInr: 999,
      status: 'active',
      items: [],
      heroImage: '/uploads/kits/admin.png',
    });

    const cloned = await request(app)
      .post(`/api/v1/kits/from-platform/${platformKit._id}`)
      .set(auth(adminToken))
      .send({});
    expect(cloned.status).toBe(201);
    expect(cloned.body.productRefs).toEqual([]);
  });
});
