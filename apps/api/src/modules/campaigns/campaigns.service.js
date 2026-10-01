import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { Campaign } from './campaign.model.js';
import { Recipient } from './recipient.model.js';
import { Entity } from '../entities/entity.model.js';
import { Contact } from '../contacts/contact.model.js';
import { Shop } from '../shops/shop.model.js';
import { Kit } from '../kits/kit.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { customisedKitSendTotals, curatedKitSendTotals, kitSendTotals, sampleKitSendTotals, sumKitProductPrices } from '../kits/kitPricing.js';
import { Order } from '../orders/order.model.js';
import { resolveCuratedApproxValueInr, parseCuratedKitMeta, isCuratedKitMeta } from '../kits/curatedKitMeta.js';
import { Wallet } from '../wallets/wallet.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import * as ledger from '../../services/ledger.service.js';
import { transitionState, validNextStatuses, canTransition } from '../../services/stateMachine.service.js';
import { notify } from '../notifications/notifications.service.js';
import { enqueueScheduledCampaignDelivery } from '../../jobs/queues.js';
import { recordUsage } from '../../services/usage.service.js';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { assertEntityAccess } from '../../middleware/abac.middleware.js';
import { assertCampaignSpendPayment } from '../payments/payments.service.js';
import { scheduleSlackBusinessNotification, evaluateEntityLowBudgetAlert } from '../integrations/slack/slackNotify.service.js';
import { SLACK_EVENT_TYPES } from '../integrations/slack/slack.events.js';

function withCampaignMeta(campaign) {
  const obj = campaign.toObject ? campaign.toObject() : campaign;
  return { ...obj, validNextStatuses: validNextStatuses('campaign', obj.status) };
}

function isExternalPay(paymentMode) {
  return paymentMode === 'upi' || paymentMode === 'card';
}

const INCOMPLETE_CAMPAIGN_STATUSES = ['draft', 'recipients_uploaded', 'credits_allocated', 'approved'];

async function assertWalletCanSpend({ tenantId, entityId, amount, user }) {
  const budget = Math.round(amount ?? 0);
  if (budget <= 0) return;
  const { entity, wallet } = await ledger.resolveSpendWalletForEntity({ tenantId, entityId });

  const entityAvailable = Math.max(0, entity.allocatedAmount - entity.spentAmount);

  if (user?.scopeType === 'entity') {
    if (budget > entityAvailable) {
      throw new ApiError(
        422,
        `Insufficient budget: available ₹${entityAvailable}, required ₹${budget}`,
        'INSUFFICIENT_FUNDS',
      );
    }
    if (budget > wallet.balance) {
      throw new ApiError(
        422,
        `Insufficient wallet cash to complete this send (₹${wallet.balance} available)`,
        'INSUFFICIENT_FUNDS',
      );
    }
    return;
  }

  if (budget > wallet.balance) {
    throw new ApiError(
      422,
      `Insufficient wallet balance: cash ₹${wallet.balance}, required ₹${budget}`,
      'INSUFFICIENT_FUNDS',
    );
  }

  const unalloc = Math.max(0, wallet.balance - wallet.allocatedAmount);
  if (budget > unalloc) {
    throw new ApiError(
      422,
      `Insufficient wallet balance: available ₹${unalloc}, required ₹${budget}`,
      'INSUFFICIENT_FUNDS',
    );
  }
}

function transitionRedemption(recipient, toStatus) {
  const from = recipient.redemptionStatus;
  if (!canTransition('redemption', from, toStatus)) {
    throw new ApiError(422, `Invalid redemption transition: ${from} -> ${toStatus}`, 'INVALID_STATE_TRANSITION');
  }
  recipient.redemptionStatus = toStatus;
  const now = new Date();
  if (toStatus === 'opened') recipient.openedAt = now;
  if (toStatus === 'verified') recipient.verifiedAt = now;
  if (toStatus === 'redeemed' || toStatus === 'order_created') recipient.redeemedAt = now;
}

/** Close out a points send when its credit is fully spent — only legal hops. */
function finalizeRecipientRedemption(recipient) {
  if (recipient.redemptionStatus === 'order_created') return;

  const stepsByStatus = {
    invited: ['opened', 'verified', 'redeemed', 'order_created'],
    opened: ['verified', 'redeemed', 'order_created'],
    verified: ['redeemed', 'order_created'],
    redeemed: ['order_created'],
  };
  const steps = stepsByStatus[recipient.redemptionStatus];
  if (!steps) return;

  for (const step of steps) {
    if (recipient.redemptionStatus === 'order_created') break;
    transitionRedemption(recipient, step);
  }
}

export async function listCampaigns({ tenantId, user }) {
  const filter = {
    tenantId,
    name: { $ne: '__storefront_self_serve__' },
  };
  if (user.scopeType === 'entity') {
    filter.entityId = { $in: user.assignedEntityIds };
  }
  const campaigns = await Campaign.find(filter).sort({ createdAt: -1 });
  return campaigns.map(withCampaignMeta);
}

export async function getCampaign({ tenantId, campaignId, user }) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (user?.scopeType === 'entity') {
    const allowed = (user.assignedEntityIds ?? []).map(String);
    if (!allowed.includes(String(campaign.entityId))) throw new ForbiddenError();
  }
  return withCampaignMeta(campaign);
}

export async function createCampaign({ tenantId, userId, user, data }) {
  const entity = await Entity.findOne({ _id: data.entityId, tenantId });
  if (!entity) throw new NotFoundError('Entity not found');
  assertEntityAccess(user, entity._id);

  if (data.shopId) {
    const shop = await Shop.findOne({ _id: data.shopId, tenantId });
    if (!shop) throw new NotFoundError('Shop not found');
  }
  if (data.kitId) {
    const kit = await Kit.findOne({ _id: data.kitId, tenantId });
    if (!kit) throw new NotFoundError('Kit not found');
  }

  const campaign = await Campaign.create({
    tenantId,
    entityId: data.entityId,
    name: data.name,
    type: data.type,
    fulfillmentMode: data.fulfillmentMode,
    singleLocation: data.singleLocation,
    catalogMode: data.catalogMode,
    selectedProductIds: data.selectedProductIds ?? [],
    kitId: data.kitId ?? null,
    shopId: data.shopId ?? null,
    isSample: Boolean(data.isSample),
    brandingEnabled: Boolean(data.brandingEnabled),
    pointsScope: data.pointsScope ?? 'shop',
    message: data.message ?? {},
    schedule: data.schedule ?? { mode: 'now' },
    createdBy: userId,
  });
  return withCampaignMeta(campaign);
}

export async function updateCampaign({ tenantId, campaignId, user, patch }) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  const { status: _s, recipientCount: _rc, totalBudget: _tb, entityId, ...rest } = patch;
  if (user?.scopeType === 'entity') {
    const allowed = (user.assignedEntityIds ?? []).map(String);
    const nextEntityId = entityId != null ? String(entityId) : String(campaign.entityId);
    const canAccess =
      allowed.includes(String(campaign.entityId)) || allowed.includes(nextEntityId);
    if (!canAccess) throw new ForbiddenError();
  }
  if (entityId !== undefined && String(entityId) !== String(campaign.entityId)) {
    if (!INCOMPLETE_CAMPAIGN_STATUSES.includes(campaign.status)) {
      throw new ApiError(422, 'Cannot change budget source after launch', 'CAMPAIGN_LOCKED');
    }
    const entity = await Entity.findOne({ _id: entityId, tenantId });
    if (!entity) throw new NotFoundError('Entity not found');
    assertEntityAccess(user, entity._id);
    campaign.entityId = entityId;
  }
  for (const key of Object.keys(rest)) {
    if (rest[key] === undefined) delete rest[key];
  }
  Object.assign(campaign, rest);
  await campaign.save();
  return withCampaignMeta(campaign);
}

/** Save or update an incomplete points send wizard draft. */
export async function savePointsDraft({ tenantId, userId, user, data }) {
  const entity = await Entity.findOne({ _id: data.entityId, tenantId });
  if (!entity) throw new NotFoundError('Entity not found');
  assertEntityAccess(user, entity._id);

  const shop = await Shop.findOne({ _id: data.shopId, tenantId });
  if (!shop) throw new NotFoundError('Shop not found');

  let campaign;
  if (data.campaignId) {
    campaign = await Campaign.findOne({ _id: data.campaignId, tenantId });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!INCOMPLETE_CAMPAIGN_STATUSES.includes(campaign.status)) {
      throw new ApiError(422, 'Only incomplete campaigns can be saved as drafts', 'CAMPAIGN_LOCKED');
    }
    if (String(campaign.shopId) !== String(data.shopId)) throw new ForbiddenError();
    if (campaign.type !== 'points') {
      throw new ApiError(422, 'Only points campaigns support wizard drafts', 'INVALID_CAMPAIGN_TYPE');
    }
  } else {
    campaign = await Campaign.create({
      tenantId,
      entityId: data.entityId,
      name: data.name,
      type: 'points',
      shopId: data.shopId,
      pointsScope: data.pointsScope ?? 'shop',
      message: data.message ?? {},
      schedule: data.schedule ?? { mode: 'now' },
      createdBy: userId,
      status: 'draft',
    });
  }

  campaign.name = data.name;
  campaign.pointsScope = data.pointsScope ?? campaign.pointsScope;
  campaign.creditsPerRecipient = data.creditsPerRecipient ?? 0;
  if (data.message) {
    campaign.message = { ...campaign.message, ...data.message };
  }
  if (data.schedule) {
    campaign.schedule = { ...campaign.schedule, ...data.schedule };
  }
  if (data.draftState) {
    const prev = campaign.draftState?.toObject?.() ?? campaign.draftState ?? {};
    campaign.draftState = { ...prev, ...data.draftState };
  }

  const plannedRecips = Number(
    data.draftState?.recips ?? campaign.draftState?.recips ?? 0,
  );
  const selectedRecips = data.draftState?.selRecips?.length ?? campaign.draftState?.selRecips?.length ?? 0;

  await campaign.save();

  if (data.recipients?.length) {
    await upsertRecipientsFromList({ tenantId, campaign, rows: data.recipients });
    const uploadedCount = await Recipient.countDocuments({ tenantId, campaignId: campaign._id });
    campaign.recipientCount = plannedRecips > 0 ? plannedRecips : Math.max(uploadedCount, selectedRecips);
    if (campaign.status === 'draft') {
      transitionState('campaign', campaign, 'recipients_uploaded', { userId: user.userId });
    }
    await campaign.save();
  } else {
    campaign.recipientCount = plannedRecips > 0 ? plannedRecips : selectedRecips;
    await campaign.save();
  }

  return withCampaignMeta(campaign);
}

export async function deleteCampaign({ tenantId, campaignId, user }) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (user?.scopeType === 'entity') {
    const allowed = (user.assignedEntityIds ?? []).map(String);
    if (!allowed.includes(String(campaign.entityId))) throw new ForbiddenError();
  }
  if (!INCOMPLETE_CAMPAIGN_STATUSES.includes(campaign.status)) {
    throw new ApiError(422, 'Only incomplete campaigns can be deleted', 'CAMPAIGN_LOCKED');
  }

  // Incomplete drafts are permanently removed — nothing launched yet to retain for audit.
  await Recipient.deleteMany({ tenantId, campaignId: campaign._id });
  await Campaign.deleteOne({ _id: campaignId, tenantId });

  return { ok: true };
}

async function upsertRecipientsFromList({ tenantId, campaign, rows }) {
  const created = [];
  for (const row of rows) {
    let contactId = row.contactId ?? null;
    if (!contactId && row.email) {
      const contact = await Contact.findOne({ tenantId, email: row.email.toLowerCase() });
      contactId = contact?._id ?? null;
    }
    const recipient = await Recipient.findOneAndUpdate(
      { tenantId, campaignId: campaign._id, email: row.email.toLowerCase() },
      {
        $set: {
          name: row.name,
          phone: row.phone ?? '',
          contactId,
          creditAmount: row.creditAmount ?? campaign.creditsPerRecipient ?? 0,
          variants: row.variants,
        },
        $setOnInsert: {
          tenantId,
          campaignId: campaign._id,
          redemptionToken: nanoid(32),
          redemptionStatus: 'invited',
          invitedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    created.push(recipient);
  }
  return created;
}

/** §7.8 — CSV or manual recipient list. */
export async function importRecipients({
  tenantId,
  campaignId,
  user,
  recipients,
  totalBudget,
  packaging,
  paymentMode = 'wallet',
  razorpayOrderId,
  razorpayPaymentId,
}) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (user?.scopeType === 'entity') {
    const allowed = (user.assignedEntityIds ?? []).map(String);
    if (!allowed.includes(String(campaign.entityId))) throw new ForbiddenError();
  }
  if (!['draft', 'recipients_uploaded'].includes(campaign.status)) {
    throw new ApiError(422, 'Recipients cannot be changed after credits are allocated', 'CAMPAIGN_LOCKED');
  }

  const rows = await upsertRecipientsFromList({ tenantId, campaign, rows: recipients });
  campaign.recipientCount = await Recipient.countDocuments({ tenantId, campaignId: campaign._id });
  if (campaign.status === 'draft') {
    transitionState('campaign', campaign, 'recipients_uploaded', { userId: user.userId });
  }
  // Kit / items sends skip credit allocation — approve once recipients are uploaded.
  if (['kit', 'items'].includes(campaign.type) && campaign.status === 'recipients_uploaded') {
    campaign.creditsPerRecipient = 0;
    let budget = Math.round(totalBudget ?? 0);

    // Recompute kit checkout so wallet debit matches product pricing.
    // Customised kits: strip product GST by category, then apply kit GST.
    // Curated kits: keep existing inclusive kitPrice + 18% formula.
    if (campaign.type === 'kit' && campaign.kitId) {
      const kit = await Kit.findOne({ _id: campaign.kitId, tenantId });
      if (kit) {
        let curated = false;
        try {
          const meta = kit.designNotes ? JSON.parse(kit.designNotes) : null;
          curated = Boolean(meta?.curated);
        } catch {
          curated = false;
        }

        const pkg =
          packaging === 'none'
            ? 'none'
            : packaging === 'wrap'
              ? 'wrap'
              : packaging === 'box'
                ? 'box'
                : kit.packaging === 'none'
                  ? 'none'
                  : 'box';
        campaign.packaging = pkg;

        let computed;
        if (!curated && kit.productRefs?.length) {
          const products = await CatalogProduct.find({
            _id: { $in: kit.productRefs.map((r) => r.catalogProductId).filter(Boolean) },
          })
            .select('basePriceInr category')
            .lean();
          computed = campaign.isSample
            ? sampleKitSendTotals({
                kind: 'customised',
                packaging: pkg,
                products,
                recipientCount: campaign.recipientCount,
              })
            : customisedKitSendTotals(
                campaign.recipientCount,
                pkg === 'box' ? 'box' : 'none',
                products,
              );
        } else {
          const meta = parseCuratedKitMeta(kit.designNotes);
          let pricePerKit = isCuratedKitMeta(meta)
            ? await resolveCuratedApproxValueInr(kit, meta)
            : Math.round(Number(kit.kitPrice) || 0);
          if (pricePerKit <= 0 && kit.productRefs?.length) {
            const products = await CatalogProduct.find({
              _id: { $in: kit.productRefs.map((r) => r.catalogProductId).filter(Boolean) },
            })
              .select('basePriceInr')
              .lean();
            pricePerKit = sumKitProductPrices(products);
          }
          computed = campaign.isSample
            ? sampleKitSendTotals({
                kind: 'pre-designed',
                packaging: pkg,
                pricePerKitInr: pricePerKit,
                recipientCount: campaign.recipientCount,
              })
            : curatedKitSendTotals(
                campaign.recipientCount,
                pricePerKit,
                pkg === 'box' ? 'box' : 'none',
              );
        }
        // Checkout Grand Total is the source of truth when the client sends it;
        // otherwise recompute with the shared formula.
        budget = Math.round(totalBudget ?? 0) > 0 ? Math.round(totalBudget) : Math.round(computed.total);
      }
    } else if (packaging === 'none' || packaging === 'box' || packaging === 'wrap') {
      campaign.packaging = packaging;
    }

    const externalPay = isExternalPay(paymentMode);
    if (budget > 0) {
      if (externalPay) {
        await assertCampaignSpendPayment({
          tenantId,
          expectedAmountInr: budget,
          razorpayOrderId,
          razorpayPaymentId,
          campaignId: campaign._id,
        });
        campaign.paymentMode = paymentMode;
        if (razorpayPaymentId) campaign.razorpayPaymentId = razorpayPaymentId;
      } else {
        await assertWalletCanSpend({
          tenantId,
          entityId: campaign.entityId,
          amount: budget,
          user,
        });
        campaign.paymentMode = 'wallet';
      }
      campaign.totalBudget = budget;
    } else {
      campaign.totalBudget = 0;
      campaign.paymentMode = externalPay ? paymentMode : 'wallet';
    }
    transitionState('campaign', campaign, 'credits_allocated', { userId: user.userId });
    transitionState('campaign', campaign, 'approved', { userId: user.userId });
  }
  await campaign.save();
  return { count: rows.length, campaign: withCampaignMeta(campaign) };
}

export async function allocateCredits({
  tenantId,
  campaignId,
  user,
  creditsPerRecipient,
  totalBudget: totalBudgetOverride,
  paymentMode = 'wallet',
  razorpayOrderId,
  razorpayPaymentId,
}) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (user?.scopeType === 'entity') {
    const allowed = (user.assignedEntityIds ?? []).map(String);
    if (!allowed.includes(String(campaign.entityId))) throw new ForbiddenError();
  }

  const count = await Recipient.countDocuments({ tenantId, campaignId: campaign._id });
  if (count === 0) throw new ApiError(422, 'Upload recipients before allocating credits', 'NO_RECIPIENTS');

  const perRecipient = Math.round(Number(creditsPerRecipient) || 0);
  if (!Number.isInteger(Number(creditsPerRecipient)) || perRecipient !== Number(creditsPerRecipient)) {
    throw new ApiError(422, 'Budget per recipient must be a whole number', 'INVALID_BUDGET');
  }
  if (perRecipient < 250) {
    throw new ApiError(422, 'Minimum of ₹250 must be allocated', 'BUDGET_TOO_LOW');
  }

  const totalBudget = Math.round(totalBudgetOverride ?? perRecipient * count);
  const externalPay = isExternalPay(paymentMode);

  if (externalPay) {
    await assertCampaignSpendPayment({
      tenantId,
      expectedAmountInr: totalBudget,
      razorpayOrderId,
      razorpayPaymentId,
      campaignId: campaign._id,
    });
  } else {
    await assertWalletCanSpend({
      tenantId,
      entityId: campaign.entityId,
      amount: totalBudget,
      user,
    });
    const entity = await Entity.findOne({ _id: campaign.entityId, tenantId });
    if (user?.scopeType === 'entity') {
      const entityAvailable = entity.allocatedAmount - entity.spentAmount;
      if (totalBudget > entityAvailable) {
        throw new ApiError(
          422,
          `Total budget ₹${totalBudget} exceeds entity available budget ₹${entityAvailable}`,
          'INSUFFICIENT_ENTITY_BUDGET',
        );
      }
    }
  }

  campaign.creditsPerRecipient = perRecipient;
  campaign.recipientCount = count;
  campaign.totalBudget = totalBudget;
  campaign.paymentMode = externalPay ? paymentMode : 'wallet';
  if (externalPay && razorpayPaymentId) {
    campaign.razorpayPaymentId = razorpayPaymentId;
  }
  // Scheduled sends: hold point credit until sendAt (wallet is still debited at launch).
  const deferCredits = campaign.schedule?.mode === 'scheduled';
  await Recipient.updateMany(
    { tenantId, campaignId: campaign._id },
    { creditAmount: deferCredits ? 0 : perRecipient },
  );

  if (campaign.status === 'recipients_uploaded') {
    transitionState('campaign', campaign, 'credits_allocated', { userId: user.userId });
    transitionState('campaign', campaign, 'approved', { userId: user.userId });
  }
  await campaign.save();
  return withCampaignMeta(campaign);
}

async function buildInviteContext(campaign, tenantId) {
  const [tenant, kit, shop] = await Promise.all([
    Tenant.findById(tenantId).select('name').lean(),
    campaign.kitId ? Kit.findOne({ _id: campaign.kitId, tenantId }).select('name').lean() : null,
    campaign.shopId
      ? Shop.findOne({ _id: campaign.shopId, tenantId })
          .select('name logoUrl bannerConfig currencyMode')
          .lean()
      : null,
  ]);
  const isFulfillment = campaign.type === 'kit' || campaign.type === 'items';
  const isSurprise = campaign.fulfillmentMode === 'surprise';
  const isSingle = campaign.fulfillmentMode === 'single';
  const fromLabel = campaign.message?.from?.trim() || campaign.name;
  const inviteBody =
    campaign.message?.body?.trim() ||
    (isSurprise
      ? `${fromLabel} is sending you a surprise gift. No action is required from you.`
      : isFulfillment
        ? 'Choose your gift using the link below.'
        : 'Redeem your gift using the link we sent.');
  const inviteTitle = isSurprise
    ? `You've received a gift from ${fromLabel}!`
    : isFulfillment
      ? `${fromLabel} sent you a gift`
      : `You're invited: ${campaign.name}`;
  const companyName = tenant?.name || 'your company';
  const giftName =
    campaign.type === 'points' ? `${shop?.name || campaign.name} points` : kit?.name || campaign.name;
  return {
    isFulfillment,
    isSurprise,
    isSingle,
    fromLabel,
    inviteBody,
    inviteTitle,
    companyName,
    giftName,
    shop,
  };
}

/** Deliver invite emails (and mark recipients invited). Safe to call once per campaign. */
async function sendCampaignInvites(campaign, tenantId) {
  const ctx = await buildInviteContext(campaign, tenantId);
  if (campaign.isSample) return ctx;
  if (ctx.isSingle) {
    await notify({
      type: 'single_location_gift',
      tenantId,
      email: campaign.singleLocation.email,
      title: `${ctx.companyName} is sending gifts to ${campaign.singleLocation.name}`,
      body: `${campaign.recipientCount} gift${campaign.recipientCount === 1 ? '' : 's'} will be shipped to the provided address.`,
    });
    return ctx;
  }

  const recipients = await Recipient.find({ tenantId, campaignId: campaign._id });
  // Enqueue in parallel — notify() only waits on Redis push (or fire-and-forget), not SMTP.
  await Promise.all(
    recipients.map((r) =>
      notify({
        type: ctx.isSurprise ? 'surprise_gift' : 'redemption_invite',
        tenantId,
        email: r.email,
        title: ctx.inviteTitle,
        body: ctx.inviteBody,
        link: ctx.isSurprise ? '' : `/redeem/${r.redemptionToken}`,
        meta: {
          recipientName: r.name,
          senderName: ctx.fromLabel,
          message: ctx.inviteBody,
          giftName: ctx.giftName,
          companyName: ctx.companyName,
          campaignType: campaign.type,
          fulfillmentMode: campaign.fulfillmentMode,
          pointsScope: campaign.pointsScope ?? 'shop',
          shopName: ctx.shop?.name ?? '',
          shopLogoUrl: ctx.shop?.logoUrl ?? '',
          shopBannerTheme: ctx.shop?.bannerConfig?.theme ?? '',
          shopBannerPreset: ctx.shop?.bannerConfig?.preset ?? '',
          shopCurrencyMode: ctx.shop?.currencyMode ?? 'points',
        },
      }),
    ),
  );
  await Recipient.updateMany({ tenantId, campaignId: campaign._id }, { invitedAt: new Date() });
  return ctx;
}

async function createFulfillmentOrdersIfNeeded(campaign, tenantId) {
  const isFulfillment = campaign.type === 'kit' || campaign.type === 'items';
  if (!isFulfillment) return;

  if (campaign.fulfillmentMode === 'surprise') {
    const { createSurpriseOrdersForCampaign } = await import('../redemptions/redemptions.service.js');
    await createSurpriseOrdersForCampaign({ tenantId, campaign });
  }
  if (campaign.fulfillmentMode === 'single') {
    const { createSingleLocationOrderForCampaign } = await import(
      '../redemptions/redemptions.service.js'
    );
    await createSingleLocationOrderForCampaign({ tenantId, campaign });
  }
  // Redeem mode: orders are created when the recipient accepts via /redemptions/:token/submit.
}

/**
 * Credit deferred points + send invites for a scheduled campaign that is due.
 * Safe to call for overdue campaigns (recovery). Idempotent via invitesSentAt.
 */
export async function deliverScheduledCampaign({ tenantId, campaignId, userId = null }) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (campaign.schedule?.mode !== 'scheduled') {
    throw new ApiError(422, 'Campaign is not scheduled', 'NOT_SCHEDULED');
  }
  if (campaign.schedule?.invitesSentAt) {
    return withCampaignMeta(campaign);
  }
  if (campaign.status !== 'launched' && campaign.status !== 'redemption_open') {
    throw new ApiError(422, 'Campaign is not ready for scheduled delivery', 'NOT_LAUNCHED');
  }

  // Credit points now (held at 0 from allocate when scheduled).
  if (campaign.type === 'points' && campaign.creditsPerRecipient > 0) {
    await Recipient.updateMany(
      { tenantId, campaignId: campaign._id },
      { creditAmount: campaign.creditsPerRecipient },
    );
  }

  await createFulfillmentOrdersIfNeeded(campaign, tenantId);
  const ctx = await sendCampaignInvites(campaign, tenantId);

  if (campaign.status === 'launched') {
    transitionState('campaign', campaign, 'redemption_open', { userId });
  }
  campaign.schedule = campaign.schedule || {};
  campaign.schedule.invitesSentAt = new Date();
  campaign.markModified('schedule');
  await campaign.save();

  if (campaign.kitId) {
    await Kit.updateOne({ _id: campaign.kitId, tenantId }, { lastSentAt: new Date() });
  }

  const entity = await Entity.findOne({ _id: campaign.entityId, tenantId }).select('managerUserId');
  if (entity?.managerUserId) {
    await notify({
      type: 'campaign_launched',
      tenantId,
      userId: entity.managerUserId,
      title: `Scheduled send delivered: ${campaign.name}`,
      body: ctx.isSurprise
        ? `${campaign.recipientCount} surprise gift orders created.`
        : ctx.isSingle
          ? `One delivery order created for ${campaign.recipientCount} recipients.`
          : `${campaign.recipientCount} recipients invited.`,
      link: `/campaigns/${campaign._id}`,
    });
  }

  return withCampaignMeta(campaign);
}

/** Poll due scheduled campaigns and deliver invites + credits (including overdue). */
export async function processDueScheduledCampaigns({ limit = 50 } = {}) {
  const now = new Date();
  const due = await Campaign.find({
    status: 'launched',
    'schedule.mode': 'scheduled',
    'schedule.sendAt': { $lte: now },
    $or: [{ 'schedule.invitesSentAt': null }, { 'schedule.invitesSentAt': { $exists: false } }],
  })
    .setOptions({ skipTenantGuard: true })
    .sort({ 'schedule.sendAt': 1 })
    .limit(limit);

  const results = [];
  for (const campaign of due) {
    try {
      const delivered = await deliverScheduledCampaign({
        tenantId: campaign.tenantId,
        campaignId: campaign._id,
      });
      results.push({ id: String(campaign._id), ok: true, status: delivered.status });
    } catch (err) {
      results.push({ id: String(campaign._id), ok: false, error: err.message });
    }
  }
  return results;
}

/** §7.8 /launch — idempotent wallet debit (or Razorpay-paid) + invite notifications. */
export async function launchCampaign({
  tenantId,
  campaignId,
  user,
  paymentMode = 'wallet',
  razorpayOrderId,
  razorpayPaymentId,
}) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (user?.scopeType === 'entity') {
    const allowed = (user.assignedEntityIds ?? []).map(String);
    if (!allowed.includes(String(campaign.entityId))) throw new ForbiddenError();
  }
  if (campaign.status === 'launched' || campaign.status === 'redemption_open') {
    return withCampaignMeta(campaign);
  }
  if (campaign.status !== 'approved') {
    throw new ApiError(422, 'Campaign must be approved before launch', 'CAMPAIGN_NOT_APPROVED');
  }

  const scheduleMode = campaign.schedule?.mode ?? 'now';
  const isScheduled = scheduleMode === 'scheduled';
  const sendInvitesNow = scheduleMode === 'now';
  const openRedemptionNow = scheduleMode !== 'scheduled';

  if (isScheduled) {
    if (!campaign.schedule?.sendAt) {
      throw new ApiError(422, 'Scheduled campaigns require a sendAt timestamp', 'SCHEDULE_MISSING');
    }
  }

  const entity = await Entity.findOne({ _id: campaign.entityId, tenantId });
  if (!entity) throw new NotFoundError('Entity not found');

  // Surprise/single: create Orders before charging so a failure (e.g. curated kit with
  // no lines, missing addresses) does not debit the wallet orphaned.
  // Redeem mode defers order creation until the recipient accepts.
  if (openRedemptionNow) {
    await createFulfillmentOrdersIfNeeded(campaign, tenantId);
  }

  const mode = isExternalPay(paymentMode)
    ? paymentMode
    : isExternalPay(campaign.paymentMode)
      ? campaign.paymentMode
      : 'wallet';
  const externalPay = isExternalPay(mode);
  const payOrderId = razorpayOrderId || undefined;
  const payPaymentId = razorpayPaymentId || campaign.razorpayPaymentId || undefined;

  if (externalPay) {
    await assertCampaignSpendPayment({
      tenantId,
      expectedAmountInr: campaign.totalBudget,
      razorpayOrderId: payOrderId,
      razorpayPaymentId: payPaymentId,
      campaignId: campaign._id,
    });
    campaign.paymentMode = mode;
    campaign.razorpayPaymentId = payPaymentId;
  } else {
    const { wallet } = await ledger.resolveSpendWalletForEntity({
      tenantId,
      entityId: campaign.entityId,
    });

    // Re-validate funds immediately before debit so Send never proceeds on a stale balance.
    if (campaign.totalBudget > 0) {
      await assertWalletCanSpend({
        tenantId,
        entityId: campaign.entityId,
        amount: campaign.totalBudget,
        user,
      });
    }

    const spendFromEntity = user?.scopeType === 'entity';
    if (campaign.totalBudget > 0) {
      await ledger.createTransaction({
        tenantId,
        walletId: wallet._id,
        type: 'campaign_spend',
        amount: -Math.round(campaign.totalBudget),
        relatedEntityId: spendFromEntity ? entity._id : null,
        description: `Campaign launch: ${campaign.name}`,
        performedBy: user.userId,
      });
    }
    campaign.paymentMode = 'wallet';
  }

  transitionState('campaign', campaign, 'launched', { userId: user.userId });

  if (openRedemptionNow) {
    transitionState('campaign', campaign, 'redemption_open', { userId: user.userId });
  }
  // Scheduled: stay at `launched` until sendAt — no emails, no point credit yet.

  await campaign.save();
  recordUsage(tenantId, 'campaigns.launched');

  if (isScheduled && campaign.schedule?.sendAt) {
    await enqueueScheduledCampaignDelivery({
      tenantId,
      campaignId: campaign._id,
      sendAt: campaign.schedule.sendAt,
    });
  }

  if (sendInvitesNow) {
    try {
      const ctx = await sendCampaignInvites(campaign, tenantId);
      campaign.schedule = campaign.schedule || {};
      campaign.schedule.invitesSentAt = new Date();
      campaign.markModified('schedule');
      await campaign.save();

      if (entity.managerUserId) {
        await notify({
          type: 'campaign_launched',
          tenantId,
          userId: entity.managerUserId,
          title: `Campaign launched: ${campaign.name}`,
          body: ctx.isSurprise
            ? `${campaign.recipientCount} surprise gift orders created.`
            : ctx.isSingle
              ? `One delivery order created for ${campaign.recipientCount} recipients.`
              : `${campaign.recipientCount} recipients invited.`,
          link: `/campaigns/${campaign._id}`,
        });
      }
    } catch (err) {
      // Wallet is already debited and campaign is launched — do not fail the API response.
      console.error('Post-launch invite delivery failed:', err);
    }
    if (campaign.kitId) {
      await Kit.updateOne({ _id: campaign.kitId, tenantId }, { lastSentAt: new Date() });
    }
  } else if (openRedemptionNow && campaign.kitId) {
    await Kit.updateOne({ _id: campaign.kitId, tenantId }, { lastSentAt: new Date() });
  }

  // Slack: one notification per successful launch (idempotent via campaignId eventKey).
  const actorUserId = user?.userId || campaign.createdBy;
  const entityFresh =
    (await Entity.findOne({ _id: entity._id, tenantId }).setOptions({ skipTenantGuard: true })) ||
    entity;
  const remainingBudget = Math.max(
    0,
    (entityFresh.allocatedAmount || 0) - (entityFresh.spentAmount || 0),
  );
  if (campaign.type === 'points') {
    scheduleSlackBusinessNotification({
      tenantId,
      type: SLACK_EVENT_TYPES.POINTS_DISTRIBUTED,
      eventKey: `POINTS_DISTRIBUTED:${campaign._id}`,
      resourceType: 'Campaign',
      resourceId: campaign._id,
      actorUserId,
      payload: {
        entityName: entityFresh.name || entity.name,
        recipientCount: campaign.recipientCount,
        totalPoints: campaign.totalBudget,
        remainingBudget,
      },
    });
  } else if (campaign.type === 'kit' || campaign.type === 'items') {
    let kitName = 'Kit';
    if (campaign.kitId) {
      const kit = await Kit.findOne({ _id: campaign.kitId, tenantId }).select('name').lean();
      if (kit?.name) kitName = kit.name;
    }
    scheduleSlackBusinessNotification({
      tenantId,
      type: SLACK_EVENT_TYPES.KITS_ASSIGNED,
      eventKey: `KITS_ASSIGNED:${campaign._id}`,
      resourceType: 'Campaign',
      resourceId: campaign._id,
      actorUserId,
      payload: {
        entityName: entityFresh.name || entity.name,
        kitName,
        recipientCount: campaign.recipientCount,
      },
    });
  }

  evaluateEntityLowBudgetAlert({ tenantId, entityId: entityFresh._id }).catch(() => {});

  const meta = withCampaignMeta(campaign);
  if (campaign.fulfillmentMode === 'single') {
    const order = await Order.findOne({ tenantId, campaignId: campaign._id }).select(
      'orderNumber _id',
    );
    if (order) {
      meta.orderNumber = order.orderNumber;
      meta.orderId = String(order._id);
    }
  }
  return meta;
}

export async function closeCampaign({ tenantId, campaignId, user }) {
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) throw new NotFoundError('Campaign not found');
  assertEntityAccess(user, campaign.entityId);
  transitionState('campaign', campaign, 'redemption_closed', { userId: user.userId });
  await campaign.save();
  return withCampaignMeta(campaign);
}

export async function campaignReport({ tenantId, campaignId, user }) {
  await getCampaign({ tenantId, campaignId, user });
  const recipients = await Recipient.find({ tenantId, campaignId }).select(
    'name email creditAmount redemptionStatus openedAt verifiedAt redeemedAt',
  );
  return { recipients };
}

export { transitionRedemption, finalizeRecipientRedemption };
