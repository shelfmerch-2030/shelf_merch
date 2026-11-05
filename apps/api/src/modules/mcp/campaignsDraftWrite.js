import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { assertEntityAccess } from '../../middleware/abac.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Entity } from '../entities/entity.model.js';
import { Shop } from '../shops/shop.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { savePointsDraft } from '../campaigns/campaigns.service.js';
import { employeeReaderFromContext } from './employeesRead.js';
import { executeMcpWrite, prepareMcpWrite } from './mcpWriteSafety.js';
import { McpPointsDraftClaim } from './mcpPointsDraftClaim.model.js';

const INCOMPLETE_CAMPAIGN_STATUSES = ['draft', 'recipients_uploaded', 'credits_allocated', 'approved'];
const WRITE_ROLES = new Set(rolesForTenantArea('campaigns', 'write'));

const recipientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  contactId: objectId.optional(),
});

const draftSchema = z.object({
  campaignId: objectId.optional(),
  entityId: objectId,
  shopId: objectId,
  name: z.string().trim().min(1).max(160),
  pointsScope: z.enum(['stadium', 'shop']).optional(),
  creditsPerRecipient: z.number().nonnegative().optional(),
  message: z.object({
    from: z.string().max(160).optional(),
    body: z.string().max(4000).optional(),
  }).optional(),
  schedule: z.object({
    mode: z.enum(['now', 'scheduled', 'self']).optional(),
    sendAt: z.string().datetime().nullable().optional(),
    timezone: z.string().max(80).optional(),
  }).optional(),
  recipients: z.array(recipientSchema).max(500).optional(),
});

export const CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION = [
  'Prepare a Send Points campaign draft without saving the campaign or its recipients.',
  'Use this for both dashboard entry points: a store already chosen, or a store the user picks from shops_list.',
  'Requires a department, a shop, and a campaign name. Recipients are optional until send.',
  'creditsPerRecipient is INR per person. Points stores show ₹1 = 2 Points; INR stores show ₹1 = 1 Credit. Minimum ₹250 whole rupees is enforced when allocating credits, not while saving an unfinished draft.',
  'Pass existing contacts as contactId plus email, or new emails directly. This matches the dashboard: new emails become campaign recipients and are not written to Contacts during prepare or draft save.',
  'CSV import in the dashboard is parsed in the browser into the same recipient list. Pass those rows here; do not ask the user to paste a binary file.',
  'Schedule mode now, scheduled, or self (manual invite link, no email). For scheduled, sendAt must be the UTC instant for that timezone wall clock. The worker delivers from sendAt and does not reinterpret timezone.',
  'Company admins can draft for any department. Department managers can draft only for their departments.',
  'Does not launch the campaign, debit a wallet, create Contacts, or send invitations.',
  'Returns a one-use confirmation. Saving requires campaigns_execute_points_draft.',
].join(' ');

export const CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION = [
  'Save the points campaign draft from campaigns_prepare_points_draft.',
  'Requires the confirmation id and an idempotency key.',
  'Rechecks the caller, department, shop, and draft before writing.',
  'The same draft is updated when another request already created it.',
  'Does not return redemption tokens, recipient emails, or phone numbers.',
  'Does not launch the campaign or debit a wallet.',
].join(' ');

const previewSchema = z.object({
  action: z.enum(['create', 'update']),
  campaignId: z.string().optional(),
  name: z.string(),
  entityId: z.string(),
  shopId: z.string(),
  recipientCount: z.number().int(),
  creditsPerRecipient: z.number(),
});

const resultSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  type: z.literal('points'),
  entityId: z.string(),
  shopId: z.string(),
  recipientCount: z.number().int(),
});

export const campaignsPreparePointsDraftInputSchema = draftSchema;
export const campaignsExecutePointsDraftInputSchema = draftSchema.extend({
  confirmationId: z.string().trim().min(20).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const campaignsPreparePointsDraftOutputSchema = z.object({
  confirmationId: z.string(),
  expiresAt: z.string(),
  preview: previewSchema,
});
export const campaignsExecutePointsDraftOutputSchema = resultSchema;

let claimsReady;

function invalidDetails() {
  return new ApiError(400, 'Campaign draft details are not valid', 'VALIDATION');
}

function duplicateKey(error) {
  return error?.code === 11000 || error?.cause?.code === 11000;
}

function assertDraftWriter(actor) {
  if (!WRITE_ROLES.has(actor?.user?.role)) {
    throw new ForbiddenError('Campaign drafts require a company admin or department manager');
  }
}

function parseDraft(input) {
  const parsed = draftSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidDetails();
  const recipients = new Map();
  for (const row of parsed.data.recipients ?? []) {
    recipients.set(row.email.trim().toLowerCase(), {
      name: row.name.trim(),
      email: row.email.trim().toLowerCase(),
      ...(row.phone ? { phone: row.phone.trim() } : {}),
      ...(row.contactId ? { contactId: row.contactId } : {}),
    });
  }
  return {
    ...(parsed.data.campaignId ? { campaignId: parsed.data.campaignId } : {}),
    entityId: parsed.data.entityId,
    shopId: parsed.data.shopId,
    name: parsed.data.name.trim(),
    pointsScope: parsed.data.pointsScope ?? 'shop',
    creditsPerRecipient: parsed.data.creditsPerRecipient ?? 0,
    ...(parsed.data.message ? { message: parsed.data.message } : {}),
    ...(parsed.data.schedule ? { schedule: { ...parsed.data.schedule, ...(parsed.data.schedule.sendAt ? { sendAt: new Date(parsed.data.schedule.sendAt) } : {}) } } : {}),
    recipients: [...recipients.values()],
  };
}

function nameKey(input) {
  const name = input.name.trim().toLowerCase().replace(/\s+/g, ' ');
  return `points:${input.entityId}:${input.shopId}:${name}`;
}

async function ensureClaims() {
  claimsReady ??= McpPointsDraftClaim.syncIndexes();
  await claimsReady;
}

async function incompleteCampaign(tenantId, campaignId) {
  if (!campaignId) return null;
  const campaign = await Campaign.findOne({ _id: campaignId, tenantId });
  if (!campaign) return null;
  if (!INCOMPLETE_CAMPAIGN_STATUSES.includes(campaign.status)) return null;
  return campaign;
}

async function linkedDraft(tenantId, input) {
  if (input.campaignId) {
    const campaign = await Campaign.findOne({ _id: input.campaignId, tenantId });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!INCOMPLETE_CAMPAIGN_STATUSES.includes(campaign.status)) {
      throw new ApiError(422, 'Only incomplete campaigns can be saved as drafts', 'CAMPAIGN_LOCKED');
    }
    if (campaign.type !== 'points') {
      throw new ApiError(422, 'Only points campaigns support wizard drafts', 'INVALID_CAMPAIGN_TYPE');
    }
    if (String(campaign.shopId) !== String(input.shopId)) throw new ForbiddenError('This draft belongs to a different shop');
    return campaign;
  }
  const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey: nameKey(input) });
  return incompleteCampaign(tenantId, claim?.campaignId);
}

async function assertDraftTarget(tenantId, user, input) {
  const entity = await Entity.findOne({ _id: input.entityId, tenantId });
  if (!entity) throw new NotFoundError('Entity not found');
  assertEntityAccess(user, entity._id);
  const shop = await Shop.findOne({ _id: input.shopId, tenantId });
  if (!shop) throw new NotFoundError('Shop not found');
  const campaign = await linkedDraft(tenantId, input);
  if (campaign) assertEntityAccess(user, campaign.entityId);
  return campaign;
}

async function resourceVersion(tenantId, input) {
  if (input.campaignId) {
    const campaign = await Campaign.findOne({ _id: input.campaignId, tenantId });
    if (!campaign) return { campaignId: input.campaignId, missing: true };
    return {
      campaignId: String(campaign._id),
      status: campaign.status,
      name: campaign.name,
      updatedAt: new Date(campaign.updatedAt).toISOString(),
      recipientCount: campaign.recipientCount ?? 0,
    };
  }
  const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey: nameKey(input) });
  const campaign = await incompleteCampaign(tenantId, claim?.campaignId);
  if (!campaign) return { logicalKey: nameKey(input), campaignId: null };
  return {
    logicalKey: nameKey(input),
    campaignId: String(campaign._id),
    status: campaign.status,
    updatedAt: new Date(campaign.updatedAt).toISOString(),
    recipientCount: campaign.recipientCount ?? 0,
  };
}

function previewFrom(input, campaign) {
  return {
    action: campaign ? 'update' : 'create',
    ...(campaign ? { campaignId: String(campaign._id) } : {}),
    name: input.name,
    entityId: String(input.entityId),
    shopId: String(input.shopId),
    recipientCount: input.recipients.length,
    creditsPerRecipient: input.creditsPerRecipient,
  };
}

function safeResult(campaign) {
  return {
    id: String(campaign._id),
    name: campaign.name,
    status: campaign.status,
    type: 'points',
    entityId: String(campaign.entityId),
    shopId: String(campaign.shopId || ''),
    recipientCount: campaign.recipientCount ?? 0,
  };
}

function normalizedDraftName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function matchingDraft(tenantId, input) {
  const wanted = normalizedDraftName(input.name);
  const rows = await Campaign.find({
    tenantId,
    entityId: input.entityId,
    shopId: input.shopId,
    type: 'points',
    status: { $in: INCOMPLETE_CAMPAIGN_STATUSES },
  }).sort({ createdAt: 1 });
  return rows.find((row) => normalizedDraftName(row.name) === wanted) || null;
}

async function linkMatchingDraft(tenantId, logicalKey, input) {
  const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey });
  const linked = await incompleteCampaign(tenantId, claim?.campaignId);
  if (linked) return String(linked._id);
  if (claim?.campaignId) {
    const locked = await Campaign.findOne({ _id: claim.campaignId, tenantId });
    if (locked && !INCOMPLETE_CAMPAIGN_STATUSES.includes(locked.status)) {
      throw new ApiError(422, 'Only incomplete campaigns can be saved as drafts', 'CAMPAIGN_LOCKED');
    }
  }
  const match = await matchingDraft(tenantId, input);
  if (!match) return null;
  await McpPointsDraftClaim.updateOne(
    { tenantId, logicalKey },
    { $set: { campaignId: match._id } },
    { upsert: true },
  );
  return String(match._id);
}

async function waitForDraft(tenantId, logicalKey, input) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const campaignId = await linkMatchingDraft(tenantId, logicalKey, input);
    if (campaignId) return campaignId;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new ApiError(409, 'This draft is already being saved', 'DRAFT_IN_PROGRESS');
}

async function saveLinkedDraft({ tenantId, actor, input }) {
  let campaignId = input.campaignId;
  let ownsClaim = false;
  const logicalKey = nameKey(input);
  if (!campaignId) {
    const matched = await linkMatchingDraft(tenantId, logicalKey, input);
    if (matched) {
      campaignId = matched;
    } else {
      try {
        await McpPointsDraftClaim.create({ tenantId, logicalKey });
        ownsClaim = true;
      } catch (error) {
        if (!duplicateKey(error)) throw error;
      }
      if (!ownsClaim) campaignId = await waitForDraft(tenantId, logicalKey, input);
    }
  }

  let saved;
  try {
    saved = await savePointsDraft({
    tenantId,
    userId: actor.user.userId,
    user: actor.user,
    data: {
      entityId: input.entityId,
      shopId: input.shopId,
      name: input.name,
      pointsScope: input.pointsScope,
      creditsPerRecipient: input.creditsPerRecipient,
      ...(input.message ? { message: input.message } : {}),
      ...(input.schedule ? { schedule: input.schedule } : {}),
      ...(input.recipients.length ? { recipients: input.recipients } : {}),
      ...(campaignId ? { campaignId } : {}),
    },
  });
  } catch (error) {
    if (ownsClaim) {
      const existing = await Campaign.findOne({
        tenantId,
        entityId: input.entityId,
        shopId: input.shopId,
        name: input.name,
        type: 'points',
        status: { $in: INCOMPLETE_CAMPAIGN_STATUSES },
      }).sort({ createdAt: -1 });
      if (existing) {
        await McpPointsDraftClaim.updateOne({ tenantId, logicalKey }, { $set: { campaignId: existing._id } });
      } else {
        await McpPointsDraftClaim.deleteOne({ tenantId, logicalKey, campaignId: null });
      }
    }
    throw error;
  }

    await McpPointsDraftClaim.updateOne(
    { tenantId, logicalKey: nameKey({ ...input, name: saved.name }) },
    { $set: { campaignId: saved._id } },
    { upsert: true },
  );
  if (logicalKey !== nameKey({ ...input, name: saved.name })) {
    await McpPointsDraftClaim.updateOne(
      { tenantId, logicalKey },
      { $set: { campaignId: saved._id } },
      { upsert: true },
    );
  }
  await writeAudit({
    tenantId,
    req: { tenantId, user: { userId: actor.user.userId, role: actor.user.role } },
    action: 'campaign.save_points_draft',
    entityType: 'Campaign',
    entityId: saved._id,
    after: { status: saved.status, name: saved.name, recipientCount: saved.recipientCount ?? 0 },
  });
  return safeResult(saved);
}

export async function preparePointsDraft({ tenantId, actorUserId, input, now }) {
  const requested = parseDraft(input);
  const planned = {};
  const prepared = await prepareMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.points_draft',
    payload: requested,
    now,
    authorize: async (actor) => {
      assertDraftWriter(actor);
      planned.campaign = await assertDraftTarget(tenantId, actor.user, requested);
    },
    validate: async () => requested,
    resourceState: async () => resourceVersion(tenantId, requested),
    summary: async () => ({
      action: planned.campaign ? 'update' : 'create',
      name: requested.name,
      recipientCount: requested.recipients.length,
    }),
  });
  return {
    confirmationId: prepared.confirmationId,
    expiresAt: prepared.expiresAt,
    preview: previewFrom(requested, planned.campaign),
  };
}

export async function executePointsDraft({
  tenantId,
  actorUserId,
  input,
  confirmationId,
  idempotencyKey,
  now,
}) {
  await ensureClaims();
  const requested = parseDraft(input);
  return executeMcpWrite({
    tenantId,
    actorUserId,
    operation: 'campaigns.points_draft',
    payload: requested,
    confirmationId,
    idempotencyKey,
    now,
    authorize: async (actor) => {
      assertDraftWriter(actor);
      await assertDraftTarget(tenantId, actor.user, requested);
    },
    validate: async () => requested,
    resourceState: async () => resourceVersion(tenantId, requested),
    reconcile: async () => {
      const match = await matchingDraft(tenantId, requested);
      if (match) return { outcome: 'completed', result: safeResult(match) };
      const claim = await McpPointsDraftClaim.findOne({ tenantId, logicalKey: nameKey(requested) });
      if (claim && !claim.campaignId) return { outcome: 'uncertain' };
      return { outcome: 'absent' };
    },
    execute: async (actor) => saveLinkedDraft({ tenantId, actor, input: requested }),
  });
}

function requireCaller(ctx) {
  const caller = employeeReaderFromContext(ctx);
  if (!caller.tenantId || !caller.user.userId) {
    throw new ForbiddenError('Campaign drafts are not available for this account');
  }
  return caller;
}

export async function preparePointsDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return preparePointsDraft({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
  });
}

export async function executePointsDraftForCaller(ctx, args) {
  const caller = requireCaller(ctx);
  return executePointsDraft({
    tenantId: caller.tenantId,
    actorUserId: caller.user.userId,
    input: args,
    confirmationId: args?.confirmationId,
    idempotencyKey: args?.idempotencyKey,
  });
}

export function pointsDraftText(output, heading) {
  const subject = output.preview || output;
  const lines = [
    heading,
    `${subject.name}. ${subject.action || subject.status}. Recipients: ${subject.recipientCount}.`,
  ];
  if (output.confirmationId) lines.push('Confirm this preview before it expires.');
  return lines.join('\n');
}

const DRAFT_ERRORS = {
  FORBIDDEN: 'You cannot save this campaign draft.',
  NOT_FOUND: 'Campaign draft details were not found.',
  VALIDATION: 'Campaign draft details are not valid.',
  CAMPAIGN_LOCKED: 'Only an incomplete campaign can be saved as a draft.',
  INVALID_CAMPAIGN_TYPE: 'Only points campaigns can be saved as a draft.',
  CONFIRMATION_STALE: 'This preview is out of date. Prepare the draft again.',
  CONFIRMATION_EXPIRED: 'This confirmation has expired. Prepare the draft again.',
  CONFIRMATION_REUSED: 'This confirmation was already used.',
  CONFIRMATION_INVALID: 'This confirmation is not valid.',
  CONFIRMATION_MISMATCH: 'This confirmation does not match the requested draft.',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'This idempotency key was used for a different draft.',
  IDEMPOTENT_REPLAY_IN_FLIGHT: 'This draft is already being saved.',
  DRAFT_IN_PROGRESS: 'This draft is already being saved.',
  ACTOR_INACTIVE: 'This account cannot save campaign drafts.',
  TENANT_INACTIVE: 'This workspace cannot save campaign drafts.',
};

export function pointsDraftError(error, fallback) {
  return DRAFT_ERRORS[error?.code] || fallback;
}
