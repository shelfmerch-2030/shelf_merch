import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../../plugins/tenantScope.plugin.js';
import { MERGE_HRIS_INTEGRATIONS } from '../merge.constants.js';

const mergeHrisEmploymentSchema = new mongoose.Schema(
  {
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MergeConnection',
      required: true,
      index: true,
    },
    provider: { type: String, enum: MERGE_HRIS_INTEGRATIONS, required: true },
    mergeEmploymentId: { type: String, required: true },
    mergeEmployeeId: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    employmentType: { type: String, default: '' },
    effectiveDate: { type: Date, default: null },
    payFrequency: { type: String, default: '' },
    payPeriod: { type: String, default: '' },
    lastSyncedAt: { type: Date, default: null },
    source: { type: String, default: 'merge' },
  },
  { timestamps: true },
);

mergeHrisEmploymentSchema.plugin(tenantScopePlugin);
mergeHrisEmploymentSchema.index(
  { tenantId: 1, connectionId: 1, mergeEmploymentId: 1 },
  { unique: true },
);

export const MergeHrisEmployment = mongoose.model(
  'MergeHrisEmployment',
  mergeHrisEmploymentSchema,
);
