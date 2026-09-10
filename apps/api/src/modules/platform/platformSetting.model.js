import mongoose from 'mongoose';

// §6 — key/value platform configuration (gst.defaultRate, signup.mode,
// alerts.*, sla.*, notification templates, gateway keys).
const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const PLATFORM_SETTING_DEFAULTS = {
  'gst.defaultRate': 18,
  'signup.mode': 'approval', // open | approval | closed
  'alerts.lowWalletPct': 20,
  'alerts.lowStockDefault': 10,
  'sla.productionDays.default': 7,
  // Exact emails allowed to register / log in (work or personal). Empty = nobody.
  'auth.emailAllowlist': [],
};

export const PlatformSetting = mongoose.model('PlatformSetting', platformSettingSchema);
