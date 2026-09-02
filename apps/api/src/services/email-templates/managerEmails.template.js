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

/** ShelfMerch brand tokens — aligned with app funding-success / landing page. */
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

function emailShell({ title, bodyHtml, preheader = '' }) {
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
      <td align="center" style="padding:4px 16px 48px 16px;font-family:${SANS};">
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

function greetingLine(name) {
  if (!name) {
    return `<p style="margin:0 0 14px 0;font-family:${SERIF};font-size:16px;color:${BODY};line-height:1.6;">Hi there,</p>`;
  }
  return `<p style="margin:0 0 14px 0;font-family:${SERIF};font-size:16px;color:${BODY};line-height:1.6;">Hi ${escapeHtml(name)},</p>`;
}

function naturalParagraph(html) {
  return `<p style="margin:0 0 16px 0;font-family:${SERIF};font-size:16px;line-height:1.72;color:${BODY};">${html}</p>`;
}

function inlineStrong(text) {
  return `<strong style="color:${INK};font-weight:600;">${escapeHtml(text)}</strong>`;
}

function ctaButton(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 24px 0;">
    <tr>
      <td align="left" style="border-radius:999px;background:${INK};">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:14px;font-weight:700;color:#ffffff !important;text-decoration:none;border-radius:999px;line-height:20px;letter-spacing:0.01em;">
          <span style="color:#ffffff !important;">${escapeHtml(label)}</span>
        </a>
      </td>
    </tr>
  </table>`;
}

function detailBox(rows) {
  const items = rows.filter((r) => r.value);
  if (!items.length) return '';

  const inner = items
    .map((row, i) => {
      const border = i < items.length - 1 ? `border-bottom:1px solid ${LINE};` : '';
      return `<tr>
        <td style="padding:10px 0;${border}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-family:${SERIF};font-size:15px;line-height:1.55;color:${MUTED};padding-right:20px;">
                ${escapeHtml(row.label)}
              </td>
              <td align="right" style="font-family:${SERIF};font-size:15px;line-height:1.55;color:${INK};font-weight:600;">
                ${escapeHtml(row.value)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};border:1px solid ${LINE};border-radius:14px;margin:0 0 22px 0;">
    <tr>
      <td style="padding:16px 18px 14px 18px;font-family:${SERIF};font-size:15px;line-height:1.65;color:${BODY};">
        Here are your invite details:
      </td>
    </tr>
    <tr>
      <td style="padding:0 18px 16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${inner}
        </table>
      </td>
    </tr>
  </table>`;
}

function inviteSentTo(email) {
  if (!email) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};border:1px solid ${LINE};border-radius:14px;margin-bottom:14px;">
    <tr>
      <td style="padding:14px 16px;font-family:${SERIF};font-size:15px;line-height:1.6;color:${BODY};">
        We sent this invite to <strong style="color:${INK};font-weight:600;">${escapeHtml(email)}</strong>
      </td>
    </tr>
  </table>`;
}

function disclaimer(text) {
  return `<p style="margin:0;font-family:${SERIF};font-size:14px;line-height:1.65;color:${MUTED};">${escapeHtml(text)}</p>`;
}

function buildManagerEmailBody({
  name,
  email,
  departmentName,
  organizationName,
  roleTitle,
  link,
  ctaLabel,
  inviteAction = true,
}) {
  const safeDept = departmentName || 'your department';
  const safeOrg = organizationName;
  const safeRole = roleTitle || 'Department Manager';
  const actionCopy = inviteAction
    ? 'Accept the invitation below to set your password. You can then sign in with this email and manage your department merch budget and campaigns.'
    : 'Sign in with your existing ShelfMerch account to manage your department merch budget and campaigns.';

  return `
    ${eyebrow('Team invite')}
    ${heroTitle("You're on the team at", 'ShelfMerch.')}
    ${greetingLine(name)}
    ${naturalParagraph(
      `${safeOrg} added you as ${inlineStrong(safeRole)} for the ${inlineStrong(safeDept)} team. ${actionCopy}`,
    )}
    ${ctaButton(ctaLabel, link)}
    ${detailBox([
      { key: 'organization', label: 'Organization', value: organizationName },
      { key: 'department', label: 'Department', value: departmentName },
      { key: 'role', label: 'Role', value: roleTitle },
    ])}
    ${inviteSentTo(email)}
    ${disclaimer("Didn't expect this invite? You can safely ignore this email.")}`;
}

/**
 * Invite email for new department managers.
 */
export function buildManagerInviteEmail({
  name = '',
  email = '',
  departmentName = '',
  organizationName = 'your organization',
  roleTitle = 'Department Manager',
  link = '',
}) {
  const fullLink = link || '';
  const safeDept = departmentName || 'your department';
  const safeOrg = organizationName;
  const safeRole = roleTitle || 'Department Manager';
  const subject = `Your ShelfMerch invite from ${safeOrg}`;

  const bodyHtml = buildManagerEmailBody({
    name,
    email,
    departmentName,
    organizationName,
    roleTitle,
    link: fullLink,
    ctaLabel: 'Accept invitation',
    inviteAction: true,
  });

  const text = [
    `Your ShelfMerch invite from ${safeOrg}`,
    '',
    name ? `Hi ${name},` : 'Hi there,',
    '',
    `${safeOrg} added you as ${safeRole} for the ${safeDept} team.`,
    'Accept the invitation below to set your password, then sign in with this email.',
    '',
    `Accept invitation: ${fullLink}`,
    '',
    `Organization: ${organizationName}`,
    `Department: ${departmentName || 'Not set'}`,
    `Role: ${roleTitle}`,
    email ? `We sent this invite to: ${email}` : '',
    '',
    "Didn't expect this invite? You can safely ignore this email.",
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    html: emailShell({
      title: subject,
      preheader: `${safeOrg} invited you to join as ${safeRole}`,
      bodyHtml,
    }),
    text,
  };
}

/**
 * Notification for existing users assigned as department managers.
 */
export function buildManagerAssignmentEmail({
  name = '',
  email = '',
  departmentName = '',
  organizationName = 'your organization',
  roleTitle = 'Department Manager',
  link = '',
}) {
  const fullLink = link || appUrl('/login');
  const safeDept = departmentName || 'your department';
  const safeOrg = organizationName;
  const safeRole = roleTitle || 'Department Manager';
  const subject = `Your ShelfMerch invite from ${safeOrg}`;

  const bodyHtml = buildManagerEmailBody({
    name,
    email,
    departmentName,
    organizationName,
    roleTitle,
    link: fullLink,
    ctaLabel: 'Sign in to ShelfMerch',
    inviteAction: false,
  });

  const text = [
    `Your ShelfMerch invite from ${safeOrg}`,
    '',
    name ? `Hi ${name},` : 'Hi there,',
    '',
    `${safeOrg} added you as ${safeRole} for the ${safeDept} team.`,
    '',
    `Sign in: ${fullLink}`,
  ].join('\n');

  return {
    subject,
    html: emailShell({
      title: subject,
      preheader: `You're set up as ${safeRole} for ${departmentName || 'your department'} at ${safeOrg}`,
      bodyHtml,
    }),
    text,
  };
}
