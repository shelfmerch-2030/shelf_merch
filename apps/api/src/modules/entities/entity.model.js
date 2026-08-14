import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

const entitySchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    colorHex: { type: String, default: '#2563EB' },
    expectedUsers: { type: Number, default: 0 },
    allocatedAmount: { type: Number, default: 0 },
    spentAmount: { type: Number, default: 0 }, // cached, derived from wallet transactions
    managerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    managerInvitePending: { type: Boolean, default: false },
    managerTitle: { type: String, default: '' },
    managerName: { type: String, default: '' },
    managerEmail: { type: String, default: '' },
    /** Slack low-budget threshold-crossing state */
    lowBudgetAlertActive: { type: Boolean, default: false },
    lowBudgetAlertCycle: { type: Number, default: 0 },
  },
  { timestamps: true },
);

entitySchema.plugin(tenantScopePlugin);
entitySchema.plugin(softDeletePlugin);
entitySchema.index({ tenantId: 1, walletId: 1 });

export const Entity = mongoose.model('Entity', entitySchema);
