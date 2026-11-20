import { Campaign } from './campaign.model.js';
import { Recipient } from './recipient.model.js';
import { Entity } from '../entities/entity.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { recoveryHash, durableState } from '../../utils/recoveryHash.js';
import { validNextStatuses } from '../../services/stateMachine.service.js';
import { ApiError } from '../../utils/errors.js';

// Hashes, not recipient data, are stored in recovery receipts. Bind every durable
// campaign/recipient field, including delivery settings and redemption state.
async function allocationState({ tenantId, campaignId }, session = null) {
  const campaign = await Campaign.findOne({ tenantId, _id: campaignId }).session(session).lean();
  if (!campaign) return null;
  const recipients = await Recipient.find({ tenantId, campaignId }).sort({ _id: 1 }).session(session).lean();
  const entity = await Entity.findOne({ tenantId, _id: campaign.entityId }).session(session).lean();
  const wallet = entity && await Wallet.findOne({ tenantId, _id: entity.walletId }).session(session).lean();
  return { campaign: durableState(campaign), recipients: recipients.map(durableState),
    entity: entity && durableState(entity), wallet: wallet && durableState(wallet) };
}

export async function allocationStateHash(input, session = null) { return recoveryHash(await allocationState(input, session)); }

export function allocationRecovery(input) {
  const actorHash = recoveryHash(input.user);
  return {
    capture: async () => {
      const state = await allocationState(input);
      const beforeHash = recoveryHash(state);
      if (input.confirmedStateHash && beforeHash !== input.confirmedStateHash) throw new ApiError(409, 'The preview is out of date', 'CONFIRMATION_STALE');
      if (!state) return { version: 1, actorHash, beforeHash: null };
      const amount = Number(input.creditsPerRecipient);
      state.campaign.creditsPerRecipient = amount;
      state.campaign.recipientCount = state.recipients.length;
      state.campaign.totalBudget = Math.round(input.totalBudget ?? amount * state.recipients.length);
      state.campaign.paymentMode = 'wallet';
      if (state.campaign.status === 'recipients_uploaded') state.campaign.status = 'approved';
      for (const row of state.recipients) row.creditAmount = state.campaign.schedule?.mode === 'scheduled' ? 0 : amount;
      return { version: 1, actorHash, beforeHash, afterHash: recoveryHash(state) };
    },
    inspect: async (proof, session = null) => {
      if (proof?.version !== 1 || proof.actorHash !== actorHash || !proof.beforeHash) return { outcome: 'uncertain' };
      const state = await allocationState(input, session);
      const hash = recoveryHash(state);
      if (hash === proof.afterHash) return { outcome: 'completed', result: { ...state.campaign, validNextStatuses: validNextStatuses('campaign', state.campaign.status) } };
      return { outcome: hash === proof.beforeHash ? 'absent' : 'uncertain' };
    },
  };
}
