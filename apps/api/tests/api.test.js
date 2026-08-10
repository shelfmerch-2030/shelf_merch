import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as ledger from '../src/services/ledger.service.js';

let app;
let tenantA;
let tenantB;
let adminA;
let adminB;
let tokenA;
let tokenB;
let walletA;

async function makeUser(tenant, role, scopeType, extra = {}) {
  const user = await User.create({
    tenantId: tenant?._id ?? null,
    name: `${role} user`,
    email: `${role}-${tenant?.slug ?? 'platform'}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant?._id ?? null,
    userId: user._id,
    role,
    scopeType,
    ...extra,
  });
  return { user, token: signAccessToken(user, assignment) };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenantA = await Tenant.create({ name: 'Rubix', slug: 'rubix' });
  tenantB = await Tenant.create({ name: 'Acme', slug: 'acme' });
  ({ user: adminA, token: tokenA } = await makeUser(tenantA, 'company_admin', 'tenant'));
  ({ user: adminB, token: tokenB } = await makeUser(tenantB, 'company_admin', 'tenant'));
  walletA = await Wallet.create({
    tenantId: tenantA._id,
    name: 'Rubix Wallet',
    fundingMethod: 'online',
    fundingDocument: { approvalStatus: 'approved' },
  });
  await ledger.createTransaction({
    tenantId: tenantA._id, walletId: walletA._id, type: 'fund_in', amount: 100_000,
  });
});

describe('cross-tenant isolation (must-have §11.1)', () => {
  it("tenant B cannot read tenant A's wallet by id", async () => {
    const res = await request(app)
      .get(`/api/v1/wallets/${walletA._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("tenant B's wallet list never contains tenant A's wallets", async () => {
    const res = await request(app)
      .get('/api/v1/wallets')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.every((w) => String(w.tenantId) === String(tenantA._id))).toBe(true);

    const resB = await request(app)
      .get('/api/v1/wallets')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body).toHaveLength(0);
  });

  it("tenant B cannot fund tenant A's wallet", async () => {
    const res = await request(app)
      .post(`/api/v1/wallets/${walletA._id}/fund`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: 5000 });
    expect(res.status).toBe(404);
    expect((await Wallet.findOne({ _id: walletA._id, tenantId: tenantA._id })).balance).toBe(100_000);
  });
});

describe('RBAC + ABAC (must-have §11.1)', () => {
  it('entity manager cannot create wallets (RBAC)', async () => {
    const { token } = await makeUser(tenantA, 'entity_manager', 'entity');
    const res = await request(app)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sneaky Wallet' });
    expect(res.status).toBe(403);
  });

  it("entity manager A cannot read entity B's detail, and list is scoped (ABAC)", async () => {
    const entity1 = await Entity.create({ tenantId: tenantA._id, walletId: walletA._id, name: 'Marketing' });
    const entity2 = await Entity.create({ tenantId: tenantA._id, walletId: walletA._id, name: 'Sales' });
    const { token } = await makeUser(tenantA, 'entity_manager', 'entity', {
      scopeId: entity1._id,
      assignedEntityIds: [entity1._id],
    });

    const denied = await request(app)
      .get(`/api/v1/entities/${entity2._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get(`/api/v1/entities/${entity1._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(allowed.status).toBe(200);

    const list = await request(app)
      .get('/api/v1/entities')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.map((e) => e.name)).toEqual(['Marketing']);
  });

  it('entity manager cannot create shops (tenant RBAC)', async () => {
    const { token } = await makeUser(tenantA, 'entity_manager', 'entity');
    const res = await request(app)
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sneaky Shop', slug: 'sneaky' });
    expect(res.status).toBe(403);
  });

  it('both company admin and entity manager can import campaign recipients (campaignOps RBAC)', async () => {
    const entity = await Entity.create({ tenantId: tenantA._id, walletId: walletA._id, name: 'HR' });
    const { token: mgrToken } = await makeUser(tenantA, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
    });
    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ entityId: String(entity._id), name: 'Ops test', type: 'points' });
    expect(created.status).toBe(201);
    const id = created.body._id;

    // Company admin now shares the entity manager's campaign-ops privileges.
    const asAdmin = await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ recipients: [{ name: 'A', email: 'a@test.io' }] });
    expect(asAdmin.status).toBe(200);

    const asManager = await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ recipients: [{ name: 'B', email: 'b@test.io' }] });
    expect(asManager.status).toBe(200);
  });

  it('entity manager cannot create campaign for unassigned entity (ABAC)', async () => {
    const entity1 = await Entity.create({ tenantId: tenantA._id, walletId: walletA._id, name: 'HR' });
    const entity2 = await Entity.create({ tenantId: tenantA._id, walletId: walletA._id, name: 'Sales' });
    const { token } = await makeUser(tenantA, 'entity_manager', 'entity', {
      assignedEntityIds: [entity1._id],
    });
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ entityId: String(entity2._id), name: 'Cross dept', type: 'points' });
    expect(res.status).toBe(403);
  });

  it('company admin can delete incomplete points draft and it disappears from list', async () => {
    const entity = await Entity.create({ tenantId: tenantA._id, walletId: walletA._id, name: 'HR' });
    const created = await request(app)
      .post('/api/v1/campaigns/points-draft')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        entityId: String(entity._id),
        shopId: String(
          (
            await request(app)
              .post('/api/v1/shops')
              .set('Authorization', `Bearer ${tokenA}`)
              .send({ name: 'Draft shop', slug: `draft-${Date.now()}` })
          ).body._id,
        ),
        name: 'Draft to delete',
        creditsPerRecipient: 500,
        draftState: { recips: 10, step: 0 },
      });
    expect(created.status).toBe(201);
    const id = created.body._id;

    const deleted = await request(app)
      .delete(`/api/v1/campaigns/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.ok).toBe(true);

    const list = await request(app)
      .get('/api/v1/campaigns')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.find((c) => String(c._id) === String(id))).toBeUndefined();

    const inDb = await Campaign.findOne({ _id: id, tenantId: tenantA._id }).setOptions({
      includeDeleted: true,
    });
    expect(inDb).toBeNull();
  });

  it('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/v1/wallets');
    expect(res.status).toBe(401);
  });
});

describe('idempotency (must-have §11.1)', () => {
  it('replaying an Idempotency-Key does not double-fund the wallet', async () => {
    const key = 'fund-once-123';
    const first = await request(app)
      .post(`/api/v1/wallets/${walletA._id}/fund`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send({ amount: 10_000 });
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post(`/api/v1/wallets/${walletA._id}/fund`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send({ amount: 10_000 });
    expect(replay.headers['idempotent-replay']).toBe('true');

    const wallet = await Wallet.findOne({ _id: walletA._id, tenantId: tenantA._id });
    expect(wallet.balance).toBe(110_000); // funded exactly once
    expect(
      await WalletTransaction.countDocuments({ tenantId: tenantA._id, walletId: walletA._id, type: 'fund_in' }),
    ).toBe(2); // seed + one fund
  });
});

describe('wallet setup wizard + state machine', () => {
  it('walks create -> PO fund (pending) -> finance approve -> entities -> allocate -> managers -> activate', async () => {
    const { token: financeToken } = await makeUser(null, 'platform_finance_admin', 'platform');

    const created = await request(app)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'FY2026 Merchandise Budget',
        fundingMethod: 'po_upload',
        fundingDocument: { docType: 'Purchase Order', docNumber: 'PO-2026-01' },
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('draft');
    const id = created.body._id;

    // Activation must fail while setup is incomplete.
    const premature = await request(app)
      .post(`/api/v1/wallets/${id}/activate`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(premature.status).toBe(422);

    const funded = await request(app)
      .post(`/api/v1/wallets/${id}/fund`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 1_000_000 });
    expect(funded.status).toBe(201);
    expect(funded.body.pending).toBe(true);
    expect(funded.body.wallet.balance).toBe(0);
    expect(funded.body.wallet.fundingDocument.approvalStatus).toBe('pending');
    expect(funded.body.wallet.fundingDocument.requestedAmount).toBe(1_000_000);

    const pendingApprovals = await request(app)
      .get('/api/v1/platform/finance/funding-approvals')
      .set('Authorization', `Bearer ${financeToken}`);
    expect(pendingApprovals.body.some((r) => String(r.walletId) === String(id))).toBe(true);

    const entityRes = await request(app)
      .post('/api/v1/entities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ walletId: id, name: 'Marketing', colorHex: '#2563EB' });
    expect(entityRes.status).toBe(201);

    const allocBeforeApprove = await request(app)
      .post(`/api/v1/wallets/${id}/allocate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ allocations: [{ entityId: entityRes.body._id, amount: 300_000 }] });
    expect(allocBeforeApprove.status).toBe(422);

    const approved = await request(app)
      .post(`/api/v1/platform/finance/funding-approvals/${id}/approve`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ amount: 1_000_000 });
    expect(approved.status).toBe(201);
    expect(approved.body.wallet.balance).toBe(1_000_000);

    const alloc = await request(app)
      .post(`/api/v1/wallets/${id}/allocate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ allocations: [{ entityId: entityRes.body._id, amount: 300_000 }] });
    expect(alloc.status).toBe(201);
    expect(alloc.body.wallet.status).toBe('budget_allocated');

    // Over-allocation is rejected.
    const tooMuch = await request(app)
      .post(`/api/v1/wallets/${id}/allocate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ allocations: [{ entityId: entityRes.body._id, amount: 900_000 }] });
    expect(tooMuch.status).toBe(422);

    const mgr = await request(app)
      .post(`/api/v1/entities/${entityRes.body._id}/assign-manager`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Priya Sharma', email: 'priya@rubix.net', role: 'Marketing Manager', mobile: '+91 98765 43210' });
    expect(mgr.status).toBe(201);

    const activated = await request(app)
      .post(`/api/v1/wallets/${id}/activate`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe('active');
    expect(activated.body.validNextStatuses).toEqual([]);
  });

  it('POST /wallets/setup creates, uploads, and submits funding atomically', async () => {
    const pdf = Buffer.from('%PDF-1.4 test');
    const res = await request(app)
      .post('/api/v1/wallets/setup')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', 'FY2026 Setup Budget')
      .field('fundingMethod', 'po_upload')
      .field('docType', 'Purchase Order')
      .field('docNumber', 'PO-SETUP-01')
      .field('amount', '500000')
      .field('address', '12 MG Road, Hyderabad')
      .field('pinCode', '500089')
      .field('mobileNumber', '9876543210')
      .field('gstin', '36ABCDE1234F1Z5')
      .attach('document', pdf, { filename: 'po.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('wallet_created');
    expect(res.body.fundingDocument.approvalStatus).toBe('pending');
    expect(res.body.fundingDocument.requestedAmount).toBe(500_000);
    expect(res.body.fundingDocument.fileUrl).toBeTruthy();
    expect(res.body.address).toBe('12 MG Road, Hyderabad');
    expect(res.body.pinCode).toBe('500089');
    expect(res.body.mobileNumber).toBe('9876543210');
    expect(res.body.gstin).toBe('36ABCDE1234F1Z5');

    const count = await Wallet.countDocuments({ tenantId: tenantA._id, name: 'FY2026 Setup Budget' });
    expect(count).toBe(1);
  });

  it('POST /wallets/setup rolls back draft wallet when document upload fails', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/setup')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', 'Broken Setup')
      .field('fundingMethod', 'po_upload')
      .field('docNumber', 'PO-BAD')
      .field('amount', '1000')
      .field('address', '12 MG Road')
      .field('pinCode', '500089')
      .field('mobileNumber', '9876543210')
      .field('gstin', '36ABCDE1234F1Z5')
      .attach('document', Buffer.from('not-a-pdf'), {
        filename: 'bad.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(415);

    const visible = await Wallet.find({ tenantId: tenantA._id, name: 'Broken Setup' });
    expect(visible).toHaveLength(0);
  });
});

describe('auth flow', () => {
  it('register creates tenant + company_admin and returns tokens', async () => {
    const email = `signup-${Date.now()}@test.io`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'New Admin',
        email,
        password: 'securepass1',
        companyName: 'Fresh Corp',
      });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('company_admin');
    expect(res.body.user.email).toBe(email);

    const tenant = await Tenant.findById(res.body.user.tenantId);
    expect(tenant).toBeTruthy();
    const seededWallet = await Wallet.findOne({ tenantId: tenant._id });
    expect(seededWallet).toBeNull();
    expect(tenant.name).toBe('Fresh Corp');

    const duplicate = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Other',
        email,
        password: 'securepass1',
        companyName: 'Other Corp',
      });
    expect(duplicate.status).toBe(409);
  });

  it('login -> refresh -> logout round trip', async () => {
    const { hashPassword } = await import('../src/modules/auth/auth.service.js');
    adminA.passwordHash = await hashPassword('demo1234');
    await adminA.save();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminA.email, password: 'demo1234' });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user.role).toBe('company_admin');

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);

    // Rotated: the old refresh token is dead.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);

    const badLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminA.email, password: 'wrong-password' });
    expect(badLogin.status).toBe(401);
  });

  it('login returns NO_ACCOUNT when the email is unknown', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'missing-user@test.io', password: 'demo1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_ACCOUNT');
    expect(res.body.error.message).toMatch(/sign up/i);
  });
});

describe('user invite', () => {
  it('accept-invite activates invited user and allows login', async () => {
    const email = `invite-${Date.now()}@test.io`;
    const { inviteUser } = await import('../src/modules/users/users.service.js');
    const entity = await Entity.create({
      tenantId: tenantA._id,
      walletId: walletA._id,
      name: 'Marketing',
    });

    const { inviteToken } = await inviteUser({
      tenantId: tenantA._id,
      name: 'Invited Manager',
      email,
      role: 'entity_manager',
      scopeType: 'entity',
      scopeId: entity._id,
      assignedEntityIds: [entity._id],
    });
    expect(inviteToken).toBeTruthy();

    const accept = await request(app)
      .post('/api/v1/users/accept-invite')
      .send({ token: inviteToken, password: 'newpass123' });
    expect(accept.status).toBe(200);
    expect(accept.body.email).toBe(email);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'newpass123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('entity_manager');

    const reuse = await request(app)
      .post('/api/v1/users/accept-invite')
      .send({ token: inviteToken, password: 'newpass123' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_INVITE_TOKEN');
  });
});

describe('impersonation guard (must-have §11.1)', () => {
  it('blocks wallet funding during impersonation', async () => {
    const platform = await makeUser(null, 'platform_super_admin', 'platform');
    const impersonationToken = signAccessToken(
      platform.user,
      { tenantId: tenantA._id, role: 'platform_super_admin', scopeType: 'platform', scopeId: null, assignedEntityIds: [] },
      { isImpersonating: true, originalUserId: String(platform.user._id) },
    );

    // Reads work under impersonation…
    const read = await request(app)
      .get('/api/v1/wallets')
      .set('Authorization', `Bearer ${impersonationToken}`);
    expect(read.status).toBe(200);

    // …but wallet adjustments are blocked.
    const fund = await request(app)
      .post(`/api/v1/wallets/${walletA._id}/fund`)
      .set('Authorization', `Bearer ${impersonationToken}`)
      .send({ amount: 5000 });
    expect(fund.status).toBe(403);
    expect(fund.body.error.message).toMatch(/impersonation/i);
  });

  it('super admin starts impersonation and gets a tenant-scoped token; sensitive routes stay blocked', async () => {
    const platform = await makeUser(null, 'platform_super_admin', 'platform');

    const start = await request(app)
      .post(`/api/v1/platform/tenants/${tenantA._id}/impersonate`)
      .set('Authorization', `Bearer ${platform.token}`)
      .send({ reason: 'debugging a redemption issue', reasonCategory: 'support' });
    expect(start.status).toBe(200);
    expect(start.body.accessToken).toBeTruthy();
    expect(start.body.tenant.id).toBe(String(tenantA._id));

    const impToken = start.body.accessToken;

    // The impersonation token can read the tenant's wallets…
    const read = await request(app)
      .get('/api/v1/wallets')
      .set('Authorization', `Bearer ${impToken}`);
    expect(read.status).toBe(200);

    // …but wallet funding is still blocked under impersonation.
    const fund = await request(app)
      .post(`/api/v1/wallets/${walletA._id}/fund`)
      .set('Authorization', `Bearer ${impToken}`)
      .send({ amount: 5000 });
    expect(fund.status).toBe(403);

    // Ending impersonation succeeds with the impersonation token.
    const end = await request(app)
      .post('/api/v1/platform/impersonate/end')
      .set('Authorization', `Bearer ${impToken}`);
    expect(end.status).toBe(200);
    expect(end.body.ok).toBe(true);
  });

  it('non-super-admin cannot start impersonation', async () => {
    const support = await makeUser(null, 'platform_support_agent', 'platform');
    const res = await request(app)
      .post(`/api/v1/platform/tenants/${tenantA._id}/impersonate`)
      .set('Authorization', `Bearer ${support.token}`)
      .send({ reason: 'x', reasonCategory: 'support' });
    expect(res.status).toBe(403);
  });

  it('blocks ownership transfer during impersonation', async () => {
    const superAdmin = await makeUser(null, 'platform_super_admin', 'platform');
    const { user: otherAdmin } = await makeUser(tenantA, 'company_admin', 'tenant');
    walletA.ownerUserId = adminA._id;
    await walletA.save();

    const start = await request(app)
      .post(`/api/v1/platform/tenants/${tenantA._id}/impersonate`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ reason: 'support ticket', reasonCategory: 'support' });
    expect(start.status).toBe(200);

    const res = await request(app)
      .post('/api/v1/tenants/me/transfer-ownership')
      .set('Authorization', `Bearer ${start.body.accessToken}`)
      .send({ newOwnerUserId: String(otherAdmin._id) });
    expect(res.status).toBe(403);
  });
});

describe('workspace ownership transfer', () => {
  it('GET /tenants/me includes resolved owner', async () => {
    walletA.ownerUserId = adminA._id;
    await walletA.save();

    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.owner).toEqual({
      id: String(adminA._id),
      name: adminA.name,
      email: adminA.email,
    });
  });

  it('company admin can update workspace name and logo URL', async () => {
    const res = await request(app)
      .patch('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Rubix Labs', logoUrl: '/uploads/rubix-logo.png' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Rubix Labs');
    expect(res.body.logoUrl).toBe('/uploads/rubix-logo.png');

    const tenant = await Tenant.findOne({ _id: tenantA._id });
    expect(tenant.name).toBe('Rubix Labs');
    expect(tenant.logoUrl).toBe('/uploads/rubix-logo.png');
  });

  it('company admin can upload a workspace logo', async () => {
    const res = await request(app)
      .post('/api/v1/tenants/me/logo')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('logo', Buffer.from('fake image'), {
        filename: 'logo.png',
        contentType: 'image/png',
    });

    expect(res.status).toBe(201);
    expect(res.body.logoUrl).toContain(`/${tenantA._id}/logo/`);
    expect(res.body.logoUrl).toMatch(/\.png$/);
  });

  it('owner can transfer to another active company_admin', async () => {
    walletA.ownerUserId = adminA._id;
    await walletA.save();
    const { user: adminA2, token: tokenA2 } = await makeUser(tenantA, 'company_admin', 'tenant');

    const transfer = await request(app)
      .post('/api/v1/tenants/me/transfer-ownership')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ newOwnerUserId: String(adminA2._id) });
    expect(transfer.status).toBe(200);
    expect(transfer.body.owner.id).toBe(String(adminA2._id));

    const refreshed = await Wallet.findOne({ _id: walletA._id, tenantId: tenantA._id });
    expect(String(refreshed.ownerUserId)).toBe(String(adminA2._id));

    const me = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${tokenA2}`);
    expect(me.body.owner.id).toBe(String(adminA2._id));
  });

  it('non-owner company_admin cannot transfer ownership', async () => {
    walletA.ownerUserId = adminA._id;
    await walletA.save();
    const { user: adminA2, token: tokenA2 } = await makeUser(tenantA, 'company_admin', 'tenant');

    const res = await request(app)
      .post('/api/v1/tenants/me/transfer-ownership')
      .set('Authorization', `Bearer ${tokenA2}`)
      .send({ newOwnerUserId: String(adminA._id) });
    expect(res.status).toBe(403);
  });

  it('rejects transfer to entity_manager or self', async () => {
    walletA.ownerUserId = adminA._id;
    await walletA.save();
    const { user: manager } = await makeUser(tenantA, 'entity_manager', 'entity');

    const toManager = await request(app)
      .post('/api/v1/tenants/me/transfer-ownership')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ newOwnerUserId: String(manager._id) });
    expect(toManager.status).toBe(422);

    const toSelf = await request(app)
      .post('/api/v1/tenants/me/transfer-ownership')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ newOwnerUserId: String(adminA._id) });
    expect(toSelf.status).toBe(422);
  });
});
