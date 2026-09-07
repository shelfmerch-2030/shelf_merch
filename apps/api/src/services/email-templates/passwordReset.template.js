import {
  appUrl,
  callout,
  ctaButton,
  emailShell,
  escapeHtml,
  greeting,
  paragraph,
  signOff,
} from './emailLayout.js';

export function buildPasswordResetEmail({ link, minutes = 30 }) {
  const subject = 'Reset your ShelfMerch password';
  const forgotUrl = escapeHtml(appUrl('/forgot-password'));

  const text = [
    'Reset your ShelfMerch password',
    '',
    'Hello,',
    '',
    'We got a request to reset your ShelfMerch password.',
    'If that was you, use the link below to choose a new password and sign back in.',
    '',
    link,
    '',
    `This link expires in ${minutes} minutes.`,
    `Request a new password reset link: ${appUrl('/forgot-password')}`,
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ].join('\n');

  const bodyHtml = `
    ${greeting()}
    ${paragraph(
      'We got a request to reset your ShelfMerch password. If that was you, use the button below to choose a new password and sign back in.',
    )}
    ${ctaButton('Reset password', link)}
    ${callout(
      'Link expiry',
      `This reset link expires in <strong style="font-weight:700;color:#1F1F1F;">${minutes} minutes</strong>. Didn&rsquo;t request a reset? <a href="${forgotUrl}" style="color:#3155FF;font-weight:600;text-decoration:none;">Request a new link</a>.`,
    )}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: 'ShelfMerch Account',
    heroTitle: 'Reset your password',
    preheader: `Reset your ShelfMerch password. This link expires in ${minutes} minutes.`,
    footerNote: "You're receiving this email because a password reset was requested for your account.",
    bodyHtml,
  });

  return { subject, text, html };
}