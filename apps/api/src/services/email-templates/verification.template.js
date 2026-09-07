import {
  callout,
  ctaButton,
  emailShell,
  escapeHtml,
  greeting,
  otpCode,
  paragraph,
  signOff,
} from './emailLayout.js';

export function buildOtpEmail({ otp, minutes = 10 }) {
  const subject = 'Your ShelfMerch verification code';

  const text = [
    'Hello,',
    '',
    `Your verification code is ${otp}.`,
    `It expires in ${minutes} minutes.`,
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ].join('\n');

  const bodyHtml = `
    ${greeting()}
    ${paragraph('Use the verification code below to continue with ShelfMerch.')}
    ${otpCode(otp)}
    ${callout('Expires soon', `This code expires in <strong style="font-weight:700;color:#1F1F1F;">${minutes} minutes</strong>.`)}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Security',
    heroTitle: 'Your verification code',
    preheader: `Your verification code expires in ${minutes} minutes.`,
    bodyHtml,
  });

  return { subject, text, html };
}

export function buildSignupVerificationEmail({ otp, minutes = 2 }) {
  const subject = 'Verify your ShelfMerch email';

  const text = [
    'Hello,',
    '',
    `Your ShelfMerch verification code is ${otp}.`,
    `It expires in ${minutes} minutes.`,
    'If you did not sign up, ignore this email.',
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ].join('\n');

  const bodyHtml = `
    ${greeting()}
    ${paragraph(
      'Thanks for your interest in creating a ShelfMerch account. To create your account, please verify your email address with the code below.',
    )}
    ${otpCode(otp)}
    ${callout(
      'Expires soon',
      `This code expires in <strong style="font-weight:700;color:#1F1F1F;">${minutes} minutes</strong>. If you did not create a ShelfMerch account, you can ignore this email.`,
    )}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Account',
    heroTitle: 'Verify your email address',
    preheader: `Verify your ShelfMerch email. Code expires in ${minutes} minutes.`,
    bodyHtml,
  });

  return { subject, text, html };
}

export function buildNotificationEmail({ title, body = '', link = '' }) {
  const subject = title;

  const text = [title, body, link].filter(Boolean).join('\n\n');

  const bodyHtml = `
    ${greeting()}
    ${paragraph(escapeHtml(body || title))}
    ${ctaButton('View details', link)}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch',
    heroTitle: title,
    preheader: body || title,
    bodyHtml,
  });

  return { subject, text, html };
}