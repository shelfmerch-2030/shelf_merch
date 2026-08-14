import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../../plugins/tenantScope.plugin.js';
import { MERGE_HRIS_INTEGRATIONS } from '../merge.constants.js';

const mergeHrisLocationSchema = new mongoose.Schema(
  {
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MergeConnection',
      required: true,
      index: true,
    },
    provider: { type: String, enum: MERGE_HRIS_INTEGRATIONS, required: true },
    mergeLocationId: { type: String, required: true },
    remoteId: { type: String, default: '' },
    name: { type: String, default: '' },
    street1: { type: String, default: '' },
    street2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    country: { type: String, default: '' },
    lastSyncedAt: { type: Date, default: null },
    source: { type: String, default: 'merge' },
  },
  { timestamps: true },
);

mergeHrisLocationSchema.plugin(tenantScopePlugin);
mergeHrisLocationSchema.index(
  { tenantId: 1, connectionId: 1, mergeLocationId: 1 },
  { unique: true },
);

export const MergeHrisLocation = mongoose.model('MergeHrisLocation', mergeHrisLocationSchema);
