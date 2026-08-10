import { describe, it, expect } from 'vitest';
import { buildOrderAdminInvoiceEmail } from '../src/services/email-templates/orderAdminInvoice.template.js';

describe('order admin invoice email template', () => {
  it('renders order summary for the company admin with PDF attachment context', () => {
    const { subject, text, html } = buildOrderAdminInvoiceEmail({
      companyAdminName: 'Jonna',
      placedByName: 'Priya',
      placedByRole: 'Entity Manager',
      orderNumber: 'SM-2026-100099',
      orderDate: '10/08/2026',
      entityName: 'Marketing',
      campaignName: 'Diwali Gift 2026',
      deliveryMode: 'Surprise recipient',
      recipientCount: 3,
      itemCount: 1,
      totalQuantity: 3,
      orderTotal: '4,500',
      paymentStatus: 'Paid (Wallet)',
    });

    expect(subject).toContain('SM-2026-100099');
    expect(text).toContain('Jonna');
    expect(text).toContain('Diwali Gift 2026');
    expect(text).toContain('Priya (Entity Manager)');
    expect(text).toContain('invoice PDF is attached');
    expect(html).toContain('SM-2026-100099');
    expect(html).toContain('Marketing');
    expect(html).toContain('4,500');
    expect(html).toContain('Paid (Wallet)');
  });

  it('escapes HTML in campaign and user fields', () => {
    const { html } = buildOrderAdminInvoiceEmail({
      companyAdminName: '<Admin>',
      campaignName: '<script>x</script>',
      orderNumber: 'SM-1',
      orderTotal: '10',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;Admin&gt;');
  });
});
