import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../../../plugins/tenantScope.plugin.js';
import { MERGE_HRIS_INTEGRATIONS } from '../merge.constants.js';

const mergeHrisEmployeeSchema = new mongoose.Schema(
  {
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MergeConnection',
      required: true,
      index: true,
    },
    provider: { type: String, enum: MERGE_HRIS_INTEGRATIONS, required: true },
    mergeEmployeeId: { type: String, required: true },
    remoteEmployeeId: { type: String, default: '' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    displayName: { type: String, default: '' },
    workEmail: { type: String, default: '' },
    personalEmail: { type: String, default: '' },
    mobilePhoneNumber: { type: String, default: '' },
    employmentStatus: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    managerMergeEmployeeId: { type: String, default: '' },
    departmentMergeIds: { type: [String], default: [] },
    locationMergeId: { type: String, default: '' },
    startDate: { type: Date, default: null },
    terminationDate: { type: Date, default: null },
    rawModifiedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    source: { type: String, default: 'merge' },
  },
  { timestamps: true },
);

mergeHrisEmployeeSchema.plugin(tenantScopePlugin);
mergeHrisEmployeeSchema.index(
  { tenantId: 1, connectionId: 1, mergeEmployeeId: 1 },
  { unique: true },
);

export const MergeHrisEmployee = mongoose.model('MergeHrisEmployee', mergeHrisEmployeeSchema);
