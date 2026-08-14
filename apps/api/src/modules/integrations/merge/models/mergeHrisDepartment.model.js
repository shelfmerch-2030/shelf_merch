import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../../plugins/tenantScope.plugin.js';
import { MERGE_HRIS_INTEGRATIONS } from '../merge.constants.js';

const mergeHrisDepartmentSchema = new mongoose.Schema(
  {
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MergeConnection',
      required: true,
      index: true,
    },
    provider: { type: String, enum: MERGE_HRIS_INTEGRATIONS, required: true },
    mergeDepartmentId: { type: String, required: true },
    remoteId: { type: String, default: '' },
    name: { type: String, default: '' },
    parentDepartmentMergeId: { type: String, default: '' },
    lastSyncedAt: { type: Date, default: null },
    source: { type: String, default: 'merge' },
  },
  { timestamps: true },
);

mergeHrisDepartmentSchema.plugin(tenantScopePlugin);
mergeHrisDepartmentSchema.index(
  { tenantId: 1, connectionId: 1, mergeDepartmentId: 1 },
  { unique: true },
);

export const MergeHrisDepartment = mongoose.model(
  'MergeHrisDepartment',
  mergeHrisDepartmentSchema,
);
