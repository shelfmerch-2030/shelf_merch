import { env } from '../../config/env.js';

function appUrl(path = '') {
  const base = env.APP_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ShelfMerch brand tokens — aligned with manager invite / app UI. */
const SANS =
  "'Hanken Grotesk','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";
const INK = '#121212';
const CREAM = '#f7f3ea';
const BLUE = '#3155ff';
const CORAL = '#ff6d55';
const MINT = '#72e2b8';
const YELLOW = '#ffd84a';
const LINE = 'rgba(18,18,18,0.12)';
const BODY = '#5c5a56';
const MUTED = '#7a7770';

function emailShell({ title, bodyHtml, preheader = '', footerNote = '' }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">body, table, td { font-family: Arial, Helvetica, sans-serif !important; }</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:36px 16px 20px 16px;">
        ${logoAboveCard()}
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 16px 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(18,18,18,0.06);">
          <tr>
            <td style="height:5px;background:linear-gradient(90deg,${CORAL} 0%,${YELLOW} 42%,${MINT} 78%,${BLUE} 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px 32px;font-family:${SANS};">
              ${bodyHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:4px 16px 20px 16px;font-family:${SANS};font-size:12px;line-height:1.55;color:${MUTED};max-width:480px;">
        ${footerNote ? escapeHtml(footerNote) : ''}
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 16px 48px 16px;font-family:${SANS};">
        <a href="${appUrl('/privacy')}" style="color:${MUTED};text-decoration:none;font-size:12px;font-weight:600;">Privacy</a>
        <span style="color:${MUTED};margin:0 8px;">|</span>
        <a href="mailto:support@shelfmerch.com" style="color:${MUTED};text-decoration:none;font-size:12px;font-weight:600;">Contact Support</a>
        <div style="font-size:11px;color:${MUTED};margin-top:12px;line-height:1.5;">© ${year} ShelfMerch. All rights reserved.</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function logoAboveCard() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td valign="middle" style="padding-right:10px;">
        <div style="width:34px;height:34px;border-radius:50%;background:${CORAL};color:${INK};font-family:${SANS};font-weight:900;font-size:16px;line-height:34px;text-align:center;">S</div>
      </td>
      <td valign="middle" style="font-family:${SANS};font-weight:800;font-size:19px;color:${INK};letter-spacing:-0.04em;font-style:italic;">Shelf Merch</td>
    </tr>
  </table>`;
}

function eyebrow(text) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
    <tr>
      <td valign="middle" width="10" style="padding-right:8px;">
        <div style="width:7px;height:7px;border-radius:50%;background:${CORAL};font-size:0;line-height:0;">&nbsp;</div>
      </td>
      <td valign="middle" style="font-family:${SANS};font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${BLUE};">${escapeHtml(text)}</td>
    </tr>
  </table>`;
}

function heroTitle(lead, accent) {
  return `<h1 style="margin:0 0 16px 0;font-family:${SANS};font-size:32px;line-height:1.02;font-weight:800;letter-spacing:-0.04em;color:${INK};">
    ${escapeHtml(lead)} <em style="font-family:${SERIF};font-style:italic;font-weight:400;color:${BLUE};">${escapeHtml(accent)}</em>
  </h1>`;
}

function naturalParagraph(html) {
  return `<p style="margin:0 0 16px 0;font-family:${SERIF};font-size:16px;line-height:1.72;color:${BODY};">${html}</p>`;
}

function ctaButton(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 22px 0;">
    <tr>
      <td align="left" style="border-radius:999px;background:${INK};">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:14px;font-weight:700;color:#ffffff !important;text-decoration:none;border-radius:999px;line-height:20px;letter-spacing:0.01em;">
          <span style="color:#ffffff !important;">${escapeHtml(label)}</span>
        </a>
      </td>
    </tr>
  </table>`;
}

function expiryNote(minutes, forgotUrl) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${MINT};border:1.3px solid ${INK};border-radius:16px;margin:0 0 20px 0;">
    <tr>
      <td style="padding:16px 18px;font-family:${SANS};">
        <div style="font-size:9px;font-weight:850;letter-spacing:0.16em;text-transform:uppercase;color:${INK};margin-bottom:6px;">Link expiry</div>
        <div style="font-size:14px;line-height:1.55;color:${INK};">
          This reset link expires in <strong style="font-weight:800;">${minutes} minutes</strong>.
          Didn't request a reset?
          <a href="${forgotUrl}" style="color:${BLUE};font-weight:700;text-decoration:none;">Request a new link</a>.
        </div>
      </td>
    </tr>
  </table>`;
}

function signOff() {
  return `<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${BODY};">
    Thanks,<br>
    <strong style="color:${INK};font-weight:700;">The ShelfMerch team</strong>
  </p>`;
}

export function buildPasswordResetEmail({ link, minutes = 30 }) {
  const subject = 'Reset your ShelfMerch password';
  const safeLink = escapeHtml(link);
  const forgotUrl = escapeHtml(appUrl('/forgot-password'));

  const text = [
    'Reset your ShelfMerch password',
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
    '',
    "You're receiving this email because a password reset was requested for your account.",
  ].join('\n');

  const bodyHtml = `
    ${eyebrow('Account security')}
    ${heroTitle('Reset your', 'password.')}
    ${naturalParagraph(
      'We got a request to reset your ShelfMerch password. If that was you, use the button below to choose a new password and sign back in.',
    )}
    ${ctaButton('Reset your password →', safeLink)}
    ${expiryNote(minutes, forgotUrl)}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    preheader: `Reset your ShelfMerch password. This link expires in ${minutes} minutes.`,
    footerNote:
      "You're receiving this email because a password reset was requested for your account.",
    bodyHtml,
  });

  return { subject, text, html };
}
