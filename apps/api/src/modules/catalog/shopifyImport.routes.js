import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { objectId } from '../users/users.validation.js';
import { writeAudit } from '../../services/audit.service.js';
import { enqueueShopifyImport } from '../../jobs/queues.js';
import { normalizeDomain, normalizeAccessToken } from './shopifyImport.service.js';
import { ShopifyImportJob } from './shopifyImportJob.model.js';
import { getShopifyImportStatus } from './shopifyImportJob.service.js';

/** Mounted behind the parent platform router's authentication middleware. */
export function createShopifyImportRouter({ kind, area, action, entityType }) {
  const router = Router();
  router.post(
    '/',
    platformArea(area, 'write'),
    validate({ body: z.object({ domain: z.string().min(1), accessToken: z.string().min(1) }) }),
    asyncHandler(async (req, res) => {
      const domain = normalizeDomain(req.body.domain);
      const accessToken = normalizeAccessToken(req.body.accessToken);
      const job = await ShopifyImportJob.create({ kind, domain, createdBy: req.user.userId });
      await enqueueShopifyImport({ jobId: String(job._id), domain, accessToken, only: kind });
      writeAudit({ req, action, entityType, after: { domain, importJobId: String(job._id) } });
      res.status(202).json({ importJobId: String(job._id), status: 'queued' });
    }),
  );
  router.get(
    '/:jobId/status',
    platformArea(area, 'read'),
    validate({ params: z.object({ jobId: objectId }) }),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await getShopifyImportStatus(req.params.jobId, kind));
    }),
  );
  return router;
}
