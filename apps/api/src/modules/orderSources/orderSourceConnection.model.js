import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import {
  ORDER_SOURCE_DEFAULT_POLL_MIN,
  ORDER_SOURCE_PROVIDERS,
  ORDER_SOURCE_STATUSES,
  ORDER_SOURCE_WEBHOOK_STATUSES,
} from './orderSources.constants.js';

/**
 * One client store/API that ShelfMerch pulls orders from.
 * Credentials and the webhook secret are AES-256-GCM encrypted
 * (utils/tokenEncryption.js) and never leave the server — see publicConnection().
 */
const orderSourceConnectionSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ORDER_SOURCE_PROVIDERS, required: true },
    name: { type: String, required: true, trim: true },
    /**
     * Shopify: bare myshopify host. Custom REST: host of config.baseUrl.
     * Part of the per-tenant uniqueness key.
     */
    shopDomain: { type: String, default: '' },
    /** JSON of provider credentials, encrypted. */
    encryptedCredentials: { type: String, default: '', select: false },
    /** Custom REST: request + field-mapping config (no secrets). See adapters/customRest.config.js. */
    config: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ORDER_SOURCE_STATUSES, default: 'active', index: true },
    pollIntervalMin: { type: Number, default: ORDER_SOURCE_DEFAULT_POLL_MIN, min: 5, max: 1440 },
    /** Highest updated_at successfully ingested. Next poll reads from here (minus overlap). */
    syncCursor: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    lastSyncStatus: { type: String, default: '' },
    lastError: { type: String, default: '' },
    syncLockToken: { type: String, default: '' },
    syncLockUntil: { type: Date, default: null },

    /** Shopify: the custom app's client secret. Custom REST: a secret we generate. */
    encryptedWebhookSecret: { type: String, default: '', select: false },
    webhookStatus: { type: String, enum: ORDER_SOURCE_WEBHOOK_STATUSES, default: 'none' },
    webhookError: { type: String, default: '' },
    /** Provider-side subscription ids, so we can remove them on disconnect. */
    webhookSubscriptionIds: { type: [String], default: [] },
    lastWebhookAt: { type: Date, default: null },

    /** Send tracking back to the client's system when an order ships. */
    pushFulfillment: { type: Boolean, default: true },

    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

orderSourceConnectionSchema.plugin(tenantScopePlugin);
orderSourceConnectionSchema.index({ tenantId: 1, provider: 1, shopDomain: 1 }, { unique: true });

export function webhookPath(connectionId) {
  return `/api/v1/order-sources/webhook/${String(connectionId)}`;
}

export function publicConnection(doc) {
  const c = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(c._id),
    tenantId: String(c.tenantId),
    provider: c.provider,
    name: c.name,
    shopDomain: c.shopDomain || '',
    config: c.config ?? null,
    status: c.status,
    pollIntervalMin: c.pollIntervalMin,
    syncCursor: c.syncCursor,
    lastSyncedAt: c.lastSyncedAt,
    lastSyncStatus: c.lastSyncStatus || '',
    lastError: c.lastError || '',
    webhookStatus: c.webhookStatus || 'none',
    webhookError: c.webhookError || '',
    webhookPath: webhookPath(c._id),
    lastWebhookAt: c.lastWebhookAt ?? null,
    pushFulfillment: c.pushFulfillment !== false,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const OrderSourceConnection = mongoose.model('OrderSourceConnection', orderSourceConnectionSchema);
