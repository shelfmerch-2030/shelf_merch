import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { ShopCustomer } from '../src/modules/storefront/shopCustomer.model.js';
import { ShopSignupPending } from '../src/modules/storefront/shopSignupPending.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { normalizeEmail } from '../src/modules/auth/workEmail.js';

let app;
let tenant;
let shop;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Acme', slug: 'acme-shop-auth' });
  shop = await Shop.create({
    tenantId: tenant._id,
    name: 'Acme Store',
    status: 'live',
    companyEmailDomain: 'acme.test',
    slug: 'acme-store',
  });
});

describe('storefront shop auth (external customers)', () => {
  it('returns NO_ACCOUNT when email has never signed up for the shop', async () => {
    const res = await request(app)
      .post(`/api/v1/storefront/${shop._id}/auth/login`)
      .send({ email: 'nobody@acme.test', password: 'whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_ACCOUNT');
    expect(res.body.error.message).toMatch(/sign up/i);
  });

  it('logs in an existing shop customer and bootstraps checkout when tenant has no entity', async () => {
    // Tenant has a shop but no Entity/Wallet yet — external login must still work.
    expect(await Entity.countDocuments({ tenantId: tenant._id })).toBe(0);

    const email = 'buyer@acme.test';
    await ShopCustomer.create({
      tenantId: tenant._id,
      shopId: shop._id,
      email,
      name: 'Buyer',
      passwordHash: await hashPassword('securepass1'),
      emailVerifiedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/v1/storefront/${shop._id}/auth/login`)
      .send({ email, password: 'securepass1' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.customer.email).toBe(email);
    expect(res.body.redemptionToken).toBeTruthy();
    expect(res.body.creditAmount).toBe(0);

    const entity = await Entity.findOne({ tenantId: tenant._id });
    expect(entity).toBeTruthy();
    expect(await Wallet.findOne({ tenantId: tenant._id })).toBeTruthy();

    const selfServe = await Campaign.findOne({
      tenantId: tenant._id,
      shopId: shop._id,
      name: '__storefront_self_serve__',
    });
    expect(selfServe).toBeTruthy();
    expect(selfServe.status).toBe('redemption_open');
  });

  it('rejects incorrect password for an existing shop customer', async () => {
    await ShopCustomer.create({
      tenantId: tenant._id,
      shopId: shop._id,
      email: 'buyer@acme.test',
      name: 'Buyer',
      passwordHash: await hashPassword('securepass1'),
      emailVerifiedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/v1/storefront/${shop._id}/auth/login`)
      .send({ email: 'buyer@acme.test', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('signup start → verify creates customer; second signup with same email is EMAIL_EXISTS', async () => {
    const email = 'newhire@acme.test';
    const password = 'securepass1';

    const start = await request(app)
      .post(`/api/v1/storefront/${shop._id}/auth/signup/start`)
      .send({ name: 'New Hire', email, password });
    expect(start.status).toBe(200);
    expect(start.body.pendingId).toBeTruthy();

    const otp = '123456';
    const otpHash = crypto
      .createHash('sha256')
      .update(`${normalizeEmail(email)}:${otp}`)
      .digest('hex');
    await ShopSignupPending.updateOne(
      { pendingId: start.body.pendingId },
      { $set: { otpHash, otpExpiresAt: new Date(Date.now() + 60_000) } },
    );

    const verified = await request(app)
      .post(`/api/v1/storefront/${shop._id}/auth/signup/verify`)
      .send({ pendingId: start.body.pendingId, otp });
    expect(verified.status).toBe(201);
    expect(verified.body.accessToken).toBeTruthy();
    expect(verified.body.customer.email).toBe(email);

    const again = await request(app)
      .post(`/api/v1/storefront/${shop._id}/auth/signup/start`)
      .send({ name: 'New Hire', email, password });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('blocks public signup when shop has no company email domain', async () => {
    shop.companyEmailDomain = '';
    await shop.save();

    const res = await request(app)
      .post(`/api/v1/storefront/${shop._id}/auth/signup/start`)
      .send({ name: 'X', email: 'x@acme.test', password: 'securepass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SHOP_DOMAIN_NOT_CONFIGURED');
  });
});
