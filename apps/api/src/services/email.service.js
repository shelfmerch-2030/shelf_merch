import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { env, emailConfigured } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/errors.js';
import {
  EMAIL_ASSET_CIDS,
  EMAIL_ASSETS_DIR,
  useCidEmailAssets,
} from './email-templates/emailLayout.js';
import { buildRedemptionInviteEmail } from './email-templates/redemptionInvite.template.js';
import { buildSurpriseGiftEmail } from './email-templates/surpriseGift.template.js';
import {
  buildManagerAssignmentEmail,
  buildManagerInviteEmail,
} from './email-templates/managerEmails.template.js';
import { buildDemoRequestConfirmationEmail } from './email-templates/demoRequestConfirmation.template.js';
import { buildSignupInviteEmail } from './email-templates/signupInvite.template.js';
import { buildBudgetAllocatedEmail } from './email-templates/budgetAllocated.template.js';
import {
  buildNotificationEmail,
  buildOtpEmail,
  buildSignupVerificationEmail,
} from './email-templates/verification.template.js';

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: env.EMAIL_SERVICE,
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASSWORD.replace(/\s/g, ''),
      },
    });
  }
  return transporter;
}

export function appUrl(path = '') {
  const base = env.APP_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Prefer a branded From header, e.g. "ShelfMerch" <support@shelfmerch.com>. */
function formatFromAddress(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return value;
  // Already has a display name: Name <email@domain>
  if (/^[^<]+<\s*[^>]+>\s*$/.test(value)) return value;
  // Bare address — add ShelfMerch display name
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `"ShelfMerch" <${value}>`;
  }
  return value;
}

/**
 * Local/dev only: inline brand images referenced via cid: in HTML.
 * Production uses HTTPS and never attaches these PNGs.
 */
function brandCidAttachments(html) {
  if (!useCidEmailAssets()) return [];
  const htmlStr = html ? String(html) : '';
  const out = [];
  for (const [filename, cid] of Object.entries(EMAIL_ASSET_CIDS)) {
    if (!htmlStr.includes(`cid:${cid}`)) continue;
    const filePath = path.join(EMAIL_ASSETS_DIR, filename);
    if (!fs.existsSync(filePath)) continue;
    out.push({
      filename,
      path: filePath,
      cid,
      contentDisposition: 'inline',
    });
  }
  return out;
}

/**
 * Send a transactional email via SMTP (Gmail when EMAIL_SERVICE=gmail).
 * Falls back to structured logging when credentials are not set (tests/dev).
 */
export async function sendEmail({ to, subject, text, html, attachments }) {
  if (!emailConfigured()) {
    logger.info({ to, subject, text }, 'EMAIL (stub — set EMAIL_USER + EMAIL_PASSWORD)');
    return { success: true, provider: 'stub' };
  }

  const from = formatFromAddress(env.EMAIL_FROM || env.EMAIL_USER);
  // Real attachments (PDFs, etc.) always pass through. Brand CID images only in local/dev.
  const normalized = Array.isArray(attachments)
    ? attachments
    : attachments
      ? [attachments]
      : [];
  const merged = [...normalized, ...brandCidAttachments(html)];
  const info = await getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments: merged.length ? merged : undefined,
  });

  logger.info({ to, subject, messageId: info.messageId }, 'Email sent');
  return { success: true, provider: 'smtp', messageId: info.messageId };
}

export async function sendOtpEmail(to, otp) {
  const { subject, text, html } = buildOtpEmail({ otp, minutes: 10 });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.error({ err, to }, 'OTP email send failed');
    throw new ApiError(502, 'Failed to send OTP email', 'EMAIL_SEND_FAILED');
  }
}

/**
 * Signup email verification — never logs OTP plaintext (including stub mode).
 */
export async function sendSignupVerificationEmail(to, otp) {
  const { subject, text, html } = buildSignupVerificationEmail({ otp, minutes: 2 });

  try {
    if (!emailConfigured()) {
      // Deliberately omit OTP / body from logs.
      logger.info({ to, subject }, 'EMAIL (stub) — signup verification dispatched (OTP redacted)');
      return { success: true, provider: 'stub' };
    }
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.error({ err, to }, 'Signup verification email send failed');
    throw new ApiError(502, 'Failed to send verification email', 'EMAIL_SEND_FAILED');
  }
}

export async function sendPasswordResetEmail(to, token) {
  const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const { buildPasswordResetEmail } = await import('./email-templates/passwordReset.template.js');
  const { subject, text, html } = buildPasswordResetEmail({ link, minutes: 30 });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.error({ err, to }, 'Password reset email send failed');
  }
}

export async function sendInviteEmail(
  to,
  token,
  { name = '', departmentName = '', organizationName = '', roleTitle = '' } = {},
) {
  const link = appUrl(`/accept-invite?token=${token}`);
  const { subject, html, text } = buildManagerInviteEmail({
    name,
    email: to,
    departmentName,
    organizationName,
    roleTitle,
    link,
  });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.error({ err, to }, 'Invite email send failed');
  }
}

export async function sendManagerAssignmentEmail({
  to,
  name = '',
  departmentName = '',
  organizationName = '',
  roleTitle = '',
  link = '/login',
}) {
  const fullLink = link.startsWith('http') ? link : appUrl(link);
  const { subject, html, text } = buildManagerAssignmentEmail({
    name,
    email: to,
    departmentName,
    organizationName,
    roleTitle,
    link: fullLink,
  });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.warn({ err, to, subject }, 'Manager assignment email send failed');
    return { success: false, provider: 'smtp' };
  }
}

/**
 * Notify an active Entity Manager that additional budget was allocated.
 * Does not invite or reset credentials.
 */
export async function sendBudgetAllocatedEmail({
  to,
  recipientName = '',
  amount = 0,
  newBalance = null,
  departmentName = '',
  organizationName = '',
  link = '/app/wallets',
}) {
  const fullLink = link.startsWith('http') ? link : appUrl(link);
  const { subject, html, text } = buildBudgetAllocatedEmail({
    recipientName,
    amount,
    newBalance,
    departmentName,
    organizationName,
    link: fullLink,
  });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.warn({ err, to, subject }, 'Budget allocated email send failed');
    return { success: false, provider: 'smtp' };
  }
}

export async function sendRedemptionInviteEmail({
  to,
  recipientName = '',
  senderName = 'Your team',
  message = '',
  giftName = 'Your gift',
  companyName = 'your company',
  link = '',
  campaignType = 'kit',
  pointsScope = 'shop',
  shopName = '',
  shopLogoUrl = '',
  shopBannerTheme = '',
  shopBannerPreset = '',
  shopCurrencyMode = 'points',
}) {
  void shopLogoUrl;
  void shopBannerTheme;
  void shopBannerPreset;

  const { subject, html, text } = buildRedemptionInviteEmail({
    recipientName,
    senderName,
    message,
    giftName,
    companyName,
    link,
    campaignType,
    pointsScope,
    shopName,
    shopCurrencyMode,
  });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.warn({ err, to, subject }, 'Redemption invite email send failed');
    return { success: false, provider: 'smtp' };
  }
}

export async function sendSurpriseGiftEmail({
  to,
  recipientName = '',
  senderName = 'Your team',
  message = '',
  giftName = 'Your gift',
  companyName = 'your company',
}) {
  const { subject, html, text } = buildSurpriseGiftEmail({
    recipientName,
    senderName,
    message,
    giftName,
    companyName,
  });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.warn({ err, to, subject }, 'Surprise gift email send failed');
    return { success: false, provider: 'smtp' };
  }
}

export async function sendNotificationEmail({ to, title, body = '', link = '' }) {
  const fullLink = link ? (link.startsWith('http') ? link : appUrl(link)) : '';
  const { subject, text, html } = buildNotificationEmail({ title, body, link: fullLink });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.warn({ err, to, title }, 'Notification email send failed');
    return { success: false, provider: 'smtp' };
  }
}

/**
 * Confirmation email after a public demo-request lead is saved.
 * Does not throw — callers should treat lead persistence as the source of truth.
 */
export async function sendDemoRequestConfirmationEmail({
  to,
  fullName = '',
  companyName = '',
  workEmail = '',
  mobileNumber = '',
  requirement = '',
}) {
  const { subject, text, html } = buildDemoRequestConfirmationEmail({
    fullName,
    companyName,
    workEmail: workEmail || to,
    mobileNumber,
    requirement,
  });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.warn({ err, to, subject }, 'Demo request confirmation email send failed');
    return { success: false, provider: 'smtp' };
  }
}

/**
 * Sales/platform invite: allowlisted email gets a CTA to /signup (with query prefill).
 */
export async function sendSignupInviteEmail({
  to,
  fullName = '',
  companyName = '',
  link = '',
}) {
  const { subject, text, html } = buildSignupInviteEmail({
    fullName,
    companyName,
    email: to,
    link,
  });

  try {
    return await sendEmail({ to, subject, text, html });
  } catch (err) {
    logger.warn({ err, to, subject }, 'Signup invite email send failed');
    return { success: false, provider: 'smtp' };
  }
}
