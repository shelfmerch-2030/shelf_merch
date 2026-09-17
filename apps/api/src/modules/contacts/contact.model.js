import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    role: {
      type: String,
      enum: ['Owner', 'Admin', 'Sender', 'Member', 'Non-Member'],
      default: 'Member',
    },
    department: { type: String, default: '' },
    employeeCode: { type: String, default: '' },
    /** Optional split name fields (e.g. Zoho People sync). */
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    designation: { type: String, default: '' },
    workLocation: { type: String, default: '' },
    dateOfJoining: { type: Date, default: null },
    employmentStatus: { type: String, default: '' },
    /** Zoho People form record id — upsert key with tenantId. */
    zohoRecordId: { type: String, default: '', index: true },
    /** Merge HRIS employee UUID — upsert key with tenantId + mergeConnectionId. */
    mergeEmployeeId: { type: String, default: '', index: true },
    /** Merge Linked Account connection that owns mergeEmployeeId. */
    mergeConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MergeConnection',
      default: null,
      index: true,
    },
    source: { type: String, enum: ['manual', 'csv', 'hris'], default: 'manual' },
    address: {
      line1: { type: String, default: '' },
      line2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      country: { type: String, default: 'IN' },
    },
  },
  { timestamps: true },
);

contactSchema.plugin(tenantScopePlugin);
contactSchema.plugin(softDeletePlugin);
contactSchema.index({ tenantId: 1, email: 1 }, { unique: true });
contactSchema.index(
  { tenantId: 1, zohoRecordId: 1 },
  { unique: true, partialFilterExpression: { zohoRecordId: { $gt: '' } } },
);
contactSchema.index(
  { tenantId: 1, mergeConnectionId: 1, mergeEmployeeId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      mergeEmployeeId: { $gt: '' },
      mergeConnectionId: { $type: 'objectId' },
    },
  },
);

export const Contact = mongoose.model('Contact', contactSchema);
