import { PlatformSetting, PLATFORM_SETTING_DEFAULTS } from './platformSetting.model.js';
import { normalizeEmailAllowlist } from '../auth/emailAllowlistPolicy.js';

function normalizeStoredSettingValue(key, value) {
  if (key === 'auth.emailAllowlist') {
    return normalizeEmailAllowlist(Array.isArray(value) ? value : []);
  }
  return value;
}

export async function getSetting(key) {
  const doc = await PlatformSetting.findOne({ key }).lean();
  const value = doc ? doc.value : (PLATFORM_SETTING_DEFAULTS[key] ?? null);
  return normalizeStoredSettingValue(key, value);
}

export async function getAllSettings() {
  const docs = await PlatformSetting.find({}).lean();
  const overrides = Object.fromEntries(docs.map((d) => [d.key, d.value]));
  const settings = { ...PLATFORM_SETTING_DEFAULTS, ...overrides };
  settings['auth.emailAllowlist'] = normalizeStoredSettingValue(
    'auth.emailAllowlist',
    settings['auth.emailAllowlist'],
  );
  return settings;
}

export async function setSetting(key, value, userId = null) {
  const nextValue = key === 'auth.emailAllowlist' ? normalizeEmailAllowlist(value) : value;
  const doc = await PlatformSetting.findOneAndUpdate(
    { key },
    { value: nextValue, updatedByUserId: userId },
    { new: true, upsert: true },
  );
  return doc;
}
