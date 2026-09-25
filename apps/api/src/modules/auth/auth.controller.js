import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { accessVerifyOptions } from '../../config/jwt.js';
import { writeAudit } from '../../services/audit.service.js';
import * as authService from './auth.service.js';
import * as googleAuth from './googleAuth.service.js';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from './refreshCookie.js';

function publicSession(result) {
  return {
    accessToken: result.accessToken,
    user: result.user,
  };
}

function sendAuthSession(res, result, status = 200) {
  setRefreshCookie(res, result.refreshToken);
  res.status(status).json(publicSession(result));
}

function userIdFromAccessHeader(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, accessVerifyOptions());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function register(req, res) {
  const result = await authService.register({
    ...req.body,
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? '',
  });
  writeAudit({
    req: { ...req, user: { userId: result.user.id, role: result.user.role }, tenantId: result.user.tenantId },
    action: 'auth.register',
    entityType: 'User',
    entityId: result.user.id,
  });
  sendAuthSession(res, result, 201);
}

export async function startSignup(req, res) {
  const result = await authService.startSignup({ ...req.body, ip: req.ip });
  writeAudit({
    req,
    action: 'auth.signup_otp_sent',
    entityType: 'SignupPending',
    after: { email: result.email },
  });
  res.status(200).json(result);
}

export async function resendSignupOtp(req, res) {
  const result = await authService.resendSignupOtp(req.body);
  writeAudit({
    req,
    action: 'auth.signup_otp_resent',
    entityType: 'SignupPending',
    after: { email: result.email },
  });
  res.json(result);
}

export async function verifySignupOtp(req, res) {
  const result = await authService.verifySignupOtp({
    ...req.body,
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? '',
  });
  writeAudit({
    req: { ...req, user: { userId: result.user.id, role: result.user.role }, tenantId: result.user.tenantId },
    action: 'auth.signup_verified',
    entityType: 'User',
    entityId: result.user.id,
  });
  sendAuthSession(res, result, 201);
}

export async function login(req, res) {
  try {
    const result = await authService.login({
      ...req.body,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    });
    writeAudit({
      req: { ...req, user: { userId: result.user.id, role: result.user.role }, tenantId: result.user.tenantId },
      action: 'auth.login',
      entityType: 'User',
      entityId: result.user.id,
    });
    sendAuthSession(res, result);
  } catch (err) {
    const code = err?.code;
    if (code === 'INVALID_CREDENTIALS') {
      writeAudit({
        req,
        action: 'auth.login_failed',
        entityType: 'User',
        after: { email: req.body?.email },
      });
    }
    throw err;
  }
}

export async function refresh(req, res) {
  try {
    const result = await authService.refresh({
      refreshToken: readRefreshToken(req),
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    });
    sendAuthSession(res, result);
  } catch (err) {
    // A parallel refresh already replaced the cookie. Don't wipe that new cookie.
    if (err?.code !== 'REFRESH_IN_PROGRESS') clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req, res) {
  const everywhere = Boolean(req.body?.everywhere);
  await authService.logout({
    refreshToken: readRefreshToken(req),
    everywhere,
    userId: everywhere ? userIdFromAccessHeader(req) : null,
  });
  clearRefreshCookie(res);
  res.json({ success: true });
}

export async function forgotPassword(req, res) {
  const result = await authService.forgotPassword({ ...req.body, ip: req.ip });
  if (result?.sent) {
    writeAudit({
      req,
      action: 'auth.password_reset_requested',
      entityType: 'User',
      entityId: result.userId,
      after: { email: req.body?.email },
    });
  }
  // Never reveal whether the account exists.
  res.json({
    success: true,
    message: 'If an account exists with this email, a password reset link has been sent.',
  });
}

export async function validateResetToken(req, res) {
  const result = await authService.validateResetToken({ token: req.query.token });
  if (!result.valid) {
    writeAudit({
      req,
      action: 'auth.password_reset_token_invalid',
      entityType: 'PasswordResetToken',
      after: { reason: result.reason },
    });
  }
  res.json(result);
}

export async function resetPassword(req, res) {
  const result = await authService.resetPassword(req.body);
  writeAudit({
    req,
    action: 'auth.password_reset_completed',
    entityType: 'User',
    entityId: result.userId,
  });
  res.json({ success: true });
}

export async function googleStart(req, res) {
  const mode = req.query.mode === 'signup' ? 'signup' : 'login';
  res.redirect(googleAuth.buildGoogleAuthUrl(mode));
}

export async function googleCallback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  if (error) {
    const message = errorDescription || 'Google sign-in was cancelled';
    return res.redirect(
      googleAuth.buildClientErrorRedirect({ code: String(error).toUpperCase(), message }),
    );
  }
  if (!code || !state) {
    return res.redirect(
      googleAuth.buildClientErrorRedirect({
        code: 'GOOGLE_MISSING_PARAMS',
        message: 'Missing Google authorization response',
      }),
    );
  }

  try {
    const { mode } = googleAuth.verifyOAuthState(state);
    const result = await googleAuth.completeGoogleOAuth({
      code,
      mode,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    });
    writeAudit({
      req: { ...req, user: { userId: result.user.id, role: result.user.role }, tenantId: result.user.tenantId },
      action: mode === 'signup' ? 'auth.register.google' : 'auth.login.google',
      entityType: 'User',
      entityId: result.user.id,
    });
    setRefreshCookie(res, result.refreshToken);
    res.redirect(googleAuth.buildClientRedirect(result));
  } catch (err) {
    res.redirect(googleAuth.buildClientErrorRedirect(err));
  }
}
