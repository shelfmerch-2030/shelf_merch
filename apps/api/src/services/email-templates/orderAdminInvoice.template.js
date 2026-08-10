function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Company-admin notification when a campaign order invoice PDF is generated.
 */
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
  const safeAdmin = escapeHtml(companyAdminName);
  const safePlacedBy = escapeHtml(placedByName);
  const safeRole = escapeHtml(placedByRole);
  const safeOrder = escapeHtml(orderNumber);
  const safeDate = escapeHtml(orderDate);
  const safeEntity = escapeHtml(entityName);
  const safeCampaign = escapeHtml(campaignName);
  const safeDelivery = escapeHtml(deliveryMode);
  const safePayment = escapeHtml(paymentStatus);
  const safeTotal = escapeHtml(orderTotal);

  const placedByLine = placedByRole
    ? `${placedByName} (${placedByRole})`
    : placedByName || 'Workspace user';
  const safePlacedByLine = escapeHtml(placedByLine);

  const subject = `Invoice for order ${orderNumber}`;

  const text = [
    `Hi ${companyAdminName},`,
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

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.5">
  <p>Hi ${safeAdmin},</p>
  <p>An order invoice is ready${safeCampaign ? ` for <strong>${safeCampaign}</strong>` : ''}.</p>
  <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
    <tr><td>Order Number</td><td><strong>${safeOrder}</strong></td></tr>
    <tr><td>Order Date</td><td>${safeDate}</td></tr>
    ${safeEntity ? `<tr><td>Department</td><td>${safeEntity}</td></tr>` : ''}
    <tr><td>Placed by</td><td>${safePlacedByLine}</td></tr>
    ${safeDelivery ? `<tr><td>Delivery</td><td>${safeDelivery}</td></tr>` : ''}
    <tr><td>Recipients</td><td>${Number(recipientCount) || 1}</td></tr>
    <tr><td>Items</td><td>${Number(itemCount) || 0} lines / ${Number(totalQuantity) || 0} units</td></tr>
    <tr><td>Order total (INR)</td><td><strong>${safeTotal}</strong></td></tr>
    ${safePayment ? `<tr><td>Payment</td><td>${safePayment}</td></tr>` : ''}
  </table>
  <p>The invoice PDF is attached.</p>
  <p style="color:#666;font-size:12px">Shelf Merch</p>
</body>
</html>`.trim();

  return { subject, text, html };
}
