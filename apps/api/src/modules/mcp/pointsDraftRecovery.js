import mongoose from 'mongoose';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { Contact } from '../contacts/contact.model.js';
import { Entity } from '../entities/entity.model.js';
import { McpWriteConfirmation } from './mcpWriteConfirmation.model.js';
import { recoveryHash, durableState } from '../../utils/recoveryHash.js';

const iso = value => value ? new Date(value).toISOString() : null;
const plain = value => value?.toObject?.() || value || {};
function manifestRow(row) {
  return { email: row.email.toLowerCase(), name: row.name, phone: row.phone || '', contactId: row.contactId ? String(row.contactId) : null, creditAmount: row.creditAmount || 0,
    redemptionStatus: row.redemptionStatus || 'invited', invitedAt: iso(row.invitedAt), inviteClaimedAt: iso(row.inviteClaimedAt) };
}
const manifestHash = rows => recoveryHash(rows.map(manifestRow).sort((a, b) => a.email.localeCompare(b.email)));
function configuration(campaign) {
  const { _id, tenantId, entityId, createdBy, ...state } = durableState(campaign);
  return state;
}
export async function draftRecipientsVersion(tenantId, campaignId) {
  return manifestHash(await Recipient.find({ tenantId, campaignId }).lean());
}
export async function captureDraftProof(tenantId, actorUserId, input, campaign) {
  const existing = campaign ? await Recipient.find({ tenantId, campaignId: campaign._id }).lean() : [];
  const wanted = input.resolvedRecipients || input.recipients;
  const contacts = await Contact.find({ tenantId, email: { $in: wanted.map(row => row.email) } }).select('_id email').lean();
  const byEmail = new Map(existing.map(row => [row.email.toLowerCase(), row]));
  for (const row of wanted) byEmail.set(row.email, { ...byEmail.get(row.email), ...row, phone: row.phone || '', contactId: row.contactId || contacts.find(contact => contact.email === row.email)?._id || null, creditAmount: input.creditsPerRecipient });
  const rows = [...byEmail.values()];
  const planned = Number(campaign?.draftState?.recips || 0);
  const selected = campaign?.draftState?.selRecips?.length || 0;
  // Apply the same model defaults as savePointsDraft, without saving a document.
  const expected = configuration(new Campaign({
    ...campaign?.toObject(), name: input.name, type: 'points', shopId: input.shopId, pointsScope: input.pointsScope, creditsPerRecipient: input.creditsPerRecipient,
    status: wanted.length && (!campaign || campaign.status === 'draft') ? 'recipients_uploaded' : campaign?.status || 'draft',
    recipientCount: planned > 0 ? planned : wanted.length ? Math.max(rows.length, selected) : selected,
    message: { ...plain(campaign?.message), ...input.message }, schedule: { ...plain(campaign?.schedule), ...input.schedule },
  }));
  const entity = input.resolvedEntityId ? await Entity.findOne({ tenantId, _id: input.resolvedEntityId }).select('walletId') : null;
  return { version: 1, configurationHash: recoveryHash(expected), manifestHash: manifestHash(rows), count: rows.length,
    inputHash: recoveryHash(wanted), campaignId: campaign ? String(campaign._id) : null, entityId: input.resolvedEntityId || null,
    walletId: String(input.walletId || entity?.walletId), actorUserId: String(actorUserId) };
}
export async function draftProof(tenantId, actorUserId, confirmationId) {
  const row = await McpWriteConfirmation.findOne({ tenantId, actorUserId, confirmationId, operation: 'campaigns.points_draft' }).select('recoveryProof').lean();
  return row?.recoveryProof?.version === 1 ? row.recoveryProof : null;
}
export async function proveDraft(tenantId, input, proof, candidate) {
  if (!proof || !candidate || proof.inputHash !== recoveryHash(input.resolvedRecipients || input.recipients)) return false;
  const session = await mongoose.startSession();
  try {
    let matches = false;
    await session.withTransaction(async () => {
      matches = false;
      const current = await Campaign.findOne({ tenantId, _id: candidate._id }).session(session);
      if (!current || (proof.campaignId && String(current._id) !== proof.campaignId)) return;
      if (!proof.campaignId && String(current.createdBy) !== proof.actorUserId) return;
      if (proof.entityId && String(current.entityId) !== proof.entityId) return;
      const entity = await Entity.findOne({ tenantId, _id: current.entityId }).select('walletId').session(session);
      if (!entity || String(entity.walletId) !== proof.walletId || current.type !== 'points') return;
      if (recoveryHash(configuration(current)) !== proof.configurationHash) return;
      const rows = await Recipient.find({ tenantId, campaignId: current._id }).session(session).lean();
      matches = manifestHash(rows) === proof.manifestHash;
    }, { readConcern: { level: 'snapshot' } });
    return matches;
  } finally { await session.endSession(); }
}
