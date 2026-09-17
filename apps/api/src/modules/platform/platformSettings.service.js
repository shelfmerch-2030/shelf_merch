import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PlatformSetting, PLATFORM_SETTING_DEFAULTS } from './platformSetting.model.js';
import { normalizeEmailAllowlist } from '../auth/emailAllowlistPolicy.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { RefreshToken } from '../auth/refreshToken.model.js';
import { appendEmailAllowlist, normalizeEmail } from '../auth/workEmail.js';
import { isSessionStoreReady, revokeAllUserSessions } from '../../services/session.service.js';
import { ApiError } from '../../utils/errors.js';

export const DEMO_LOGIN_EMAIL = 'test@shelfmerch.io';
export const DEMO_LOGIN_PASSWORD_SETTING_KEY = 'auth.demoLoginPassword';
export const DEMO_LOGIN_PASSWORD_TTL_DAYS = 5;

const BCRYPT_ROUNDS = 12;
const DEMO_LOGIN_PASSWORD_TTL_MS = DEMO_LOGIN_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000;
const PRIVATE_SETTING_KEYS = new Set([DEMO_LOGIN_PASSWORD_SETTING_KEY]);

function generatePassword() {
  const chunks = crypto.randomBytes(12).toString('base64url').match(/.{1,4}/g) ?? [];
  return `SM-${chunks.join('-')}`;
}

function demoPasswordStatus(value) {
  const expiresAt = value?.expiresAt ? new Date(value.expiresAt) : null;
  const revokedAt = value?.revokedAt ? new Date(value.revokedAt) : null;
  const active = Boolean(value?.passwordHash && expiresAt && expiresAt.getTime() > Date.now() && !revokedAt);
  return {
    email: DEMO_LOGIN_EMAIL,
    ttlDays: DEMO_LOGIN_PASSWORD_TTL_DAYS,
    active,
    generatedAt: value?.generatedAt ?? null,
    expiresAt: value?.expiresAt ?? null,
    revokedAt: value?.revokedAt ?? null,
  };
}

async function resolveDemoAppTenant() {
  const rubix = await Tenant.findOne({ slug: 'rubix', status: 'active' }).select('_id');
  if (rubix) return rubix;
  const any = await Tenant.findOne({ status: 'active' }).sort({ createdAt: 1 }).select('_id');
  if (any) return any;
  throw new ApiError(
    409,
    'Create an active tenant before generating the demo /app login password',
    'DEMO_TENANT_MISSING',
  );
}

async function ensureDemoLoginUser() {
  const email = normalizeEmail(DEMO_LOGIN_EMAIL);
  const tenant = await resolveDemoAppTenant();
  let user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    user = await User.create({
      tenantId: tenant._id,
      name: 'ShelfMerch Test Login',
      email,
      passwordHash: null,
      status: 'active',
    });
  } else {
    const patch = {};
    if (String(user.tenantId || '') !== String(tenant._id)) patch.tenantId = tenant._id;
    if (user.status !== 'active') patch.status = 'active';
    if (user.passwordHash) patch.passwordHash = null;
    if (Object.keys(patch).length) {
      Object.assign(user, patch);
      await user.save();
    }
  }

  // Demo login is /app-only — strip any leftover platform roles from older seeds.
  await RoleAssignment.deleteMany({ userId: user._id });
  await RoleAssignment.create({
    tenantId: tenant._id,
    userId: user._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  await appendEmailAllowlist([email]);
  return user;
}

function normalizeStoredSettingValue(key, value) {
  if (key === 'auth.emailAllowlist') {
    return normalizeEmailAllowlist(Array.isArray(value) ? value : []);
  }
  return value;
}

export async function getSetting(key) {
  const doc = await PlatformSetting.findOne({ key }).lean();
  const value = doc ? doc.value : (PLATFORM_SETTING_DEFAULTS[key] ?? null);
  if (key === DEMO_LOGIN_PASSWORD_SETTING_KEY) {
    return demoPasswordStatus(value);
  }
  return normalizeStoredSettingValue(key, value);
}

export async function getAllSettings() {
  const docs = await PlatformSetting.find({}).lean();
  const overrides = Object.fromEntries(docs.map((d) => [d.key, d.value]));
  const settings = { ...PLATFORM_SETTING_DEFAULTS, ...overrides };
  for (const key of PRIVATE_SETTING_KEYS) {
    delete settings[key];
  }
  settings['auth.emailAllowlist'] = normalizeStoredSettingValue(
    'auth.emailAllowlist',
    settings['auth.emailAllowlist'],
  );
  return settings;
}

export async function setSetting(key, value, userId = null) {
  if (PRIVATE_SETTING_KEYS.has(key)) {
    throw new ApiError(400, 'Use the demo login password endpoint to manage this setting', 'PRIVATE_SETTING');
  }
  const nextValue = key === 'auth.emailAllowlist' ? normalizeEmailAllowlist(value) : value;
  const doc = await PlatformSetting.findOneAndUpdate(
    { key },
    { value: nextValue, updatedByUserId: userId },
    { new: true, upsert: true },
  );
  return doc;
}

export async function getDemoLoginPasswordStatus() {
  const doc = await PlatformSetting.findOne({ key: DEMO_LOGIN_PASSWORD_SETTING_KEY }).lean();
  return demoPasswordStatus(doc?.value);
}

async function revokeDemoLoginSessions() {
  const demoUser = await User.findOne({ email: DEMO_LOGIN_EMAIL }).select('_id');
  if (!demoUser) return;
  // Bump sessionVersion so outstanding access JWTs fail authenticate immediately.
  await User.updateOne({ _id: demoUser._id }, { $inc: { sessionVersion: 1 } });
  if (await isSessionStoreReady()) {
    await revokeAllUserSessions(demoUser._id);
  }
  await RefreshToken.updateMany({ userId: demoUser._id, revokedAt: null }, { revokedAt: new Date() });
}

export async function generateDemoLoginPassword(userId = null) {
  await ensureDemoLoginUser();
  const password = generatePassword();
  const now = new Date();
  const value = {
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEMO_LOGIN_PASSWORD_TTL_MS).toISOString(),
    revokedAt: null,
  };
  const doc = await PlatformSetting.findOneAndUpdate(
    { key: DEMO_LOGIN_PASSWORD_SETTING_KEY },
    { value, updatedByUserId: userId },
    { new: true, upsert: true },
  );
  // Rotation invalidates prior logins so old refresh tokens cannot outlive the secret.
  await revokeDemoLoginSessions();
  return { ...demoPasswordStatus(doc.value), password };
}

export async function revokeDemoLoginPassword(userId = null) {
  const doc = await PlatformSetting.findOne({ key: DEMO_LOGIN_PASSWORD_SETTING_KEY });
  if (!doc?.value?.passwordHash) {
    return getDemoLoginPasswordStatus();
  }
  doc.value = { ...doc.value, revokedAt: new Date().toISOString() };
  doc.updatedByUserId = userId;
  await doc.save();
  await revokeDemoLoginSessions();
  return demoPasswordStatus(doc.value);
}

export async function verifyDemoLoginPassword({ email, password }) {
  if (normalizeEmail(email) !== DEMO_LOGIN_EMAIL || !password) return false;
  const doc = await PlatformSetting.findOne({ key: DEMO_LOGIN_PASSWORD_SETTING_KEY }).lean();
  const status = demoPasswordStatus(doc?.value);
  if (!status.active || !doc?.value?.passwordHash) return false;
  return bcrypt.compare(password, doc.value.passwordHash);
}
