import {
  appUrl,
  callout,
  ctaButton,
  detailRows,
  emailShell,
  greeting,
  paragraph,
  signOff,
  strong,
} from './emailLayout.js';

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '');
  return '\u20B9' + n.toLocaleString('en-IN');
}

/**
 * Notification when platform finance approves a company wallet funding request
 * and credits funds to the organization wallet.
 */
export function buildWalletApprovedEmail({
  recipientName = '',
  amount = 0,
  newBalance = null,
  walletName = '',
  organizationName = 'your organization',
  link = '',
} = {}) {
  const amountLabel = formatInr(amount);
  const balanceLabel =
    newBalance == null || !Number.isFinite(Number(newBalance)) ? null : formatInr(newBalance);
  const walletLabel = walletName || 'your wallet';
  const subject = 'Wallet approved \u2014 ' + amountLabel + ' added';
  const walletLink = link || appUrl('/login');

  const text = [
    recipientName ? ('Hello ' + recipientName + ',') : 'Hello,',
    '',
    'Good news \u2014 your funding request has been approved.',
    amountLabel + ' has been transferred to ' + walletLabel + (organizationName ? (' for ' + organizationName) : '') + '.',
    balanceLabel ? ('Your updated budget balance is ' + balanceLabel + '.') : '',
    '',
    'Log in to view your wallet: ' + walletLink,
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml =
    greeting(recipientName) +
    paragraph(
      'Good news \u2014 your funding request has been approved. ' +
        strong(amountLabel) +
        ' has been transferred to ' +
        strong(walletLabel) +
        (organizationName ? (' for ' + strong(organizationName)) : '') +
        '.',
    ) +
    (balanceLabel ? paragraph('Your updated budget balance is ' + strong(balanceLabel) + '.') : '') +
    ctaButton('View Wallet', walletLink) +
    detailRows([
      { label: 'Amount added', value: amountLabel },
      { label: 'Wallet', value: walletLabel },
      { label: 'Organization', value: organizationName },
      ...(balanceLabel ? [{ label: 'Budget balance', value: balanceLabel }] : []),
    ]) +
    callout(
      '',
      'You can now allocate funds across departments and start launching campaigns.',
    ) +
    signOff();

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Finance',
    heroTitle: 'Your wallet has been approved',
    preheader: amountLabel + ' has been transferred to ' + walletLabel + '. Log in to view your updated balance.',
    footerNote: 'You are receiving this because your organization funding request was approved.',
    bodyHtml,
  });

  return { subject, text, html };
}
