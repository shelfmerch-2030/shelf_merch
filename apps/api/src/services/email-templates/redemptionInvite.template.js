import {
  appUrl,
  callout,
  ctaButton,
  detailRows,
  emailShell,
  greeting,
  paragraph,
  quoteBlock,
  signOff,
  strong,
} from './emailLayout.js';

export function buildRedemptionInviteEmail({
  recipientName = '',
  senderName = 'Your team',
  message = '',
  giftName = 'Your gift',
  companyName = 'your company',
  link = '',
  campaignType = 'kit',
  pointsScope = 'shop',
  shopName = '',
  shopBannerTheme = '',
  shopBannerPreset = '',
  shopBannerCid = '',
  shopCurrencyMode = 'points',
}) {
  // Shared emailShell layout only — shop banner args kept for callers, unused.
  void shopBannerTheme;
  void shopBannerPreset;
  void shopBannerCid;

  const fullLink = link ? (link.startsWith('http') ? link : appUrl(link)) : '';
  const isPoints = campaignType === 'points';
  const isUniversalPoints = isPoints && pointsScope === 'stadium';
  const usesCredits = shopCurrencyMode === 'inr';
  const displayShop = shopName || giftName || companyName;
  const rewardLabel = usesCredits ? 'credits' : 'reward points';

  const heroTitle = isPoints
    ? usesCredits
      ? "You've earned credits"
      : "You've earned reward points"
    : 'A gift is waiting for you';

  const heroEyebrow = isPoints
    ? usesCredits
      ? 'ShelfMerch Credits'
      : 'ShelfMerch Rewards'
    : 'ShelfMerch Gifting';

  const ctaLabel = isPoints
    ? usesCredits
      ? 'Redeem your credits'
      : 'Redeem your points'
    : 'Claim your gift';

  const scopeCopy = isPoints
    ? isUniversalPoints
      ? ''
      : usesCredits
        ? `Redeem these credits exclusively in ${displayShop}.`
        : `Redeem these points exclusively in ${displayShop}.`
    : '';

  const subject = isPoints
    ? usesCredits
      ? `You've received credits from ${senderName}`
      : `You've received reward points from ${senderName}`
    : `${senderName} sent you a gift`;

  const introCopy = isPoints
    ? isUniversalPoints
      ? `${strong(senderName)} sent you ${rewardLabel} to spend across the store. Use the button below to redeem.`
      : `${strong(senderName)} sent you ${rewardLabel} to redeem in ${strong(displayShop)}. Use the button below to pick your merch.`
    : `${strong(senderName)} sent you a gift from ${strong(companyName)}. Open the link below to claim it.`;

  const preheader = isPoints
    ? `${senderName} sent you ${rewardLabel}. Redeem them in your store.`
    : `${companyName} is sending you something special.`;

  const bodyHtml = `
    ${greeting(recipientName)}
    ${paragraph(introCopy)}
    ${quoteBlock(message)}
    ${ctaButton(ctaLabel, fullLink)}
    ${detailRows([
      { label: 'From', value: senderName },
      { label: 'Organization', value: companyName },
      { label: isPoints ? 'Shop' : 'Gift', value: isPoints ? shopName || giftName : giftName },
    ])}
    ${callout(
      'Private link',
      `This redemption link is private and tied to you only. Questions about the gift? Reach out to ${strong(senderName)} at ${strong(companyName)}.`,
    )}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow,
    heroTitle,
    preheader,
    footerNote: 'This gift was sent by your employer through ShelfMerch.',
    bodyHtml,
  });

  const greetingText = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const text = [
    greetingText,
    '',
    isPoints
      ? usesCredits
        ? `You've been gifted credits to ${shopName || giftName}.`
        : `You've been gifted points to ${shopName || giftName}.`
      : `${companyName} is sending you something special.`,
    '',
    message ? `"${message}"` : '',
    message ? '' : null,
    scopeCopy || '',
    scopeCopy ? '' : null,
    `From: ${senderName}`,
    `Gift: ${giftName}`,
    '',
    fullLink ? `${ctaLabel}: ${fullLink}` : '',
    '',
    'This redemption link is private and tied to you only.',
    `Questions about the gift? Reach out to ${senderName} at ${companyName}.`,
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { subject, html, text };
}
