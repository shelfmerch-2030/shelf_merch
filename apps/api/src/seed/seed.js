/**
 * Dev/demo seed — full mock dataset for every role and major entity field.
 * NEVER run against production.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { User } from '../modules/users/user.model.js';
import { RoleAssignment } from '../modules/roles/roleAssignment.model.js';
import { Wallet } from '../modules/wallets/wallet.model.js';
import { Entity } from '../modules/entities/entity.model.js';
import { CatalogProduct } from '../modules/catalog/catalogProduct.model.js';
import { Shop } from '../modules/shops/shop.model.js';
import { Collection } from '../modules/collections/collection.model.js';
import { Kit } from '../modules/kits/kit.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import * as ledger from '../services/ledger.service.js';
import { transitionThrough } from '../services/stateMachine.service.js';
import * as campaignsService from '../modules/campaigns/campaigns.service.js';
import { CATALOG_PRODUCTS } from './catalogProducts.js';
import {
  DEMO_PASSWORD,
  DEMO_REDEMPTION_TOKEN,
  DEPARTMENTS,
  PLATFORM_LOGINS,
  TENANT_LOGINS,
  formatLoginTable,
} from './demoReference.js';
import { seedTenantDemo } from './seedTenantDemo.js';
import { seedPlatformDemo } from './seedPlatformDemo.js';
import { ensureCatalogCategories, remapCatalogProductCategories } from './catalogCategories.js';

export { DEMO_REDEMPTION_TOKEN, DEMO_PASSWORD, PLATFORM_LOGINS, TENANT_LOGINS };

async function wipe() {
  const cols = [
    'tenants', 'users', 'roleassignments', 'refreshtokens', 'wallets', 'wallettransactions',
    'entities', 'auditlogs', 'catalogproducts', 'shops', 'collections', 'kits', 'contacts',
    'campaigns', 'recipients', 'orders', 'importjobs', 'notifications',
    'idempotencykeys', 'shipments', 'supporttickets', 'vendors', 'productiontasks',
    'platformsettings', 'categories', 'inventorytransactions', 'platformkits',
    'invoices', 'payments', 'creditnotes', 'categorymigrationbackups',
  ];
  await Promise.all(cols.map((c) => mongoose.connection.collection(c).deleteMany({})));
}

async function seed() {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production environment');
  await connectDb();
  logger.warn('Wiping existing data…');
  await wipe();
  await ensureCatalogCategories();

  const password = await hashPassword(DEMO_PASSWORD);
  const platformUsersByRole = {};

  await User.create({
    tenantId: null,
    name: 'ShelfMerch Admin',
    email: 'admin@shelfmerch.io',
    passwordHash: password,
    status: 'active',
  });
  const superAdmin = await User.findOne({ email: 'admin@shelfmerch.io' });
  await RoleAssignment.create({
    tenantId: null,
    userId: superAdmin._id,
    role: 'platform_super_admin',
    scopeType: 'platform',
  });
  platformUsersByRole.platform_super_admin = superAdmin;

  for (const member of PLATFORM_LOGINS.filter((m) => m.email !== 'admin@shelfmerch.io')) {
    const user = await User.create({
      tenantId: null,
      name: member.name,
      email: member.email,
      passwordHash: password,
      status: 'active',
    });
    await RoleAssignment.create({
      tenantId: null,
      userId: user._id,
      role: member.role,
      scopeType: 'platform',
    });
    platformUsersByRole[member.role] ??= user;
  }

  const tenant = await Tenant.create({
    name: 'Rubix',
    slug: 'rubix',
    currency: 'INR',
    status: 'active',
    plan: 'growth',
    gstin: '36AABCR5678B1Z2',
  });

  const demoAppLogin = TENANT_LOGINS.find((m) => m.generatedPasswordOnly);
  if (demoAppLogin) {
    const demoUser = await User.create({
      tenantId: tenant._id,
      name: demoAppLogin.name,
      email: demoAppLogin.email,
      passwordHash: null,
      status: 'active',
    });
    await RoleAssignment.create({
      tenantId: tenant._id,
      userId: demoUser._id,
      role: 'company_admin',
      scopeType: 'tenant',
    });
  }

  const [owner, admin] = await User.create([
    { tenantId: tenant._id, name: 'Jonna Madhavi', email: 'jonnaml2015@gmail.com', passwordHash: password, status: 'active' },
    { tenantId: tenant._id, name: 'Chandra Sekhar', email: 'hr@rubix.net', passwordHash: password, status: 'active' },
  ]);
  await RoleAssignment.create([
    { tenantId: tenant._id, userId: owner._id, role: 'company_admin', scopeType: 'tenant' },
    { tenantId: tenant._id, userId: admin._id, role: 'company_admin', scopeType: 'tenant' },
  ]);

  const walletTotal = DEPARTMENTS.reduce((s, d) => s + d.allocated, 0);
  const wallet = await Wallet.create({
    tenantId: tenant._id,
    name: 'FY2026 Merchandise Budget',
    currency: 'INR',
    status: 'draft',
    validFrom: new Date('2026-04-01'),
    validTo: new Date('2027-03-31'),
    fundingMethod: 'po_upload',
    fundingDocument: { docType: 'Purchase Order', docNumber: 'PO-RUBIX-2026-0417', approvalStatus: 'approved' },
    ownerUserId: owner._id,
  });

  await ledger.createTransaction({
    tenantId: tenant._id,
    walletId: wallet._id,
    type: 'fund_in',
    amount: walletTotal,
    description: 'PO-RUBIX-2026-0417 — FY2026 merchandise budget funding',
    performedBy: owner._id,
  });

  const entities = [];
  const entityByName = {};
  const allocations = [];
  const managersByEmail = {};

  for (const dept of DEPARTMENTS) {
    const entity = await Entity.create({
      tenantId: tenant._id,
      walletId: wallet._id,
      name: dept.name,
      description: dept.desc,
      colorHex: dept.color,
      expectedUsers: dept.users,
    });
    entities.push(entity);
    entityByName[dept.name] = entity;

    const manager = await User.create({
      tenantId: tenant._id,
      name: dept.mgr.name,
      email: dept.mgr.email,
      phone: dept.mgr.mobile,
      passwordHash: password,
      status: 'active',
    });
    managersByEmail[dept.mgr.email] = manager;
    await RoleAssignment.create({
      tenantId: tenant._id,
      userId: manager._id,
      role: 'entity_manager',
      scopeType: 'entity',
      scopeId: entity._id,
      assignedEntityIds: [entity._id],
    });
    entity.managerUserId = manager._id;
    await entity.save();
    allocations.push({ entityId: String(entity._id), amount: dept.allocated });
  }

  await ledger.allocateToEntities({ tenantId: tenant._id, walletId: wallet._id, allocations, performedBy: owner._id });
  const freshWallet = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
  transitionThrough('wallet', freshWallet, 'active', { userId: owner._id });
  await freshWallet.save();

  const products = await CatalogProduct.insertMany(CATALOG_PRODUCTS);
  const productByGroup = Object.fromEntries(products.map((p) => [p.group, p]));

  const shop = await Shop.create({
    tenantId: tenant._id,
    name: 'Rubix Dubai',
    currencyMode: 'points',
    status: 'live',
    categories: ['Food & Beverages', 'Work Essentials', 'Merch'],
    selectedCatalogProductIds: [
      productByGroup.pack._id,
      productByGroup.hoodie._id,
      productByGroup.mug._id,
      productByGroup.bottle._id,
    ],
  });

  await Collection.create({
    tenantId: tenant._id,
    shopId: shop._id,
    code: 'C343955972',
    name: 'New employee Swag',
    status: 'ready',
    preferredColors: ['Black', 'White'],
    productRefs: [
      { catalogProductId: productByGroup.pack._id, brand: 'Mercer+Mettle', name: 'Commuter Backpack', group: 'pack' },
      { catalogProductId: productByGroup.hoodie._id, brand: 'Bella + Canvas', name: 'Sponge Fleece Pullover Hoodie', group: 'hoodie' },
      { catalogProductId: productByGroup.mug._id, brand: '', name: 'Black Glossy Mug 11oz', group: 'mug' },
      { catalogProductId: productByGroup.bottle._id, brand: '', name: 'The Standard Bottle', group: 'bottle' },
    ],
    createdBy: owner._id,
  });

  await Kit.insertMany([
    {
      tenantId: tenant._id,
      name: 'Welcome',
      status: 'live',
      packaging: 'box',
      productRefs: [
        { catalogProductId: productByGroup.tee._id, brand: 'Port & Company', name: 'Youth Core Cotton Tee', group: 'tee' },
        { catalogProductId: productByGroup.bottle._id, brand: '', name: 'The Standard Bottle', group: 'bottle' },
        { catalogProductId: productByGroup.mug._id, brand: '', name: 'Black Glossy Mug 11oz', group: 'mug' },
        { catalogProductId: productByGroup.bag._id, brand: 'ChangeBag', name: 'Organic Canvas Tote', group: 'bag' },
      ],
    },
    {
      tenantId: tenant._id,
      name: 'New hire',
      status: 'live',
      packaging: 'box',
      productRefs: [
        { catalogProductId: productByGroup.hoodie._id, brand: 'Bella + Canvas', name: 'Sponge Fleece Pullover Hoodie', group: 'hoodie' },
        { catalogProductId: productByGroup.note._id, brand: 'Moleskine', name: 'Classic Hard Notebook', group: 'note' },
        { catalogProductId: productByGroup.cap._id, brand: 'Decathlon', name: 'Structured Twill Cap', group: 'cap' },
        { catalogProductId: productByGroup.power._id, brand: 'Ambrane', name: 'Xtreme-10 Power Bank', group: 'power' },
        { catalogProductId: productByGroup.bag._id, brand: 'ChangeBag', name: 'Organic Canvas Tote', group: 'bag' },
      ],
    },
  ]);

  await Contact.insertMany([
    { tenantId: tenant._id, name: 'Jonna Madhavi', email: 'jonnaml2015@gmail.com', role: 'Owner', source: 'manual' },
    {
      tenantId: tenant._id,
      name: 'Chandra Sekhar',
      email: 'konetibaba@gmail.com',
      role: 'Sender',
      source: 'manual',
      address: { line1: 'Flat No 1004, Tower-9, Eipl Corner Stone', city: 'Hyderabad', state: 'Telangana', country: 'IN' },
    },
  ]);

  const priya = managersByEmail['priya@rubix.net'];
  const ravi = managersByEmail['ravi@rubix.net'];
  const priyaRole = await RoleAssignment.findOne({ userId: priya._id });
  const raviRole = await RoleAssignment.findOne({ userId: ravi._id });
  const marketingEntity = entityByName.Marketing;

  const marketingCampaign = await campaignsService.createCampaign({
    tenantId: tenant._id,
    userId: priya._id,
    data: {
      entityId: marketingEntity._id,
      name: 'Diwali Gift 2026',
      type: 'points',
      shopId: shop._id,
      catalogMode: 'full_store',
      message: { from: 'The Rubix team', body: 'Happy Diwali! Pick a gift from our curated store.' },
    },
  });

  await campaignsService.importRecipients({
    tenantId: tenant._id,
    campaignId: marketingCampaign._id,
    user: {
      userId: priya._id,
      role: priyaRole.role,
      scopeType: 'entity',
      assignedEntityIds: [String(marketingEntity._id)],
    },
    recipients: [
      { name: 'Chandra Sekhar', email: 'konetibaba@gmail.com', phone: '+91 98765 00001' },
      { name: 'Jonna Madhavi', email: 'jonnaml2015@gmail.com' },
    ],
  });

  await campaignsService.allocateCredits({
    tenantId: tenant._id,
    campaignId: marketingCampaign._id,
    user: { userId: priya._id, scopeType: 'entity', assignedEntityIds: [String(marketingEntity._id)] },
    creditsPerRecipient: 5000,
  });

  await campaignsService.launchCampaign({
    tenantId: tenant._id,
    campaignId: marketingCampaign._id,
    user: { userId: priya._id, scopeType: 'entity', assignedEntityIds: [String(marketingEntity._id)] },
  });

  const tenantDemo = await seedTenantDemo({
    tenant,
    owner,
    entities,
    entityByName,
    shop,
    productByGroup,
    priya,
    priyaRole,
    ravi,
    raviRole,
    marketingCampaign,
  });

  await seedPlatformDemo({
    tenant,
    wallet: freshWallet,
    superAdmin,
    platformUsersByRole,
    orders: tenantDemo.orders,
    products,
  });

  await remapCatalogProductCategories();

  logger.info(
    {
      tenant: tenant.slug,
      wallet: {
        balance: freshWallet.balance,
        allocated: freshWallet.allocatedAmount,
        status: freshWallet.status,
        departments: DEPARTMENTS.map((d) => ({ name: d.name, allocated: d.allocated })),
      },
      catalogProducts: products.length,
      shops: ['Rubix Dubai', tenantDemo.shopBlr.name],
      campaigns: ['Diwali Gift 2026 (Marketing)', 'Q1 Prospect Gifting (Sales)'],
      orders: Object.values(tenantDemo.orders).map((o) => ({ number: o.orderNumber, status: o.status })),
      redemptionToken: DEMO_REDEMPTION_TOKEN,
      logins: formatLoginTable(),
    },
    'Seed complete — all roles populated',
  );
}

seed()
  .then(() => disconnectDb())
  .catch(async (err) => {
    logger.error({ err }, 'Seed failed');
    await disconnectDb();
    process.exit(1);
  });
