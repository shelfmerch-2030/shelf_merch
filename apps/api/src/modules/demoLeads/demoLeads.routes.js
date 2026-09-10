import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { resolveTenant } from '../../middleware/tenant.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { validate } from '../../middleware/validate.middleware.js';
import { logger } from '../../config/logger.js';
import { sendDemoRequestConfirmationEmail } from '../../services/email.service.js';
import { DEMO_LEAD_REQUIREMENTS, DEMO_LEAD_STATUSES, DemoLead } from './demoLead.model.js';
import { inviteSignupAccess } from './demoLeads.service.js';

const router = Router();

const trimString = (max) => z.string().trim().min(1).max(max);

const createDemoLeadSchema = z.object({
  fullName: trimString(120),
  companyName: trimString(160),
  workEmail: z.string().trim().toLowerCase().email().max(254),
  mobileNumber: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+() -]+$/, 'Enter a valid mobile number'),
  requirement: z
    .enum(DEMO_LEAD_REQUIREMENTS)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

const listDemoLeadsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(250).optional(),
  status: z.enum(DEMO_LEAD_STATUSES).optional(),
  requirement: z.enum(DEMO_LEAD_REQUIREMENTS).optional(),
  search: z.string().trim().max(120).optional(),
});

const inviteSignupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    fullName: z.string().trim().max(120).optional(),
    companyName: z.string().trim().max(160).optional(),
  })
  .refine((body) => Boolean(body.email), { message: 'email is required', path: ['email'] });

const objectIdParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid lead id'),
});

async function sendConfirmationOnce(lead) {
  if (!lead || lead.confirmationEmailSentAt) {
    return { success: true, skipped: true };
  }

  // Atomically claim the send so concurrent retries cannot double-email.
  const claimed = await DemoLead.findOneAndUpdate(
    { _id: lead._id, confirmationEmailSentAt: null },
    { $set: { confirmationEmailSentAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!claimed) {
    return { success: true, skipped: true };
  }

  const result = await sendDemoRequestConfirmationEmail({
    to: lead.workEmail,
    fullName: lead.fullName,
    companyName: lead.companyName,
    workEmail: lead.workEmail,
    mobileNumber: lead.mobileNumber,
    requirement: lead.requirement || '',
  });

  if (!result?.success) {
    // Allow a later retry if SMTP failed after the claim.
    await DemoLead.updateOne({ _id: lead._id }, { $set: { confirmationEmailSentAt: null } });
    logger.warn({ leadId: String(lead._id) }, 'Demo confirmation email was not sent');
  }

  return result;
}

router.post(
  '/',
  validate({ body: createDemoLeadSchema }),
  asyncHandler(async (req, res) => {
    const lead = await DemoLead.create({
      ...req.body,
      requirement: req.body.requirement || null,
    });

    try {
      await sendConfirmationOnce(lead);
    } catch (err) {
      logger.warn({ err, leadId: String(lead._id) }, 'Demo confirmation email dispatch failed');
    }

    res.status(201).json({
      id: String(lead._id),
      status: lead.status,
    });
  }),
);

export const platformDemoLeadsRouter = Router();
platformDemoLeadsRouter.use(authenticate, resolveTenant, platformArea('sales', 'read'));
platformDemoLeadsRouter.get(
  '/',
  validate({ query: listDemoLeadsQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 100, maxLimit: 250 });
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.requirement) filter.requirement = req.query.requirement;
    if (req.query.search) {
      filter.$or = [
        { fullName: { $regex: req.query.search, $options: 'i' } },
        { companyName: { $regex: req.query.search, $options: 'i' } },
        { workEmail: { $regex: req.query.search, $options: 'i' } },
        { mobileNumber: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      DemoLead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      DemoLead.countDocuments(filter),
    ]);

    res.json(paginatedResponse(items, total, { page, limit }));
  }),
);

/** Allowlist + email a /signup invite (ad-hoc email). */
platformDemoLeadsRouter.post(
  '/invite-signup',
  platformArea('sales', 'write'),
  validate({ body: inviteSignupSchema }),
  asyncHandler(async (req, res) => {
    const result = await inviteSignupAccess({
      req,
      email: req.body.email,
      fullName: req.body.fullName || '',
      companyName: req.body.companyName || '',
    });
    res.status(200).json(result);
  }),
);

/** Allowlist the lead's work email and email a /signup invite. */
platformDemoLeadsRouter.post(
  '/:id/invite-signup',
  platformArea('sales', 'write'),
  validate({ params: objectIdParam }),
  asyncHandler(async (req, res) => {
    const result = await inviteSignupAccess({
      req,
      leadId: req.params.id,
    });
    res.status(200).json(result);
  }),
);

export default router;
