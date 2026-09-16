import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../src/config/env.js';
import { buildSignupVerificationEmail } from '../src/services/email-templates/verification.template.js';
import { buildPasswordResetEmail } from '../src/services/email-templates/passwordReset.template.js';
import { buildManagerInviteEmail } from '../src/services/email-templates/managerEmails.template.js';
import { buildRedemptionInviteEmail } from '../src/services/email-templates/redemptionInvite.template.js';
import { buildSurpriseGiftEmail } from '../src/services/email-templates/surpriseGift.template.js';
import { buildDemoRequestConfirmationEmail } from '../src/services/email-templates/demoRequestConfirmation.template.js';
import { buildOrderAdminInvoiceEmail } from '../src/services/email-templates/orderAdminInvoice.template.js';
import { buildBudgetAllocatedEmail } from '../src/services/email-templates/budgetAllocated.template.js';
import { emailAssetUrl } from '../src/services/email-templates/emailLayout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(__dirname, '../src/services/email-assets');
const outDir = resolve(__dirname, '../email-previews');

// Force public HTTPS URLs for generated HTML, then rewrite to local files for offline viewing.
env.EMAIL_ASSET_BASE_URL = 'https://shelfmerch.io/email-assets';

mkdirSync(outDir, { recursive: true });
for (const name of ['email-hero-banner.png', 'shelfmerch-logo.png']) {
  const src = resolve(assetsDir, name);
  if (existsSync(src)) copyFileSync(src, resolve(outDir, name));
}

function forPreview(html) {
  return html
    .replaceAll(emailAssetUrl('email-hero-banner.png'), './email-hero-banner.png')
    .replaceAll(emailAssetUrl('shelfmerch-logo.png'), './shelfmerch-logo.png')
    .replaceAll('cid:email-hero-banner@shelfmerch', './email-hero-banner.png')
    .replaceAll('cid:shelfmerch-logo@shelfmerch', './shelfmerch-logo.png');
}

const samples = [
  ['01-verify-email.html', buildSignupVerificationEmail({ otp: '482917', minutes: 2 }).html],
  ['02-password-reset.html', buildPasswordResetEmail({ link: 'https://app.shelfmerch.com/reset-password?token=demo', minutes: 30 }).html],
  ['03-manager-invite.html', buildManagerInviteEmail({ name: 'Sushant', email: 'sushant@acme.com', departmentName: 'Marketing', organizationName: 'Acme Corp', roleTitle: 'Department Manager', link: 'https://app.shelfmerch.com/accept-invite?token=demo' }).html],
  ['04-redemption-invite.html', buildRedemptionInviteEmail({ recipientName: 'Priya', senderName: 'People Team', giftName: 'Welcome Kit', companyName: 'Rubix', link: 'https://app.shelfmerch.com/redeem/demo', campaignType: 'kit' }).html],
  ['05-surprise-gift.html', buildSurpriseGiftEmail({ recipientName: 'Priya', senderName: 'People Team', message: 'Welcome aboard!', giftName: 'Welcome Kit', companyName: 'Rubix' }).html],
  ['06-demo-request.html', buildDemoRequestConfirmationEmail({ fullName: 'Sushant Kumar' }).html],
  ['07-order-invoice.html', buildOrderAdminInvoiceEmail({ companyAdminName: 'Jonna', placedByName: 'Priya', placedByRole: 'Entity Manager', orderNumber: 'SM-2026-100099', orderDate: '10/08/2026', entityName: 'Marketing', campaignName: 'Diwali Gift 2026', orderTotal: '4,500', paymentStatus: 'Paid' }).html],
  ['08-budget-allocated.html', buildBudgetAllocatedEmail({ recipientName: 'Support', amount: 4000, newBalance: 14000, departmentName: 'Sales', organizationName: 'IBM' }).html],
];

for (const [name, html] of samples) {
  writeFileSync(resolve(outDir, name), forPreview(html), 'utf8');
}

const index = [
  '<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px">',
  '<h1>ShelfMerch email previews</h1><ul>',
  ...samples.map(([n]) => `<li><a href="${n}">${n}</a></li>`),
  '</ul></body></html>',
].join('');
writeFileSync(resolve(outDir, 'index.html'), index, 'utf8');
console.log('Wrote', samples.length, 'previews');
