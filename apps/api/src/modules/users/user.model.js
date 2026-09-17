import mongoose from 'mongoose';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

// NOTE: User is NOT tenant-guard-scoped because platform users have
// tenantId: null. Services must still filter by tenantId for tenant routes.
const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null, select: false },
    googleId: { type: String, default: null, sparse: true, index: true },
    phone: { type: String, default: '' },
    status: { type: String, enum: ['invited', 'active', 'suspended'], default: 'invited' },
    lastLoginAt: { type: Date, default: null },
    // Bumped to invalidate all outstanding access JWTs (e.g. demo password rotate/revoke).
    sessionVersion: { type: Number, default: 0 },
    // §security hardening B2 — Mongo-backed brute-force lockout (holds even when
    // Redis rate limiting is unavailable).
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    inviteTokenHash: { type: String, default: null, select: false },
    inviteTokenExpiresAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.plugin(softDeletePlugin);

export const User = mongoose.model('User', userSchema);
