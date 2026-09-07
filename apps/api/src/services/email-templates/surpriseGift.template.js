import {
  callout,
  detailRows,
  emailShell,
  greeting,
  paragraph,
  quoteBlock,
  signOff,
  strong,
} from './emailLayout.js';

export function buildSurpriseGiftEmail({
  recipientName = '',
  senderName = 'Your team',
  message = '',
  giftName = 'Your gift',
  companyName = 'your company',
}) {
  const subject = `You've received a gift from ${companyName}!`;
  const greetingText = recipientName ? `Hello ${recipientName},` : 'Hello,';

  const bodyHtml = `
    ${greeting(recipientName)}
    ${paragraph(
      `${strong(companyName)} is sending you a surprise gift. We&rsquo;ll ship it to your address on file &mdash; you don&rsquo;t need to do anything.`,
    )}
    ${quoteBlock(message)}
    ${detailRows([
      { label: 'From', value: senderName },
      { label: 'Gift', value: giftName },
      { label: 'Organization', value: companyName },
    ])}
    ${callout('No action required', 'Just sit back and enjoy the surprise. Your gift will be shipped automatically.')}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Gifting',
    heroTitle: 'A surprise gift is on the way',
    preheader: `${companyName} is sending you a surprise gift.`,
    footerNote: 'This gift was sent by your employer through ShelfMerch.',
    bodyHtml,
  });

  const text = [
    greetingText,
    '',
    `${companyName} is sending you a surprise gift.`,
    `${giftName} will be shipped automatically to your address on file.`,
    'No action is required from you.',
    message ? `\n"${message}"` : '',
    `\nFrom: ${senderName}`,
    '\nThanks,',
    'The ShelfMerch Team',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}