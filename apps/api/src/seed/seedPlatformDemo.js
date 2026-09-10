import { Vendor } from '../modules/vendors/vendor.model.js';
import { Shipment } from '../modules/shipments/shipment.model.js';
import { ProductionTask } from '../modules/platform/productionTask.model.js';
import { SupportTicket } from '../modules/support/supportTicket.model.js';
import { Invoice } from '../modules/invoices/invoice.model.js';
import { Payment } from '../modules/payments/payment.model.js';
import { CreditNote } from '../modules/invoices/creditNote.model.js';
import { AuditLog } from '../modules/auditLogs/auditLog.model.js';
import { PlatformSetting, PLATFORM_SETTING_DEFAULTS } from '../modules/platform/platformSetting.model.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { Category } from '../modules/catalog/category.model.js';
import { InventoryTransaction } from '../modules/catalog/inventoryTransaction.model.js';
import { CatalogProduct } from '../modules/catalog/catalogProduct.model.js';
import { PLATFORM_LOGINS, TENANT_LOGINS } from './demoReference.js';
import { normalizeEmail } from '../modules/auth/workEmail.js';

/** Platform control-plane demo records for every ops area. */
export async function seedPlatformDemo({
  tenant,
  wallet,
  superAdmin,
  platformUsersByRole,
  orders,
  products,
}) {
  const ops = platformUsersByRole.platform_ops_admin;
  const support = platformUsersByRole.platform_support_agent;
  const finance = platformUsersByRole.platform_finance_admin;

  const vendors = await Vendor.insertMany([
    {
      name: 'PrintCraft India',
      type: 'printing',
      contactEmail: 'ops@printcraft.in',
      contactPhone: '+91 80 4000 1111',
      capabilities: ['screen_print', 'dtf', 'embroidery'],
      status: 'active',
    },
    {
      name: 'BoxWise Packaging',
      type: 'packaging',
      contactEmail: 'hello@boxwise.in',
      contactPhone: '+91 22 6000 2222',
      capabilities: ['rigid_box', 'mailer', 'kitting'],
      status: 'active',
    },
    {
      name: 'SwiftRoute Couriers',
      type: 'logistics',
      contactEmail: 'enterprise@swiftroute.in',
      contactPhone: '+91 40 3000 3333',
      capabilities: ['domestic_express', 'bulk'],
      status: 'active',
    },
  ]);
  const printVendor = vendors[0];

  await Category.insertMany([
    { name: 'Apparel', slug: 'apparel', description: 'Tees, hoodies, caps' },
    { name: 'Drinkware', slug: 'drinkware', description: 'Bottles and mugs' },
    { name: 'Bags', slug: 'bags', description: 'Backpacks and totes' },
    { name: 'Office Supplies', slug: 'office-supplies', description: 'Notebooks and desk items' },
    { name: 'Technology', slug: 'technology', description: 'Power banks and gadgets' },
  ]);

  const lowStockProduct = products.find((p) => p.group === 'cap') || products[0];
  await InventoryTransaction.create({
    productId: lowStockProduct._id,
    type: 'add',
    qty: 8,
    availableAfter: 8,
    reservedAfter: 0,
    reason: 'Initial stock — seed',
    performedBy: superAdmin._id,
  });
  await CatalogProduct.updateOne(
    { _id: lowStockProduct._id },
    { $set: { 'inventory.available': 8, 'inventory.lowStockThreshold': 10, vendorId: printVendor._id } },
  );

  const { mockupOrder, productionOrder, shippedOrder } = orders;
  mockupOrder.vendorId = printVendor._id;
  productionOrder.vendorId = printVendor._id;
  await mockupOrder.save();
  await productionOrder.save();

  await ProductionTask.create({
    tenantId: tenant._id,
    orderId: productionOrder._id,
    assignedTo: 'PrintCraft India — Unit 4',
    status: 'printing',
    mockupUrl: productionOrder.mockupUrl,
    expectedDispatchAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    statusHistory: [
      { status: 'created', at: new Date() },
      { status: 'mockup_approved', at: new Date() },
      { status: 'in_production', at: new Date() },
      { status: 'printing', at: new Date(), note: 'Front logo DTF run started' },
    ],
    notes: [{ body: 'Rush — event deadline Friday', authorUserId: ops._id, at: new Date() }],
  });

  await Shipment.create({
    tenantId: tenant._id,
    orderId: shippedOrder._id,
    courier: 'Delhivery',
    awb: 'DLV9876543210',
    trackingUrl: 'https://track.delhivery.com/DLV9876543210',
    eta: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    status: 'in_transit',
    statusHistory: [{ status: 'packed', at: new Date() }, { status: 'shipped', at: new Date() }, { status: 'in_transit', at: new Date() }],
    events: [
      { status: 'picked_up', location: 'Bengaluru Hub', at: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { status: 'in_transit', location: 'Hyderabad DC', at: new Date() },
    ],
  });

  await SupportTicket.create({
    tenantId: tenant._id,
    raisedByUserId: null,
    subject: 'Delivery address update for SM-2026-100001',
    description: 'Recipient moved offices — needs pincode changed before dispatch.',
    type: 'address_change',
    source: 'tenant',
    relatedOrderId: mockupOrder._id,
    status: 'in_progress',
    assignedToUserId: support._id,
    statusHistory: [{ status: 'open', at: new Date() }, { status: 'in_progress', at: new Date(), actorUserId: support._id }],
    messages: [
      { authorUserId: support._id, body: 'Please confirm the new pincode and we will update before production.', internal: false, at: new Date() },
      { authorUserId: support._id, body: 'Checked with logistics — feasible if approved today.', internal: true, at: new Date() },
    ],
  });

  await SupportTicket.create({
    tenantId: tenant._id,
    subject: 'Redemption link not opening on mobile',
    description: 'OTP screen blank on iOS Safari.',
    type: 'redemption_issue',
    source: 'recipient',
    status: 'open',
    assignedToUserId: support._id,
  });

  const proforma = await Invoice.create({
    tenantId: tenant._id,
    invoiceNumber: 'SM-PF-2026-0042',
    type: 'proforma',
    lineItems: [
      { description: 'FY2026 Merchandise Budget — wallet top-up', hsnCode: '998599', quantity: 1, unitPrice: 100_000, gstRate: 18, amount: 100_000 },
    ],
    totalAmount: 118_000,
    gstAmount: 18_000,
    senderGstin: '29AABCS1234A1Z5',
    receiverGstin: '36AABCR5678B1Z2',
    status: 'issued',
    dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const payment = await Payment.create({
    tenantId: tenant._id,
    relatedType: 'wallet_funding',
    relatedId: wallet._id,
    provider: 'manual_po',
    providerRefId: 'PO-RUBIX-2026-0417',
    amount: 1_000_000,
    status: 'succeeded',
  });

  const taxInvoice = await Invoice.create({
    tenantId: tenant._id,
    invoiceNumber: 'SM-TX-2026-0188',
    type: 'tax',
    paymentId: payment._id,
    lineItems: [
      { description: 'Merchandise wallet funding — FY2026', hsnCode: '998599', quantity: 1, unitPrice: 1_000_000, gstRate: 18, amount: 1_000_000 },
    ],
    totalAmount: 1_180_000,
    gstAmount: 180_000,
    senderGstin: '29AABCS1234A1Z5',
    receiverGstin: '36AABCR5678B1Z2',
    status: 'paid',
  });

  await CreditNote.create({
    tenantId: tenant._id,
    invoiceId: taxInvoice._id,
    creditNoteNumber: 'SM-CN-2026-0003',
    amount: 5_000,
    reason: 'Rounding adjustment on PO reconciliation',
    issuedByUserId: finance._id,
  });

  const demoAllowlist = [...PLATFORM_LOGINS, ...TENANT_LOGINS].map((u) => normalizeEmail(u.email));

  for (const [key, value] of Object.entries(PLATFORM_SETTING_DEFAULTS)) {
    const nextValue = key === 'auth.emailAllowlist' ? demoAllowlist : value;
    await PlatformSetting.create({ key, value: nextValue, updatedByUserId: superAdmin._id });
  }

  await AuditLog.insertMany([
    {
      tenantId: tenant._id,
      actorUserId: superAdmin._id,
      actorRole: 'platform_super_admin',
      action: 'tenant.create',
      entityType: 'Tenant',
      entityId: tenant._id,
      after: { name: tenant.name, slug: tenant.slug },
    },
    {
      tenantId: tenant._id,
      actorUserId: ops._id,
      actorRole: 'platform_ops_admin',
      action: 'order.mockup_upload',
      entityType: 'Order',
      entityId: mockupOrder._id,
      after: { status: 'mockup_pending' },
    },
    {
      tenantId: tenant._id,
      actorUserId: finance._id,
      actorRole: 'platform_finance_admin',
      action: 'finance.funding_approve',
      entityType: 'Wallet',
      entityId: wallet._id,
      after: { amount: 1_000_000 },
    },
    {
      tenantId: null,
      actorUserId: superAdmin._id,
      actorRole: 'platform_super_admin',
      action: 'catalog.product_publish',
      entityType: 'CatalogProduct',
      entityId: products[0]._id,
      after: { status: 'active' },
    },
  ]);

  await Notification.insertMany([
    {
      tenantId: null,
      userId: ops._id,
      type: 'order_pipeline',
      title: '3 Rubix orders in pipeline',
      body: '1 mockup pending · 1 in production · 1 shipped',
      link: '/platform/orders',
    },
    {
      tenantId: null,
      userId: support._id,
      type: 'support_queue',
      title: '2 open support tickets',
      body: 'Address change + redemption issue',
      link: '/platform/support',
    },
    {
      tenantId: null,
      userId: finance._id,
      type: 'finance_risk',
      title: 'Proforma SM-PF-2026-0042 outstanding',
      body: '₹1,18,000 due in 30 days',
      link: '/platform/finance',
    },
  ]);

  return { vendors, proforma, taxInvoice, lowStockProduct };
}
