import { ApiError } from '../../utils/errors.js';
import { recoveryHash, durableState } from '../../utils/recoveryHash.js';

const identityFields = ['campaignId', 'name', 'email', 'phone', 'contactId', 'redemptionToken', 'deletedAt'];
const control = new Set(['status', 'launchLease', 'launchApproval', 'deliveryRevision', 'updatedAt', 'createdAt', '__v']);
const delivery = new Set(['schedule.invitesSentAt', 'schedule.inviteClaimedAt', 'schedule.invitesUnresolved', 'schedule.pointsCreditedAt', 'schedule.launchNoticeAt']);
const locked = () => new ApiError(409, 'Approved launch details require review before editing', 'CAMPAIGN_LAUNCH_LOCKED');

export function approvalConfig(value) {
  const { _id, status, launchLease, launchApproval, deliveryRevision, razorpayPaymentId, ...config } = durableState(value);
  config.schedule = { mode: value.schedule?.mode || 'now', sendAt: value.schedule?.sendAt || null,
    timezone: value.schedule?.timezone || 'Asia/Kolkata' };
  return config;
}

// Narrow model guards protect ordinary save/query edits after approval. Mutable
// redemption balances/statuses and delivery markers retain their existing paths.
// Raw Mongo writes still require operational access controls; dispatch revalidates.
export function pointsApprovalGuard(schema, { recipient = false } = {}) {
  const protectedPath = path => recipient ? identityFields.includes(path.split('.')[0])
    : !control.has(path.split('.')[0]) && !delivery.has(path);
  const editable = recipient ? { launchIdentityHash: null }
    : { $or: [{ type: { $ne: 'points' } }, { 'launchApproval.hash': { $exists: false } }] };
  const frozen = recipient ? { launchIdentityHash: { $ne: null } }
    : { type: 'points', 'launchApproval.hash': { $exists: true } };
  schema.pre('save', async function () {
    if (this.isNew || (!recipient && this.type !== 'points')) return;
    if (!this.modifiedPaths().some(protectedPath)) return;
    const previous = await this.constructor.findOne({ tenantId: this.tenantId, _id: this._id })
      .select(recipient ? '+launchIdentityHash' : '+launchApproval').session(this.$session()).lean();
    const changed = recipient ? identityFields.some(key => recoveryHash(previous?.[key]) !== recoveryHash(this[key]))
      : recoveryHash(approvalConfig(previous)) !== recoveryHash(approvalConfig(this.toObject()));
    if (!changed) return;
    if (recipient ? previous?.launchIdentityHash : previous?.launchApproval?.hash) throw locked();
    this.$where = { ...this.$where, ...editable };
  });
  for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(operation, async function () {
      const update = this.getUpdate();
      const paths = Object.entries(update || {}).flatMap(([operator, value]) => operator === '$setOnInsert' ? []
        : operator.startsWith('$') ? Object.keys(value || {}) : [operator]);
      paths.push(...Object.values(update?.$rename || {}));
      if (!operation.toLowerCase().includes('delete') && !operation.toLowerCase().includes('replace')
        && !Array.isArray(update) && !paths.some(protectedPath)) return;
      if (await this.model.exists({ tenantId: this.getFilter().tenantId, $and: [this.getFilter(), frozen] }).session(this.getOptions().session || null)) throw locked();
      this.where({ $and: [...(this.getFilter().$and || []), editable] });
    });
  }
}
