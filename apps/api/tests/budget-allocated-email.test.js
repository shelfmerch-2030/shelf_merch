import { describe, it, expect } from 'vitest';
import { buildBudgetAllocatedEmail } from '../src/services/email-templates/budgetAllocated.template.js';

describe('budget allocated email template', () => {
  it('renders a budget notification with View Wallet CTA (not an invitation)', () => {
    const { subject, html, text } = buildBudgetAllocatedEmail({
      recipientName: 'Priya',
      amount: 5000,
      newBalance: 15000,
      departmentName: 'Marketing',
      organizationName: 'Rubix',
      link: 'https://app.shelfmerch.com/app/wallets',
    });

    expect(subject).toContain('5,000');
    expect(html).toContain('Budget added to your wallet');
    expect(html).toContain('View Wallet');
    expect(html).toContain('Additional budget has been added');
    expect(html).toContain('Marketing');
    expect(html).not.toContain('Accept invitation');
    expect(html).not.toContain('create their password');
    expect(html).not.toContain('/accept-invite');
    expect(text).toContain('15,000');
    expect(text).toContain('Log in to view your wallet');
  });
});