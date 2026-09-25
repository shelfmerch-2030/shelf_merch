import jwt from 'jsonwebtoken';
import {
  env,
  googleAuthConfigured,
  googleCallbackUrl,
  googleClientUrl,
} from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import {
  getPrimaryRoleAssignment,
  issueRefreshToken,
  register,
  signAccessToken,
} from './auth.service.js';
import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { assertAllowedAuthEmail } from './workEmail.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_SCOPES = ['openid', 'email', 'profile'].join(' ');

function assertGoogleConfigured() {
  if (!googleAuthConfigured()) {
    throw new ApiError(503, 'Google sign-in is not configured', 'GOOGLE_NOT_CONFIGURED');
  }
}

function signOAuthState(mode) {
  return jwt.sign({ mode, purpose: 'google_oauth' }, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

export function verifyOAuthState(state) {
  const payload = jwt.verify(state, env.JWT_ACCESS_SECRET);
  if (payload.purpose !== 'google_oauth' || !['login', 'signup'].includes(payload.mode)) {
    throw new ApiError(400, 'Invalid OAuth state', 'INVALID_OAUTH_STATE');
  }
  return payload;
}

export function buildGoogleAuthUrl(mode) {
  assertGoogleConfigured();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleCallbackUrl(),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state: signOAuthState(mode),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForProfile(code) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: googleCallbackUrl(),
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) {
    throw new ApiError(401, 'Google sign-in failed — try again', 'GOOGLE_TOKEN_EXCHANGE_FAILED');
  }
  const tokenData = await tokenRes.json();
  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileRes.ok) {
    throw new ApiError(401, 'Could not load Google profile', 'GOOGLE_PROFILE_FAILED');
  }
  const profile = await profileRes.json();
  if (!profile.email || !profile.sub) {
    throw new ApiError(400, 'Google account is missing required profile fields', 'GOOGLE_PROFILE_INCOMPLETE');
  }
  return {
    googleId: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name || profile.email.split('@')[0],
    emailVerified: profile.email_verified === true,
  };
}

function companyNameFromEmail(email) {
  const domain = email.split('@')[1]?.split('.')[0] ?? 'workspace';
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

async function loginExistingGoogleUser(user, { ip, userAgent }) {
  if (user.status === 'suspended') {
    throw new ApiError(
      403,
      'Your account has been suspended. Please contact Shelf Merch support.',
      'ACCOUNT_SUSPENDED',
    );
  }
  if (user.status === 'invited') {
    throw new ApiError(403, 'Invite not yet accepted — set your password first', 'INVITE_PENDING');
  }
  if (user.tenantId) {
    const tenant = await Tenant.findOne({ _id: user.tenantId }).select('status');
    if (tenant?.status === 'archived' || tenant?.status === 'suspended') {
      throw new ApiError(
        403,
        'Your organization account has been suspended. Please contact Shelf Merch support.',
        tenant.status === 'archived' ? 'TENANT_ARCHIVED' : 'TENANT_SUSPENDED',
      );
    }
    if (tenant?.status === 'suspended') {
      throw new ApiError(401, 'This workspace has been suspended — contact support', 'TENANT_SUSPENDED');
    }
  }
  const roleAssignment = await getPrimaryRoleAssignment(user._id);
  user.lastLoginAt = new Date();
  await user.save();
  return {
    accessToken: signAccessToken(user, roleAssignment),
    refreshToken: await issueRefreshToken(user._id, { ip, userAgent }),
    user: {
      id: String(user._id),
      tenantId: roleAssignment.tenantId ? String(roleAssignment.tenantId) : null,
      name: user.name,
      email: user.email,
      role: roleAssignment.role,
      scopeType: roleAssignment.scopeType,
      assignedEntityIds: (roleAssignment.assignedEntityIds ?? []).map(String),
    },
  };
}

export async function completeGoogleOAuth({ code, mode, ip, userAgent }) {
  assertGoogleConfigured();
  const profile = await exchangeCodeForProfile(code);
  await assertAllowedAuthEmail(profile.email);

  let user =
    (await User.findOne({ googleId: profile.googleId })) ||
    (await User.findOne({ email: profile.email }));

  if (user) {
    if (!user.googleId) {
      user.googleId = profile.googleId;
      await user.save();
    }
    return loginExistingGoogleUser(user, { ip, userAgent });
  }

  if (mode === 'login') {
    throw new ApiError(404, 'No account found for this Google email — sign up first', 'GOOGLE_NO_ACCOUNT');
  }

  return register({
    name: profile.name,
    email: profile.email,
    password: null,
    companyName: companyNameFromEmail(profile.email),
    ip,
    userAgent,
    googleId: profile.googleId,
  });
}

export function buildClientRedirect(result) {
  const hash = new URLSearchParams({
    accessToken: result.accessToken,
    user: JSON.stringify(result.user),
  });
  return `${googleClientUrl()}#${hash.toString()}`;
}

export function buildClientErrorRedirect(err) {
  const params = new URLSearchParams({
    error: err.code || 'GOOGLE_AUTH_FAILED',
    message: err.message || 'Google sign-in failed',
  });
  return `${googleClientUrl()}?${params.toString()}`;
}
