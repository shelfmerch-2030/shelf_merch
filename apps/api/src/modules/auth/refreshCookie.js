import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import { env, REFRESH_TTL_SEC } from '../../config/env.js';

/** HttpOnly refresh-session cookie. Never readable from JavaScript. */
export const REFRESH_COOKIE = 'sm_refresh';

const REFRESH_COOKIE_PATH = '/';
/** Previous path. Cleared whenever a new cookie is set so the browser cannot send both. */
const LEGACY_REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_MAX_AGE_SEC = REFRESH_TTL_SEC;

function cookieOptions(maxAge, path = REFRESH_COOKIE_PATH) {
  const production = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'strict' : 'lax',
    path,
    maxAge,
  };
}

function appendCookie(res, token, maxAge, path = REFRESH_COOKIE_PATH) {
  res.append('Set-Cookie', serializeCookie(REFRESH_COOKIE, token, cookieOptions(maxAge, path)));
}

/** Drop the old path-scoped cookie. A different path is a different cookie. */
function clearLegacyRefreshCookie(res) {
  appendCookie(res, '', 0, LEGACY_REFRESH_COOKIE_PATH);
}

export function setRefreshCookie(res, token) {
  appendCookie(res, token, REFRESH_MAX_AGE_SEC);
  clearLegacyRefreshCookie(res);
}

export function clearRefreshCookie(res) {
  appendCookie(res, '', 0);
  clearLegacyRefreshCookie(res);
}

/**
 * Cookie is the browser source of truth. A body token remains for non-browser
 * clients and tests; the SPA never receives or stores it.
 */
export function readRefreshToken(req) {
  const header = req.headers?.cookie;
  if (header) {
    try {
      const cookies = parseCookie(header);
      if (cookies[REFRESH_COOKIE]) return cookies[REFRESH_COOKIE];
    } catch {
      /* fall through to the body */
    }
  }
  const fromBody = req.body?.refreshToken;
  return typeof fromBody === 'string' && fromBody.length > 0 ? fromBody : null;
}
