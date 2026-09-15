import { ApiError } from '../../utils/errors.js';
import {
  BUILT_IN_PLATFORM_ALLOWLIST_EMAILS,
  isBuiltInPlatformEmail,
  isValidEmail,
  normalizeEmail,
  normalizeEmailAllowlist,
} from './emailAllowlistPolicy.js';

export {
  BUILT_IN_PLATFORM_ALLOWLIST_EMAILS,
  isBuiltInPlatformEmail,
  normalizeEmail,
  normalizeEmailAllowlist,
};

/** Personal / consumer inbox domains — kept for docs / callers that still classify domains. */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'gmx.com',
  'yandex.com',
]);

export const ALLOWLIST_EMAIL_ERROR =
  'This email is not authorized to sign in. Ask a Shelf Merch admin to allowlist it.';

/** @deprecated Use ALLOWLIST_EMAIL_ERROR — same gate now covers work and personal emails. */
export const WORK_EMAIL_ERROR = ALLOWLIST_EMAIL_ERROR;

export function isPersonalEmailDomain(email) {
  const domain = normalizeEmail(email).split('@')[1];
  return Boolean(domain) && PERSONAL_EMAIL_DOMAINS.has(domain);
}

export async function getEmailAllowlist() {
  const { getSetting } = await import('../platform/platformSettings.service.js');
  const value = await getSetting('auth.emailAllowlist');
  return normalizeEmailAllowlist(Array.isArray(value) ? value : []);
}

/** Append emails to `auth.emailAllowlist` (deduped). Used by seed and tests. */
export async function appendEmailAllowlist(emails, userId = null) {
  const { getSetting, setSetting } = await import('../platform/platformSettings.service.js');
  const current = await getSetting('auth.emailAllowlist');
  const next = normalizeEmailAllowlist([
    ...(Array.isArray(current) ? current : []),
    ...emails,
  ]);
  await setSetting('auth.emailAllowlist', next, userId);
  return next;
}

/** Only emails on `auth.emailAllowlist` may register or log in (work or personal). */
export async function isAllowedAuthEmail(email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return false;
  const allowlist = await getEmailAllowlist();
  return allowlist.includes(normalized);
}

/** Reject any email not present on `auth.emailAllowlist`. */
export async function assertAllowedAuthEmail(email) {
  if (!(await isAllowedAuthEmail(email))) {
    throw new ApiError(400, ALLOWLIST_EMAIL_ERROR, 'EMAIL_NOT_ALLOWLISTED');
  }
}
