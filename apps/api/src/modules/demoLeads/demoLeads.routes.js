import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { resolveTenant } from '../../middleware/tenant.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { validate } from '../../middleware/validate.middleware.js';
import { DEMO_LEAD_REQUIREMENTS, DEMO_LEAD_STATUSES, DemoLead } from './demoLead.model.js';

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

router.post(
  '/',
  validate({ body: createDemoLeadSchema }),
  asyncHandler(async (req, res) => {
    const lead = await DemoLead.create({
      ...req.body,
      requirement: req.body.requirement || null,
    });

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

export default router;
