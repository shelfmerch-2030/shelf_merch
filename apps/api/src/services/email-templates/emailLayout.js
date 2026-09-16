import { env } from '../../config/env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Production transactional email system - Oracle-style layout for ShelfMerch.
 *
 * Structure: muted logo header -> single continuous hero banner -> body + CTA -> legal footer.
 * Table-based, inline styles only (email-client safe). No web-font dependency.
 *
 * One layout for all viewports: full banner PNG (blue + gift art) with title overlaid
 * on the left blue area. Mobile only scales typography/padding.
 *
 * Image delivery:
 * - Production (or explicit public EMAIL_ASSET_BASE_URL): HTTPS URLs
 * - Local/dev without a public base: CID references (attachments added by email.service)
 * Never use data: URIs — Gmail breaks on large base64 in HTML attributes.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EMAIL_ASSETS_DIR = path.resolve(__dirname, '../email-assets');
const PROD_EMAIL_ASSET_BASE = 'https://shelfmerch.io/email-assets';

/** Stable Content-IDs for local CID delivery (must match email.service attachments). */
export const EMAIL_ASSET_CIDS = Object.freeze({
  'shelfmerch-logo.png': 'shelfmerch-logo@shelfmerch',
  'email-hero-banner.png': 'email-hero-banner@shelfmerch',
});

export function appUrl(pathSuffix = '') {
  const base = (env.APP_URL || '').replace(/\/$/, '');
  const suffix = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`;
  return `${base}${suffix}`;
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
}

function isLoopbackAssetBase(baseUrl) {
  try {
    return isLoopbackHost(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Public HTTPS base for brand images. No trailing slash.
 * Prefer EMAIL_ASSET_BASE_URL; otherwise production CDN.
 */
export function emailAssetBaseUrl() {
  const explicit = String(env.EMAIL_ASSET_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (explicit) return explicit;
  return PROD_EMAIL_ASSET_BASE;
}

/**
 * Local/dev without a reachable public CDN uses CID + MIME inline parts.
 * Production always uses HTTPS. Explicit public EMAIL_ASSET_BASE_URL forces HTTPS
 * even in development (e.g. after CDN is deployed).
 */
export function useCidEmailAssets() {
  if (env.NODE_ENV === 'production') return false;
  const explicit = String(env.EMAIL_ASSET_BASE_URL || '').trim();
  if (explicit && !isLoopbackAssetBase(explicit)) return false;
  return true;
}

export function emailAssetUrl(filename) {
  if (useCidEmailAssets()) {
    const cid = EMAIL_ASSET_CIDS[filename];
    if (cid) return `cid:${cid}`;
  }
  return `${emailAssetBaseUrl()}/${filename}`;
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Brand + layout tokens */
export const tokens = {
  font: "Helvetica Neue, Helvetica, Arial, sans-serif",
  outerBg: '#F0F0F0',
  cardBg: '#FFFFFF',
  heroBg: '#3155FF',
  heroAccent: '#FFD84A',
  heroImageFile: 'email-hero-banner.png',
  logoFile: 'shelfmerch-logo.png',
  ink: '#1F1F1F',
  body: '#454545',
  muted: '#8A8A8A',
  line: '#E5E5E5',
  ctaBg: '#1F1F1F',
  ctaText: '#FFFFFF',
  logoHeader: '#9A9A9A',
  brandAccent: '#C74634',
  link: '#3155FF',
};

const T = tokens;

/**
 * Full HTML document shell.
 */
export function emailShell({
  title,
  heroEyebrow,
  heroTitle,
  bodyHtml,
  preheader = '',
  footerNote = '',
  bannerHtml = '',
  heroBg = T.heroBg,
  heroImageUrl = emailAssetUrl(T.heroImageFile),
}) {
  const year = new Date().getFullYear();
  const privacy = escapeHtml(appUrl('/privacy'));
  const help = escapeHtml(appUrl('/help'));
  const resolvedHeroUrl = heroImageUrl || '';
  const heroBgStyle = resolvedHeroUrl
    ? `background-color:${escapeHtml(heroBg)};background-image:url('${escapeHtml(resolvedHeroUrl)}');background-size:cover;background-position:right center;background-repeat:no-repeat;`
    : `background-color:${escapeHtml(heroBg)};`;
  const heroBgAttr = escapeHtml(heroBg);
  const heroBgImageAttr = resolvedHeroUrl ? ` background="${escapeHtml(resolvedHeroUrl)}"` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    :root { color-scheme: light; }
    @media only screen and (max-width: 620px) {
      .em-outer { padding: 12px 8px 24px 8px !important; }
      .em-card { width: 100% !important; max-width: 100% !important; }
      .em-logo { padding: 16px 16px 10px 16px !important; }
      .em-logo img { width: 132px !important; height: auto !important; }
      .em-hero { padding: 22px 16px 24px 16px !important; background-size: cover !important; background-position: right center !important; background-repeat: no-repeat !important; }
      .em-hero-copy { width: 50% !important; max-width: 50% !important; }
      .em-hero-eyebrow { font-size: 11px !important; line-height: 1.3 !important; margin-bottom: 4px !important; }
      .em-hero-accent { width: 36px !important; margin-bottom: 10px !important; }
      .em-hero-title { font-size: 18px !important; line-height: 1.25 !important; }
      .em-body { padding: 22px 16px 8px 16px !important; }
      .em-footer-wrap { padding: 0 16px 24px 16px !important; }
      .em-footer-brand,
      .em-footer-legal { display: block !important; width: 100% !important; max-width: 100% !important; padding-right: 0 !important; text-align: left !important; }
      .em-footer-legal { padding-top: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${T.outerBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${T.outerBg};">
    <tr>
      <td class="em-outer" align="center" style="padding:32px 16px 48px 16px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td>
        <![endif]-->
        <table class="em-card" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;width:100%;background:${T.cardBg};">

          <tr>
            <td class="em-logo" bgcolor="#FFFFFF" style="padding:28px 40px 20px 40px;font-family:${T.font};background:#FFFFFF;">
              ${headerLogo()}
            </td>
          </tr>

          <tr>
            <td class="em-hero" bgcolor="${heroBgAttr}"${heroBgImageAttr} width="600" valign="top" style="${heroBgStyle}padding:36px 40px 40px 40px;font-family:${T.font};">
              ${heroBlock(heroEyebrow, heroTitle)}
            </td>
          </tr>

          ${bannerHtml}

          <tr>
            <td class="em-body" style="padding:36px 40px 8px 40px;font-family:${T.font};color:${T.body};">
              ${bodyHtml}
            </td>
          </tr>

          <tr>
            <td class="em-footer-wrap" style="padding:0 40px 36px 40px;font-family:${T.font};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="border-top:1px solid ${T.line};padding-top:28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td class="em-footer-brand" valign="top" style="font-family:${T.font};padding-right:16px;">
                          ${footerBrand()}
                        </td>
                        <td class="em-footer-legal" valign="top" align="right" style="font-family:${T.font};font-size:11px;line-height:1.55;color:${T.muted};">
                          ${footerNote ? `<div style="margin-bottom:6px;">${escapeHtml(footerNote)}</div>` : ''}
                          <div style="margin-bottom:6px;">Please do not reply directly to this email.</div>
                          <div style="margin-bottom:8px;">Copyright &copy; ${year} ShelfMerch. All rights reserved.</div>
                          <div>
                            <a href="mailto:support@shelfmerch.com" style="color:${T.muted};text-decoration:none;">Contact Us</a>
                            <span style="color:${T.line};">&nbsp;|&nbsp;</span>
                            <a href="${privacy}" style="color:${T.muted};text-decoration:none;">Privacy</a>
                            <span style="color:${T.line};">&nbsp;|&nbsp;</span>
                            <a href="${help}" style="color:${T.muted};text-decoration:none;">Help</a>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function headerLogo() {
  const logoUrl = escapeHtml(emailAssetUrl(T.logoFile));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="font-size:0;line-height:0;">
        <img
          src="${logoUrl}"
          alt="Shelf Merch"
          width="168"
          height="28"
          style="display:block;width:168px;height:28px;border:0;outline:none;text-decoration:none;"
        >
      </td>
    </tr>
  </table>`;
}

function heroBlock(eyebrow, title) {
  // Keep copy inside the solid blue zone so long titles never spill onto the gift art.
  const eyebrowHtml = eyebrow
    ? `<div class="em-hero-eyebrow" style="font-family:${T.font};font-size:13px;font-weight:400;line-height:1.4;color:#FFFFFF;margin:0 0 6px 0;">
        ${escapeHtml(eyebrow)}
      </div>
      <div class="em-hero-accent" style="width:48px;height:2px;background:${T.heroAccent};font-size:0;line-height:0;margin:0 0 16px 0;">&nbsp;</div>`
    : '';

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td class="em-hero-copy" width="300" valign="top" style="width:50%;max-width:300px;font-family:${T.font};">
        ${eyebrowHtml}
        <div class="em-hero-title" style="font-family:${T.font};font-size:26px;font-weight:700;line-height:1.28;letter-spacing:-0.02em;color:#FFFFFF;margin:0;max-width:300px;">
          ${escapeHtml(title)}
        </div>
      </td>
      <td width="50%" style="width:50%;font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>`;
}

function footerBrand() {
  const logoUrl = escapeHtml(emailAssetUrl(T.logoFile));
  return `<div style="font-size:0;line-height:0;margin:0 0 8px 0;">
    <img
      src="${logoUrl}"
      alt="Shelf Merch"
      width="140"
      height="23"
      style="display:block;width:140px;height:23px;border:0;outline:none;text-decoration:none;"
    >
  </div>
  <div style="font-family:${T.font};font-size:12px;font-weight:400;color:${T.body};line-height:1.35;">
    Corporate Swag Platform
  </div>`;
}

export function greeting(name = '') {
  const line = name ? `Hello ${escapeHtml(name)},` : 'Hello,';
  return `<p style="margin:0 0 16px 0;font-family:${T.font};font-size:15px;line-height:1.6;color:${T.body};">${line}</p>`;
}

export function paragraph(html) {
  return `<p style="margin:0 0 16px 0;font-family:${T.font};font-size:15px;line-height:1.65;color:${T.body};">${html}</p>`;
}

export function strong(text) {
  return `<strong style="color:${T.ink};font-weight:700;">${escapeHtml(text)}</strong>`;
}

/** Dark rectangular CTA - left-aligned, ~4px radius (Oracle-style). */
export function ctaButton(label, href) {
  if (!href) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 28px 0;">
    <tr>
      <td align="left" bgcolor="${T.ctaBg}" style="background:${T.ctaBg};border-radius:4px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(href)}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="9%" stroke="f" fillcolor="${T.ctaBg}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">${escapeHtml(label)}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;font-family:${T.font};font-size:15px;font-weight:700;color:${T.ctaText} !important;text-decoration:none;border-radius:4px;line-height:20px;background:${T.ctaBg};">
          <span style="color:${T.ctaText} !important;">${escapeHtml(label)}</span>
        </a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

export function signOff(team = 'The ShelfMerch Team') {
  return `<p style="margin:8px 0 32px 0;font-family:${T.font};font-size:15px;line-height:1.6;color:${T.body};">
    Thanks,<br>
    ${escapeHtml(team)}
  </p>`;
}

export function detailRows(rows) {
  const items = (rows || []).filter((r) => r && r.value);
  if (!items.length) return '';

  const inner = items
    .map((row, i) => {
      const border = i < items.length - 1 ? `border-bottom:1px solid ${T.line};` : '';
      return `<tr>
        <td style="padding:12px 0;${border}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-family:${T.font};font-size:14px;line-height:1.5;color:${T.muted};padding-right:16px;">
                ${escapeHtml(row.label)}
              </td>
              <td align="right" style="font-family:${T.font};font-size:14px;line-height:1.5;color:${T.ink};font-weight:600;">
                ${escapeHtml(row.value)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px 0;">
    ${inner}
  </table>`;
}

export function callout(title, htmlBody) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F7F7;border-left:3px solid ${T.heroBg};margin:0 0 24px 0;">
    <tr>
      <td style="padding:16px 18px;font-family:${T.font};">
        ${title ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T.ink};margin:0 0 6px 0;">${escapeHtml(title)}</div>` : ''}
        <div style="font-size:14px;line-height:1.55;color:${T.body};">${htmlBody}</div>
      </td>
    </tr>
  </table>`;
}

export function quoteBlock(message) {
  if (!message) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px 0;">
    <tr>
      <td style="padding:14px 18px;background:#F7F7F7;border-left:3px solid ${T.line};font-family:${T.font};font-size:15px;line-height:1.65;color:${T.body};font-style:italic;">
        &ldquo;${escapeHtml(message)}&rdquo;
      </td>
    </tr>
  </table>`;
}

export function otpCode(code) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
    <tr>
      <td style="font-family:${T.font};font-size:32px;font-weight:700;letter-spacing:0.28em;color:${T.ink};line-height:1.2;">
        ${escapeHtml(code)}
      </td>
    </tr>
  </table>`;
}
