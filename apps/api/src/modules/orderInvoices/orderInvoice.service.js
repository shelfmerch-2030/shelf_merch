import { OrderInvoice } from './orderInvoice.model.js';
import { Order } from '../orders/order.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Kit } from '../kits/kit.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { User } from '../users/user.model.js';
import { Entity } from '../entities/entity.model.js';
import { loadActiveKitEntriesForInvoice } from './orderInvoice.kit.js';
import { uploadBuffer } from '../../services/storage.service.js';
import { sendEmail } from '../../services/email.service.js';
import { logger } from '../../config/logger.js';
import { NotFoundError } from '../../utils/errors.js';
import { amountInWordsInr } from '../../utils/amountInWords.js';
import { buildOrderInvoiceLines, buildHsnSummary } from './orderInvoice.lines.js';
import { computeInvoiceTotals, renderOrderInvoicePdf } from './orderInvoice.pdf.js';
import { buildOrderAdminInvoiceEmail } from '../../services/email-templates/orderAdminInvoice.template.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';

function formatInvoiceDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatAddress(parts) {
  return parts.filter(Boolean).join(', ');
}

function buildBillTo(wallet) {
  const address = formatAddress([
    wallet.address,
    wallet.pinCode ? String(wallet.pinCode) : '',
  ]);
  return {
    name: wallet.name || 'Customer',
    address: address || '—',
    gstin: wallet.gstin || '',
    mobile: wallet.mobileNumber || '',
    placeOfSupply: '',
  };
}

function buildShipTo(order, campaign, multiRecipient) {
  if (multiRecipient) {
    return {
      name: order.shippingAddress?.name || 'Recipient',
      address: "Shipped to respective recipient's address.",
    };
  }
  const addr = order.shippingAddress || {};
  return {
    name: addr.name || 'Recipient',
    address: formatAddress([
      addr.line1,
      addr.line2,
      [addr.city, addr.state].filter(Boolean).join(', '),
      addr.pincode,
    ]),
  };
}

function isShopOrder(campaign) {
  return campaign.type === 'points' && Boolean(campaign.shopId);
}

async function resolveWalletForOrder(order, campaign) {
  const entity = await Entity.findOne({ _id: campaign.entityId, tenantId: order.tenantId }).lean();
  if (!entity?.walletId) return null;
  return Wallet.findOne({ _id: entity.walletId, tenantId: order.tenantId }).lean();
}

async function loadKitContext(campaign, tenantId) {
  if (campaign.type !== 'kit' || !campaign.kitId) return { kit: null, kitEntries: [] };
  const kit = await Kit.findOne({ _id: campaign.kitId, tenantId }).lean();
  if (!kit) return { kit: null, kitEntries: [] };
  const kitEntries = await loadActiveKitEntriesForInvoice(kit);
  return { kit, kitEntries };
}

export async function generateAndStoreOrderInvoice(orderDoc, { force = false, skipEmail = false } = {}) {
  const order = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
  const tenantId = order.tenantId;

  const existing = await OrderInvoice.findOne({ orderId: order._id, tenantId });
  if (existing?.pdfUrl && !force) return existing;

  const campaign = await Campaign.findOne({ _id: order.campaignId, tenantId }).lean();
  if (!campaign) throw new NotFoundError('Campaign not found for order');

  const wallet = await resolveWalletForOrder(order, campaign);
  const { kit, kitEntries } = await loadKitContext(campaign, tenantId);

  const lines = await buildOrderInvoiceLines({ order, campaign, kit, kitEntries });
  const hsnSummary = buildHsnSummary(lines);
  const totals = computeInvoiceTotals(lines);

  const billTo = buildBillTo(wallet || {});
  billTo.placeOfSupply = order.shippingAddress?.state || '';

  const multiRecipient =
    campaign.fulfillmentMode === 'single' && (Number(campaign.recipientCount) || 0) > 1;
  const shipTo = buildShipTo(order, campaign, multiRecipient);

  const pdfBuffer = await renderOrderInvoicePdf({
    invoiceNumber: order.orderNumber,
    invoiceDate: formatInvoiceDate(order.createdAt || new Date()),
    billTo,
    shipTo,
    lines,
    bodyGst: totals.bodyGst,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    hsnSummary,
    amountInWords: amountInWordsInr(totals.grandTotal),
  });

  const { url } = await uploadBuffer({
    tenantId,
    kind: 'document',
    buffer: pdfBuffer,
    filename: `${order.orderNumber}.pdf`,
    contentType: 'application/pdf',
  });

  const invoice = await OrderInvoice.findOneAndUpdate(
    { orderId: order._id, tenantId },
    {
      $set: {
        invoiceNumber: order.orderNumber,
        pdfUrl: url,
        generatedAt: new Date(),
        status: 'generated',
      },
      $setOnInsert: { orderId: order._id, tenantId },
    },
    { upsert: true, new: true },
  );

  // Invoice grand total (ceil) is the source of truth for order amount display.
  await Order.updateOne(
    { _id: order._id, tenantId },
    { $set: { 'amountBreakdown.total': totals.grandTotal } },
  );

  if (!skipEmail && !existing && !isShopOrder(campaign)) {
    await emailInvoiceToCompanyAdmin({ order, campaign, invoice, pdfBuffer });
  }

  return invoice;
}

function formatRoleLabel(role) {
  if (role === 'company_admin') return 'Company Admin';
  if (role === 'entity_manager') return 'Entity Manager';
  if (!role) return '';
  return String(role)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function deliveryModeLabel(campaign) {
  if (!campaign) return '';
  if (campaign.type === 'points' && campaign.shopId) return 'Storefront checkout';
  switch (campaign.fulfillmentMode) {
    case 'surprise':
      return 'Surprise recipient';
    case 'single':
      return 'Single location';
    case 'redeem':
      return 'Recipient chooses';
    default:
      return campaign.fulfillmentMode || '';
  }
}

function paymentStatusLabel(campaign) {
  const mode = campaign?.paymentMode || 'wallet';
  if (mode === 'wallet') return 'Paid (Wallet)';
  if (mode === 'upi') return 'Paid (UPI)';
  if (mode === 'card') return 'Paid (Card)';
  return `Paid (${mode})`;
}

function formatOrderValue(total) {
  const n = Math.round(Number(total) || 0);
  return n.toLocaleString('en-IN');
}

async function resolvePlacedBy(campaign) {
  if (!campaign?.createdBy) {
    return { placedByName: 'Workspace user', placedByRole: '' };
  }
  const [user, assignment] = await Promise.all([
    User.findById(campaign.createdBy).select('name email').lean(),
    RoleAssignment.findOne({ tenantId: campaign.tenantId, userId: campaign.createdBy })
      .select('role')
      .lean(),
  ]);
  return {
    placedByName: user?.name || user?.email || 'Workspace user',
    placedByRole: formatRoleLabel(assignment?.role),
  };
}

async function emailInvoiceToCompanyAdmin({ order, campaign, invoice, pdfBuffer }) {
  try {
    const assignment = await RoleAssignment.findOne({
      tenantId: order.tenantId,
      role: 'company_admin',
    })
      .sort({ createdAt: 1 })
      .lean();
    if (!assignment?.userId) {
      logger.warn({ orderId: order._id, tenantId: order.tenantId }, 'No company_admin for invoice email');
      return;
    }
    const admin = await User.findById(assignment.userId).select('email name').lean();
    const adminEmail = admin?.email;
    if (!adminEmail) {
      logger.warn({ orderId: order._id, userId: assignment.userId }, 'company_admin has no email');
      return;
    }

    const entity = campaign?.entityId
      ? await Entity.findOne({ _id: campaign.entityId, tenantId: order.tenantId }).select('name').lean()
      : null;
    const { placedByName, placedByRole } = await resolvePlacedBy(campaign);

    const items = order.items || [];
    const itemCount = items.length;
    const totalQuantity = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
    const orderTotal =
      order.amountBreakdown?.total ??
      items.reduce((sum, i) => sum + Number(i.unitPriceInr || 0) * Number(i.qty || 0), 0);

    const { subject, text, html } = buildOrderAdminInvoiceEmail({
      companyAdminName: admin.name || 'Admin',
      placedByName,
      placedByRole,
      orderNumber: order.orderNumber,
      orderDate: formatInvoiceDate(order.createdAt),
      entityName: entity?.name || '',
      campaignName: campaign?.name || '',
      deliveryMode: deliveryModeLabel(campaign),
      recipientCount: Number(campaign?.recipientCount) || 1,
      itemCount,
      totalQuantity,
      orderTotal: formatOrderValue(orderTotal),
      paymentStatus: paymentStatusLabel(campaign),
    });

    await sendEmail({
      to: adminEmail,
      subject,
      text,
      html,
      attachments: [
        {
          filename: `Invoice_${order.orderNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    logger.warn({ err, orderId: order._id }, 'Failed to email order invoice to company admin');
  }
}

/** Fire-and-forget hook after Order.create — never blocks order placement. */
export async function getOrderInvoiceByOrderId({ tenantId, orderId }) {
  const invoice = await OrderInvoice.findOne({ orderId, tenantId }).lean();
  if (!invoice) throw new NotFoundError('Invoice not found for this order');
  return invoice;
}

/** Generate invoice for an existing order if missing; return stored invoice. */
export async function ensureOrderInvoice({ tenantId, orderId }) {
  const { Order } = await import('../orders/order.model.js');
  const order = await Order.findOne({ _id: orderId, tenantId });
  if (!order) throw new NotFoundError('Order not found');

  // Always rebuild so layout/pricing fixes apply to older invoices.
  return generateAndStoreOrderInvoice(order, { force: true, skipEmail: true });
}

export async function getOrderInvoiceByOrderNumber({ tenantId, orderNumber }) {
  const { Order } = await import('../orders/order.model.js');
  const order = await Order.findOne({ orderNumber, tenantId }).select('_id').lean();
  if (!order) throw new NotFoundError('Order not found');
  return getOrderInvoiceByOrderId({ tenantId, orderId: order._id });
}
