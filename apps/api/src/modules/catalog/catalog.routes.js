import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { objectId } from '../users/users.validation.js';
import { tenantCatalogFilter, withEnabledVariants } from './catalogFilters.js';
import { CatalogProduct } from './catalogProduct.model.js';
import { PlatformKit } from '../kits/platformKit.model.js';
import { NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';

const router = Router();

const listQuery = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

router.get(
  '/products',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 50 });
    const filter = {
      status: 'active',
      ...tenantCatalogFilter(),
      ...(req.query.category ? { category: req.query.category } : {}),
      ...(req.query.search ? { name: { $regex: req.query.search, $options: 'i' } } : {}),
    };
    const [items, total] = await Promise.all([
      CatalogProduct.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      CatalogProduct.countDocuments(filter),
    ]);
    res.json(paginatedResponse(items.map(withEnabledVariants), total, { page, limit }));
  }),
);

router.get(
  '/products/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const product = await CatalogProduct.findById(req.params.id);
    if (!product) throw new NotFoundError('Product not found');
    res.json(withEnabledVariants(product));
  }),
);

// Kits remain tenant-authenticated. Product browse is public so the marketing
// catalog can render without a login.
router.use(authenticate);

// Platform-curated kits a tenant can send. Tenant context required — platform
// users (no tenant) get 403; only active kits are exposed.
router.get(
  '/kits',
  resolveTenant,
  requireTenantContext,
  asyncHandler(async (_req, res) => {
    const kits = await PlatformKit.find({ status: 'active' }).sort({ name: 1 }).lean();
    res.json(kits);
  }),
);

router.get(
  '/kits/:id',
  resolveTenant,
  requireTenantContext,
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const kit = await PlatformKit.findOne({ _id: req.params.id, status: 'active' }).lean();
    if (!kit) throw new NotFoundError('Kit not found');
    res.json(kit);
  }),
);

export default router;
