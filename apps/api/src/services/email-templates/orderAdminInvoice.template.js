import {
  callout,
  detailRows,
  emailShell,
  greeting,
  paragraph,
  signOff,
  strong,
} from './emailLayout.js';

export function buildOrderAdminInvoiceEmail({
  companyAdminName = 'Admin',
  placedByName = '',
  placedByRole = '',
  orderNumber = '',
  orderDate = '',
  entityName = '',
  campaignName = '',
  deliveryMode = '',
  recipientCount = 1,
  itemCount = 0,
  totalQuantity = 0,
  orderTotal = '0',
  paymentStatus = '',
} = {}) {
  const placedByLine = placedByRole
    ? `${placedByName} (${placedByRole})`
    : placedByName || 'Workspace user';

  const subject = `Invoice for order ${orderNumber}`;

  const text = [
    `Hello ${companyAdminName},`,
    '',
    `An order invoice is ready for ${campaignName || 'your campaign'}.`,
    '',
    `Order Number: ${orderNumber}`,
    `Order Date: ${orderDate}`,
    entityName ? `Department: ${entityName}` : null,
    `Placed by: ${placedByLine}`,
    deliveryMode ? `Delivery: ${deliveryMode}` : null,
    `Recipients: ${recipientCount}`,
    `Line items: ${itemCount} (${totalQuantity} units)`,
    `Order total (INR): ${orderTotal}`,
    paymentStatus ? `Payment: ${paymentStatus}` : null,
    '',
    'The invoice PDF is attached.',
  ]
    .filter((line) => line != null)
    .join('\n');

  const bodyHtml = `
    ${greeting(companyAdminName)}
    ${paragraph(
      campaignName
        ? `An order invoice is ready for ${strong(campaignName)}.`
        : 'An order invoice is ready for your campaign.',
    )}
    ${detailRows([
      { label: 'Order Number', value: orderNumber },
      { label: 'Order Date', value: orderDate },
      { label: 'Department', value: entityName },
      { label: 'Placed by', value: placedByLine },
      { label: 'Delivery', value: deliveryMode },
      { label: 'Recipients', value: String(Number(recipientCount) || 1) },
      {
        label: 'Items',
        value: `${Number(itemCount) || 0} lines / ${Number(totalQuantity) || 0} units`,
      },
      { label: 'Order total (INR)', value: orderTotal },
      { label: 'Payment', value: paymentStatus },
    ])}
    ${callout('', 'The invoice PDF is attached to this email.')}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Orders',
    heroTitle: 'Invoice ready',
    preheader: `Invoice for order ${orderNumber} is ready. PDF attached.`,
    bodyHtml,
  });

  return { subject, text, html };
}