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
import { Collection } from '../src/modules/collections/collection.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Contact } from '../src/modules/contacts/contact.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as ledger from '../src/services/ledger.service.js';

let app;
let tenant;
let entity;
let shop;
let product;
let adminToken;
let managerToken;
let managerUser;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix' });
  const admin = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: 'admin@test.io',
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: admin._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  adminToken = signAccessToken(admin, assignment);

  managerUser = await User.create({
    tenantId: tenant._id,
    name: 'Priya',
    email: 'priya@test.io',
    status: 'active',
  });
  const mgrAssignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: managerUser._id,
    role: 'entity_manager',
    scopeType: 'entity',
    assignedEntityIds: [],
  });

  const wallet = await Wallet.create({ tenantId: tenant._id, name: 'Budget' });
  await ledger.createTransaction({ tenantId: tenant._id, walletId: wallet._id, type: 'fund_in', amount: 500_000 });
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
  managerToken = signAccessToken(managerUser, mgrAssignment);

  shop = await Shop.create({ tenantId: tenant._id, name: 'Rubix Dubai', status: 'live', categories: ['Merch'] });
  product = await CatalogProduct.create({
    sku: 'SM-TEE-TEST',
    name: 'Test Tee',
    category: 'Apparel',
    group: 'tee',
    basePriceInr: 500,
  });
});

describe('campaign lifecycle (§11.1)', () => {
  it('create → recipients → allocate → launch debits entity budget', async () => {
    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entityId: String(entity._id), name: 'Diwali 2026', type: 'points', shopId: String(shop._id) });
    expect(created.status).toBe(201);
    const id = created.body._id;

    await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        recipients: [
          { name: 'Alice', email: 'alice@test.io' },
          { name: 'Bob', email: 'bob@test.io' },
        ],
      });

    const alloc = await request(app)
      .post(`/api/v1/campaigns/${id}/allocate-credits`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ creditsPerRecipient: 2000 });
    expect(alloc.status).toBe(200);
    expect(alloc.body.totalBudget).toBe(4000);

    const entityBefore = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const key = 'launch-campaign-once';
    const launch1 = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', key);
    expect(launch1.status).toBe(200);
    expect(launch1.body.status).toBe('redemption_open');

    const launch2 = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', key);
    expect(launch2.headers['idempotent-replay']).toBe('true');

    const entityAfter = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    expect(entityAfter.spentAmount - entityBefore.spentAmount).toBe(4000);
  });

  it('kit send → recipients → launch debits wallet for kit grand total', async () => {
    const kit = await Kit.create({
      tenantId: tenant._id,
      name: 'Welcome Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Test Tee', brand: '', group: 'tee' }],
      kitPrice: 500,
      packaging: 'none',
      status: 'live',
    });

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        entityId: String(entity._id),
        name: 'Onboarding kit',
        type: 'kit',
        kitId: String(kit._id),
        message: { from: 'People Team', body: 'Your welcome kit is ready!' },
        schedule: { mode: 'now' },
      });
    expect(created.status).toBe(201);
    const id = created.body._id;

    const imported = await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        recipients: [{ name: 'Alice', email: 'alice@test.io' }],
        packaging: 'none',
      });
    expect(imported.status).toBe(200);
    expect(imported.body.campaign.status).toBe('approved');
    expect(imported.body.campaign.totalBudget).toBeGreaterThan(0);

    const entityBefore = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const walletBefore = await Wallet.findOne({ _id: entity.walletId, tenantId: tenant._id });
    const expectedSpend = Math.round(imported.body.campaign.totalBudget);

    const launch = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', `launch-kit-${id}`);
    expect(launch.status).toBe(200);
    expect(launch.body.status).toBe('redemption_open');

    const entityAfter = await Entity.findOne({ _id: entity._id, tenantId: tenant._id });
    const walletAfter = await Wallet.findOne({ _id: entity.walletId, tenantId: tenant._id });
    expect(entityAfter.spentAmount - entityBefore.spentAmount).toBe(expectedSpend);
    expect(walletBefore.balance - walletAfter.balance).toBe(expectedSpend);

    const updatedKit = await Kit.findOne({ _id: kit._id, tenantId: tenant._id });
    expect(updatedKit.lastSentAt).toBeTruthy();
  });

  it('scheduled points send debits wallet immediately but defers email and credits', async () => {
    const sendAt = new Date(Date.now() + 60_000);
    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        entityId: String(entity._id),
        name: 'Scheduled Diwali',
        type: 'points',
        shopId: String(shop._id),
        schedule: { mode: 'scheduled', sendAt, timezone: 'Asia/Kolkata' },
      });
    expect(created.status).toBe(201);
    const id = created.body._id;

    await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ recipients: [{ name: 'Alice', email: 'alice-sched@test.io' }] });

    await request(app)
      .post(`/api/v1/campaigns/${id}/allocate-credits`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ creditsPerRecipient: 500 });

    const recipientBefore = await Recipient.findOne({
      tenantId: tenant._id,
      campaignId: id,
    });
    expect(recipientBefore.creditAmount).toBe(0);

    const walletBefore = await Wallet.findOne({ _id: entity.walletId, tenantId: tenant._id });
    const launch = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', `launch-sched-${id}`);
    expect(launch.status).toBe(200);
    expect(launch.body.status).toBe('launched');

    const walletAfter = await Wallet.findOne({ _id: entity.walletId, tenantId: tenant._id });
    expect(walletBefore.balance - walletAfter.balance).toBe(500);
    expect(
      (await Recipient.findOne({ _id: recipientBefore._id, tenantId: tenant._id })).creditAmount,
    ).toBe(0);

    // Make due and recover overdue schedule.
    await Campaign.updateOne(
      { _id: id, tenantId: tenant._id },
      { $set: { 'schedule.sendAt': new Date(Date.now() - 1000) } },
    );
    const { processDueScheduledCampaigns } = await import(
      '../src/modules/campaigns/campaigns.service.js'
    );
    const results = await processDueScheduledCampaigns({ limit: 10 });
    expect(results.some((r) => r.id === String(id) && r.ok)).toBe(true);

    const delivered = await Campaign.findOne({ _id: id, tenantId: tenant._id });
    expect(delivered.status).toBe('redemption_open');
    expect(delivered.schedule.invitesSentAt).toBeTruthy();
    expect(
      (await Recipient.findOne({ _id: recipientBefore._id, tenantId: tenant._id })).creditAmount,
    ).toBe(500);
  });

  it('surprise kit send creates an order from the saved contact address without redemption', async () => {
    const kit = await Kit.create({
      tenantId: tenant._id,
      name: 'Surprise Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Test Tee', brand: '', group: 'tee' }],
      status: 'live',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      name: 'Alice',
      email: 'alice@test.io',
      address: {
        line1: '123 Street',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
        country: 'IN',
      },
    });

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        entityId: String(entity._id),
        name: 'Surprise onboarding kit',
        type: 'kit',
        fulfillmentMode: 'surprise',
        kitId: String(kit._id),
        message: { from: 'Rubix', body: 'A surprise is on the way!' },
        schedule: { mode: 'now' },
      });
    const id = created.body._id;

    await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        recipients: [
          {
            contactId: String(contact._id),
            name: contact.name,
            email: contact.email,
          },
        ],
      });

    const launch = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', `launch-surprise-${id}`);
    expect(launch.status).toBe(200);
    expect(launch.body.fulfillmentMode).toBe('surprise');

    const recipient = await Recipient.findOne({ tenantId: tenant._id, campaignId: id });
    expect(recipient.redemptionStatus).toBe('order_created');

    const order = await Order.findOne({ tenantId: tenant._id, recipientId: recipient._id });
    expect(order.shippingAddress.line1).toBe('123 Street');
    expect(order.shippingAddress.pincode).toBe('500001');
    expect(order.items).toHaveLength(1);
    expect(order.items[0].variant.size).toBe('');

    const portal = await request(app).get(`/api/v1/redemptions/${recipient.redemptionToken}`);
    expect(portal.status).toBe(409);
    expect(portal.body.error.code).toBe('ALREADY_REDEEMED');
  });

  it('single-location kit send creates one consolidated order at the entered address', async () => {
    const kit = await Kit.create({
      tenantId: tenant._id,
      name: 'Office Kit',
      productRefs: [{ catalogProductId: product._id, name: 'Test Tee', brand: '', group: 'tee' }],
      status: 'live',
    });

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        entityId: String(entity._id),
        name: 'Office delivery',
        type: 'kit',
        fulfillmentMode: 'single',
        kitId: String(kit._id),
        singleLocation: {
          name: 'Rubix Hyderabad Office',
          email: 'office@rubix.test',
          phone: '+91 90000 00000',
          line1: '1 Corporate Park',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500081',
          country: 'IN',
        },
        schedule: { mode: 'now' },
      });
    const id = created.body._id;

    await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        recipients: [
          { name: 'Alice', email: 'alice@test.io' },
          { name: 'Bob', email: 'bob@test.io' },
        ],
      });

    const launch = await request(app)
      .post(`/api/v1/campaigns/${id}/launch`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', `launch-single-${id}`);
    expect(launch.status).toBe(200);
    expect(launch.body.fulfillmentMode).toBe('single');

    const orders = await Order.find({ tenantId: tenant._id, campaignId: id });
    expect(orders).toHaveLength(1);
    expect(orders[0].shippingAddress.name).toBe('Rubix Hyderabad Office');
    expect(orders[0].shippingAddress.line1).toBe('1 Corporate Park');
    expect(orders[0].items[0].qty).toBe(2);

    const recipients = await Recipient.find({ tenantId: tenant._id, campaignId: id });
    expect(recipients.every((r) => r.redemptionStatus === 'order_created')).toBe(true);
  });
});

describe('redemption portal (§11.1)', () => {
  it('full flow: portal → OTP → submit → order within credit limit', async () => {
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Test Campaign',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      creditsPerRecipient: 5000,
      totalBudget: 5000,
      recipientCount: 1,
    });
    const token = 'testRedemptionTokenRubixTest26!';
    const recipient = await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Alice',
      email: 'alice@test.io',
      phone: '+91 99999 99999',
      creditAmount: 5000,
      redemptionToken: token,
      redemptionStatus: 'invited',
    });

    const portal = await request(app).get(`/api/v1/redemptions/${token}`);
    expect(portal.status).toBe(200);
    expect(portal.body.recipient.creditAmount).toBe(5000);

    const otpSend = await request(app)
      .post(`/api/v1/redemptions/${token}/send-otp`)
      .send({ contact: 'alice@test.io' });
    expect(otpSend.status).toBe(200);

    // OTP is logged in dev — read from recipient after send (test-only shortcut).
    const withOtp = await Recipient.findOne({ redemptionToken: token })
      .setOptions({ skipTenantGuard: true })
      .select('+otpHash');
    expect(withOtp.otpHash).toBeTruthy();

    // Brute-force verify by mocking: set verified directly for OTP step isolation in separate test
    // Here we use verify with wrong code first, then fix by re-sending isn't practical.
    // Instead transition to verified in DB and use session path — test verify via known hash:
    const crypto = await import('node:crypto');
    const code = '123456';
    withOtp.otpHash = crypto.createHash('sha256').update(code).digest('hex');
    withOtp.otpExpiresAt = new Date(Date.now() + 600_000);
    withOtp.otpAttempts = 0;
    await withOtp.save();

    const verified = await request(app)
      .post(`/api/v1/redemptions/${token}/verify-otp`)
      .send({ code });
    expect(verified.status).toBe(200);
    expect(verified.body.sessionToken).toBeTruthy();
    const sessionToken = verified.body.sessionToken;

    const over = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Idempotency-Key', 'submit-1')
      .send({
        items: [{ productId: String(product._id), qty: 20 }],
        shippingAddress: {
          name: 'Alice',
          phone: '+91 99999 99999',
          line1: '123 Street',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      });
    expect(over.status).toBe(422);

    const submit = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Idempotency-Key', 'submit-2')
      .send({
        items: [{ productId: String(product._id), qty: 2 }],
        shippingAddress: {
          name: 'Alice',
          phone: '+91 99999 99999',
          line1: '123 Street',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      });
    expect(submit.status).toBe(201);
    expect(submit.body.orderNumber).toMatch(/^SM-/);

    const track = await request(app).get(`/api/v1/redemptions/${token}/track`);
    expect(track.status).toBe(200);
    expect(track.body.status).toBe('created');

    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(1);
    // Pooled points: the redemption stays open ('verified') so the recipient
    // can keep ordering against remaining credit; submit reports what's left.
    const updated = await Recipient.findOne({ _id: recipient._id, tenantId: tenant._id });
    expect(updated.redemptionStatus).toBe('verified');
    expect(typeof submit.body.remainingCredit).toBe('number');
    expect(submit.body.remainingCredit).toBeLessThanOrEqual(4000);
    expect(submit.body.remainingCredit).toBeGreaterThanOrEqual(0);
  });

  it('aggregates open point credits across multiple sends to the same employee', async () => {
    const tokenA = 'aggregatePointsTokenCampaignA123456!';
    const tokenB = 'aggregatePointsTokenCampaignB123456!';

    const campaignA = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'First Points Send',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      creditsPerRecipient: 2500,
    });
    const campaignB = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Second Points Send',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      creditsPerRecipient: 100,
    });

    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaignA._id,
      name: 'Sushant',
      email: 'sushant@test.io',
      creditAmount: 2500,
      redemptionToken: tokenA,
      redemptionStatus: 'verified',
      invitedAt: new Date('2026-07-05'),
    });
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaignB._id,
      name: 'Sushant',
      email: 'sushant@test.io',
      creditAmount: 100,
      redemptionToken: tokenB,
      redemptionStatus: 'verified',
      invitedAt: new Date('2026-07-06'),
    });

    const portalA = await request(app).get(`/api/v1/redemptions/${tokenA}`);
    expect(portalA.status).toBe(200);
    expect(portalA.body.recipient.creditAmount).toBe(2600);

    const portalB = await request(app).get(`/api/v1/redemptions/${tokenB}`);
    expect(portalB.status).toBe(200);
    expect(portalB.body.recipient.creditAmount).toBe(2600);

    const campaignC = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Unopened send',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      creditsPerRecipient: 100,
    });
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaignC._id,
      name: 'Sushant',
      email: 'sushant@test.io',
      creditAmount: 100,
      redemptionToken: 'unopenedPointsTokenCampaignC12!',
      redemptionStatus: 'invited',
    });

    const portalAfterUnopened = await request(app).get(`/api/v1/redemptions/${tokenA}`);
    expect(portalAfterUnopened.body.recipient.creditAmount).toBe(2600);
  });

  it('store order item image is the baked design mockup, not the bare mask', async () => {
    await Collection.create({
      tenantId: tenant._id,
      shopId: shop._id,
      shopIds: [shop._id],
      code: 'C900000001',
      name: 'Mockup Collection',
      status: 'ready',
      artworkUrl: '/uploads/test/art.png',
      productRefs: [
        {
          catalogProductId: product._id,
          name: 'Test Tee',
          brand: '',
          group: 'tee',
          mockupUrl: '/uploads/test/baked-mockup.png',
        },
      ],
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Mockup Campaign',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      creditsPerRecipient: 5000,
      totalBudget: 5000,
      recipientCount: 1,
    });
    const token = 'mockupOrderTokenRubixTest2026!!';
    const recipient = await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Bob',
      email: 'bob@test.io',
      phone: '+91 88888 88888',
      creditAmount: 5000,
      redemptionToken: token,
      redemptionStatus: 'verified',
    });

    const { signRedemptionSession } = await import('../src/modules/redemptions/redemptions.service.js');
    const sessionToken = signRedemptionSession(recipient);

    const submit = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Idempotency-Key', 'mockup-submit-1')
      .send({
        items: [{ productId: String(product._id), qty: 1 }],
        shippingAddress: {
          name: 'Bob',
          phone: '+91 88888 88888',
          line1: '1 Road',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      });
    expect(submit.status).toBe(201);

    const order = await Order.findOne({ recipientId: recipient._id, tenantId: tenant._id });
    expect(order.items[0].imageUrl).toBe('/uploads/test/baked-mockup.png');
  });

  it('kit flow: view kit → size for apparel only → accept order without credit check', async () => {
    const bottle = await CatalogProduct.create({
      sku: 'SM-BOTTLE-TEST',
      name: 'Work Well Bottle',
      category: 'Drinkware',
      group: 'bottle',
      basePriceInr: 320,
      variants: [{ size: 'S', color: 'White', sku: 'BTL-S' }],
      primaryImageUrl: '/uploads/platform/product/bottle.png',
    });
    const tee = await CatalogProduct.create({
      sku: 'SM-HOODIE-TEST',
      name: 'Forge Hoodie',
      category: 'Apparel',
      group: 'hoodie',
      basePriceInr: 1200,
      maskImageUrl: '/uploads/platform/product/hoodie-mask.png',
      variants: [
        { size: 'M', sku: 'HOODIE-M' },
        { size: 'L', sku: 'HOODIE-L' },
      ],
    });
    const jockey = await CatalogProduct.create({
      sku: 'SM-TEE-JOCKEY',
      name: 'Jockey',
      category: 'Apparel',
      group: 'tee',
      basePriceInr: 500,
      maskImageUrl: '/uploads/platform/product/tee-mask.png',
      variants: [
        { size: 'L', sku: 'JOCKEY-L' },
        { size: 'XL', sku: 'JOCKEY-XL' },
      ],
    });
    const kit = await Kit.create({
      tenantId: tenant._id,
      name: 'Welcome Kit',
      artworkUrl: '/uploads/tenant/artwork/logo.png',
      productRefs: [
        { catalogProductId: bottle._id, name: 'Work Well Bottle', group: 'bottle' },
        { catalogProductId: tee._id, name: 'Forge Hoodie', group: 'hoodie' },
        { catalogProductId: jockey._id, name: 'Jockey', group: 'tee' },
      ],
      status: 'live',
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Welcome Kit Send',
      type: 'kit',
      kitId: kit._id,
      status: 'redemption_open',
      recipientCount: 1,
    });
    const token = 'kitAcceptTokenRubixTest2026!!';
    const recipient = await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Alice',
      email: 'alice@test.io',
      phone: '+91 99999 99999',
      creditAmount: 0,
      redemptionToken: token,
      redemptionStatus: 'verified',
    });

    const portal = await request(app).get(`/api/v1/redemptions/${token}`);
    expect(portal.status).toBe(200);
    expect(portal.body.campaign.type).toBe('kit');

    const { signRedemptionSession } = await import('../src/modules/redemptions/redemptions.service.js');
    const sessionToken = signRedemptionSession(recipient);

    const kitView = await request(app)
      .get(`/api/v1/redemptions/${token}/kit`)
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(kitView.status).toBe(200);
    expect(kitView.body.items).toHaveLength(3);
    const bottleItem = kitView.body.items.find((i) => i.name === 'Work Well Bottle');
    const hoodieItem = kitView.body.items.find((i) => i.name === 'Forge Hoodie');
    const jockeyItem = kitView.body.items.find((i) => i.name === 'Jockey');
    expect(bottleItem.requiresSize).toBe(false);
    expect(bottleItem.requiresColor).toBe(true);
    expect(bottleItem.colors).toContain('White');
    expect(bottleItem.imageUrl).toBe('/uploads/platform/product/bottle.png');
    expect(bottleItem.artworkUrl).toBeTruthy();
    expect(hoodieItem.requiresSize).toBe(true);
    expect(hoodieItem.sizes).toContain('M');
    expect(jockeyItem.requiresSize).toBe(true);
    expect(jockeyItem.sizes).toContain('L');

    const missingSize = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Idempotency-Key', 'kit-submit-missing-size')
      .send({
        items: [
          { productId: String(bottle._id), qty: 1, variant: { color: 'White' } },
          { productId: String(tee._id), qty: 1 },
          { productId: String(jockey._id), qty: 1 },
        ],
        shippingAddress: {
          name: 'Alice',
          phone: '+91 99999 99999',
          line1: '123 Street',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      });
    expect(missingSize.status).toBe(422);
    expect(missingSize.body.error.code).toBe('SIZE_REQUIRED');

    const missingColor = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Idempotency-Key', 'kit-submit-missing-color')
      .send({
        items: [
          { productId: String(bottle._id), qty: 1 },
          { productId: String(tee._id), qty: 1, variant: { size: 'M' } },
          { productId: String(jockey._id), qty: 1, variant: { size: 'L' } },
        ],
        shippingAddress: {
          name: 'Alice',
          phone: '+91 99999 99999',
          line1: '123 Street',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      });
    expect(missingColor.status).toBe(422);
    expect(missingColor.body.error.code).toBe('COLOR_REQUIRED');

    const submit = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Idempotency-Key', 'kit-submit-ok')
      .send({
        items: [
          { productId: String(bottle._id), qty: 1, variant: { color: 'White' } },
          { productId: String(tee._id), qty: 1, variant: { size: 'M' } },
          { productId: String(jockey._id), qty: 1, variant: { size: 'L' } },
        ],
        shippingAddress: {
          name: 'Alice',
          phone: '+91 99999 99999',
          line1: '123 Street',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      });
    expect(submit.status).toBe(201);
    expect(submit.body.orderNumber).toMatch(/^SM-/);

    const updated = await Recipient.findOne({ _id: recipient._id, tenantId: tenant._id });
    expect(updated.redemptionStatus).toBe('order_created');
    const order = await Order.findOne({ recipientId: recipient._id, tenantId: tenant._id });
    expect(order.items).toHaveLength(3);
    expect(order.items.find((i) => i.name === 'Forge Hoodie').variant.size).toBe('M');
    expect(order.items.find((i) => i.name === 'Work Well Bottle').variant.color).toBe('White');
  });

  it('kit submit validates against active kit items only (inactive refs ignored)', async () => {
    const active = await CatalogProduct.create({
      sku: 'SM-ACTIVE-KIT',
      name: 'Active Mug',
      category: 'Drinkware',
      group: 'mug',
      basePriceInr: 300,
      status: 'active',
    });
    const inactive = await CatalogProduct.create({
      sku: 'SM-INACTIVE-KIT',
      name: 'Retired Item',
      category: 'Apparel',
      group: 'tee',
      basePriceInr: 400,
      status: 'archived',
    });
    const kit = await Kit.create({
      tenantId: tenant._id,
      name: 'Mixed Kit',
      productRefs: [
        { catalogProductId: active._id, name: 'Active Mug', group: 'mug' },
        { catalogProductId: inactive._id, name: 'Retired Item', group: 'tee' },
      ],
      status: 'live',
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Mixed kit send',
      type: 'kit',
      kitId: kit._id,
      status: 'redemption_open',
      recipientCount: 1,
    });
    const token = 'kitActiveOnlyTokenRubixTest26!!';
    const recipient = await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Bob',
      email: 'bob@test.io',
      creditAmount: 0,
      redemptionToken: token,
      redemptionStatus: 'verified',
    });
    const { signRedemptionSession } = await import('../src/modules/redemptions/redemptions.service.js');
    const sessionToken = signRedemptionSession(recipient);

    const submit = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .set('Idempotency-Key', 'kit-active-only')
      .send({
        items: [{ productId: String(active._id), qty: 1 }],
        shippingAddress: {
          name: 'Bob',
          phone: '+91 99999 99999',
          line1: '123 Street',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      });
    expect(submit.status).toBe(201);
  });

  it('send-otp uses SMS channel for phone contacts (MSG91 stub in tests)', async () => {
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'SMS OTP Campaign',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      creditsPerRecipient: 1000,
      totalBudget: 1000,
      recipientCount: 1,
    });
    const token = 'phoneOtpTokenRubixTest26!!';
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Ravi',
      email: 'ravi@test.io',
      phone: '+91 98765 43210',
      creditAmount: 1000,
      redemptionToken: token,
      redemptionStatus: 'invited',
    });

    const otpSend = await request(app)
      .post(`/api/v1/redemptions/${token}/send-otp`)
      .send({ contact: '+91 98765 43210' });
    expect(otpSend.status).toBe(200);
    expect(otpSend.body.channel).toBe('sms');
  });

  it('portal returns the shop branding and catalog is limited to the shop collection', async () => {
    const { signRedemptionSession } = await import('../src/modules/redemptions/redemptions.service.js');

    const brandedShop = await Shop.create({
      tenantId: tenant._id,
      name: 'Uber Store',
      status: 'live',
      logoUrl: 'https://cdn.test/uber.png',
      bannerConfig: { theme: 'brand' },
      selectedCatalogProductIds: [product._id],
    });
    // `product` (Test Tee) is curated into the shop; this second product is not.
    const offShelf = await CatalogProduct.create({
      sku: 'SM-MUG-OFF',
      name: 'Uncurated Mug',
      category: 'Drinkware',
      group: 'mug',
      basePriceInr: 300,
    });
    await Collection.create({
      tenantId: tenant._id,
      shopId: brandedShop._id,
      code: 'C100',
      name: 'Welcome Picks',
      status: 'ready',
      productRefs: [{ catalogProductId: product._id, brand: 'Test', name: 'Test Tee', group: 'tee' }],
    });

    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Branded Store Campaign',
      type: 'points',
      shopId: brandedShop._id,
      status: 'redemption_open',
      creditsPerRecipient: 5000,
      totalBudget: 5000,
      recipientCount: 1,
    });
    const token = 'brandedStoreTokenRubixTest26!';
    const recipient = await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Hari',
      email: 'hari@test.io',
      creditAmount: 5000,
      redemptionToken: token,
      redemptionStatus: 'verified',
    });

    const portal = await request(app).get(`/api/v1/redemptions/${token}`);
    expect(portal.status).toBe(200);
    expect(portal.body.campaign.shop).toMatchObject({
      name: 'Uber Store',
      logoUrl: 'https://cdn.test/uber.png',
      bannerTheme: 'brand',
    });

    const sessionToken = signRedemptionSession(recipient);
    const catalog = await request(app)
      .get(`/api/v1/redemptions/${token}/catalog`)
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(catalog.status).toBe(200);
    // Branded shop listings are one row per collection×product design; the raw
    // catalog id is exposed as `catalogProductId` (the `_id` is a composite
    // `collectionId:catalogProductId`).
    const ids = catalog.body.products.map((p) => p.catalogProductId);
    expect(ids).toContain(String(product._id));
    expect(ids).not.toContain(String(offShelf._id));
    expect(catalog.body.products).toHaveLength(1);
  });

  it('catalog and submit require redemption session JWT', async () => {
    const token = 'noSessionTokenRubixTest26!';
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: (await Campaign.create({
        tenantId: tenant._id,
        entityId: entity._id,
        name: 'Session Guard',
        type: 'points',
        shopId: shop._id,
        status: 'redemption_open',
        creditsPerRecipient: 1000,
        totalBudget: 1000,
        recipientCount: 1,
      }))._id,
      name: 'Guard',
      email: 'guard@test.io',
      creditAmount: 1000,
      redemptionToken: token,
      redemptionStatus: 'verified',
    });

    const catalog = await request(app).get(`/api/v1/redemptions/${token}/catalog`);
    expect(catalog.status).toBe(401);

    const submit = await request(app)
      .post(`/api/v1/redemptions/${token}/submit`)
      .set('Idempotency-Key', 'no-session')
      .send({ items: [{ productId: String(product._id), qty: 1 }], shippingAddress: {} });
    expect(submit.status).toBe(401);
  });
});

describe('catalog & shops (Phase 3)', () => {
  it('lists catalog products and tenant shops', async () => {
    const catalog = await request(app)
      .get('/api/v1/catalog/products')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(catalog.status).toBe(200);
    expect(catalog.body.items.length).toBeGreaterThan(0);

    const shops = await request(app)
      .get('/api/v1/shops')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(shops.status).toBe(200);
    expect(shops.body[0].name).toBe('Rubix Dubai');
  });
});
