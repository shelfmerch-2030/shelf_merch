import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

export const API_KEY_MODES = ['live', 'test'];
export const API_KEY_SCOPES = [
  'orders:read',
  'orders:write',
  'products:read',
  'sku_mappings:read',
  'sku_mappings:write',
  'catalog:read',
  'catalog:import',
];

/**
 * A tenant's credential for the public Orders API.
 * Token: `smk_<mode>_<publicId>_<secret>`. Only an HMAC of the secret is
 * stored; the full token is shown to the creator once.
 */
const apiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    mode: { type: String, enum: API_KEY_MODES, required: true },
    publicId: { type: String, required: true, unique: true },
    secretHash: { type: String, required: true, select: false },
    last4: { type: String, required: true },
    scopes: { type: [{ type: String, enum: API_KEY_SCOPES }], default: () => [...API_KEY_SCOPES] },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

apiKeySchema.plugin(tenantScopePlugin);
apiKeySchema.index({ tenantId: 1, revokedAt: 1, createdAt: -1 });

export function keyPrefix(doc) {
  return `smk_${doc.mode}_${doc.publicId}_…${doc.last4}`;
}

/** Safe to return to clients: never includes the secret or its hash. */
export function publicApiKey(doc) {
  const k = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(k._id),
    name: k.name,
    mode: k.mode,
    prefix: keyPrefix(k),
    scopes: k.scopes,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
  };
}

export const ApiKey = mongoose.model('ApiKey', apiKeySchema);
