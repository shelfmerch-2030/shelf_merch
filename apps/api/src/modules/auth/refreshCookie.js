import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import { env } from '../../config/env.js';

/** HttpOnly refresh-session cookie. Never readable from JavaScript. */
export const REFRESH_COOKIE = 'sm_refresh';

const REFRESH_COOKIE_PATH = '/';
/** Previous path, cleared on logout so an older cookie does not linger. */
const LEGACY_REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;

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

export function setRefreshCookie(res, token) {
  res.append('Set-Cookie', serializeCookie(REFRESH_COOKIE, token, cookieOptions(REFRESH_MAX_AGE_SEC)));
}

export function clearRefreshCookie(res) {
  res.append('Set-Cookie', serializeCookie(REFRESH_COOKIE, '', cookieOptions(0)));
  res.append(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE, '', cookieOptions(0, LEGACY_REFRESH_COOKIE_PATH)),
  );
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
