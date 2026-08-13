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

/**
 * Password-reset email — GitHub-style transactional layout, ShelfMerch branding.
 * Logo + page title above the card; content card; muted footer below.
 */
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const OUTER_BG = '#F6F8FA';
const CARD = '#FFFFFF';
const PRIMARY = '#3558F5';
const CORAL = '#FF6A55';
const TITLE = '#24292F';
const BODY = '#24292F';
const MUTED = '#57606A';
const BORDER = '#D0D7DE';
const LINK = '#0969DA';

function brandMark() {
  return `<div style="width:48px;height:48px;margin:0 auto;border-radius:50%;background:${CORAL};color:#111111;font-family:${SANS};font-weight:800;font-size:22px;line-height:48px;text-align:center;">S</div>`;
}

export function buildPasswordResetEmail({ link, minutes = 30 }) {
  const subject = 'Reset your ShelfMerch password';
  const safeLink = escapeHtml(link);
  const forgotUrl = escapeHtml(appUrl('/forgot-password'));

  const text = [
    'Reset your ShelfMerch password',
    '',
    'ShelfMerch password configuration',
    '',
    'We heard that you lost your ShelfMerch password. Sorry about that!',
    '',
    "But don't worry! You can use the following link to reset your password:",
    link,
    '',
    `If you don't use this link within ${minutes} minutes, it will expire.`,
    `Request a new password reset link: ${appUrl('/forgot-password')}`,
    '',
    'Thanks,',
    'The ShelfMerch Team',
    '',
    "You're receiving this email because a password reset was requested for your account.",
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${OUTER_BG};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    Reset your ShelfMerch password — this link expires in ${minutes} minutes.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${OUTER_BG};">
    <tr>
      <td align="center" style="padding:40px 16px 16px 16px;">
        ${brandMark()}
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 16px 24px 16px;font-family:${SANS};font-size:24px;font-weight:400;line-height:1.25;color:${TITLE};">
        Reset your ShelfMerch password
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 16px 24px 16px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480"><tr><td>
        <![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;width:100%;background:${CARD};border:1px solid ${BORDER};border-radius:6px;">
          <tr>
            <td style="padding:32px 32px 0 32px;font-family:${SANS};font-size:20px;font-weight:600;line-height:1.35;color:${TITLE};">
              ShelfMerch password configuration
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0 32px;font-family:${SANS};font-size:14px;line-height:1.5;color:${BODY};">
              <p style="margin:0 0 16px 0;">We heard that you lost your ShelfMerch password. Sorry about that!</p>
              <p style="margin:0;">But don't worry! You can use the following button to reset your password:</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 32px 0 32px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeLink}" style="height:40px;v-text-anchor:middle;width:180px;" arcsize="15%" stroke="f" fillcolor="${PRIMARY}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;">Reset your password</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${safeLink}" style="display:inline-block;background:${PRIMARY};color:#FFFFFF !important;font-family:${SANS};font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:10px 20px;border-radius:6px;mso-hide:all;">
                Reset your password
              </a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0 32px;font-family:${SANS};font-size:14px;line-height:1.5;color:${BODY};">
              If you don't use this link within ${minutes} minutes, it will expire.
              <a href="${forgotUrl}" style="color:${LINK};text-decoration:none;">Click here to get a new password reset link.</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;font-family:${SANS};font-size:14px;line-height:1.5;color:${BODY};">
              <p style="margin:0;">Thanks,</p>
              <p style="margin:0;">The ShelfMerch Team</p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:8px 24px 48px 24px;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};">
        You're receiving this email because a password reset was requested for your account.
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
