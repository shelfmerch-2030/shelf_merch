import { ApiError } from '../../utils/errors.js';

export const BUILT_IN_PLATFORM_ALLOWLIST_EMAILS = Object.freeze([
  'admin@shelfmerch.io',
  'test@shelfmerch.io',
  'ops@shelfmerch.io',
  'catalog@shelfmerch.io',
  'production@shelfmerch.io',
  'finance@shelfmerch.io',
  'sales@shelfmerch.io',
  'support@shelfmerch.io',
  'logistics@shelfmerch.io',
  'auditor@shelfmerch.io',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

export function isBuiltInPlatformEmail(email) {
  return BUILT_IN_PLATFORM_ALLOWLIST_EMAILS.includes(normalizeEmail(email));
}

/** Normalize + validate the platform auth allowlist while preserving built-in logins. */
export function normalizeEmailAllowlist(value) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'auth.emailAllowlist must be an array of email addresses', 'INVALID_ALLOWLIST');
  }

  const emails = [];
  const seen = new Set();
  function add(raw) {
    const email = normalizeEmail(raw);
    if (!EMAIL_RE.test(email)) {
      throw new ApiError(400, `Invalid email in allowlist: ${raw}`, 'INVALID_ALLOWLIST');
    }
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }

  for (const email of BUILT_IN_PLATFORM_ALLOWLIST_EMAILS) add(email);
  for (const raw of value) add(raw);
  return emails;
}

export function isValidEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email));
}
