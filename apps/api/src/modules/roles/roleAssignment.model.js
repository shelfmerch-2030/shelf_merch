import mongoose from 'mongoose';

export const ROLES = [
  'platform_super_admin',
  'platform_ops_admin',
  'platform_catalog_admin',
  'platform_production_manager',
  'platform_finance_admin',
  'platform_sales_manager',
  'platform_support_agent',
  'platform_logistics_manager',
  'platform_readonly_auditor',
  'company_admin',
  'entity_manager',
  'company_finance_user',
  'approver',
  'recipient',
];

export const PLATFORM_ROLES = ROLES.filter((r) => r.startsWith('platform_'));

const roleAssignmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: { type: String, enum: ROLES, required: true },
    scopeType: {
      type: String,
      enum: ['platform', 'tenant', 'entity', 'self'],
      required: true,
    },
    scopeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    assignedEntityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Entity' }],
  },
  { timestamps: true },
);

roleAssignmentSchema.index({ userId: 1, tenantId: 1 });

export const RoleAssignment = mongoose.model('RoleAssignment', roleAssignmentSchema);
