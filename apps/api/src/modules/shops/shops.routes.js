import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { uploader, IMAGE_TYPES } from '../../middleware/upload.middleware.js';
import * as controller from './shops.controller.js';
import { createShopSchema, updateShopSchema, shopIdParams } from './shops.validation.js';

const router = Router();
router.use(authenticate, resolveTenant, requireTenantContext);

const canWrite = tenantArea('shops', 'write');
const canRead = tenantArea('shops', 'read');
const upload = uploader({ allow: IMAGE_TYPES, maxSizeMb: 10 });

router.get('/', canRead, asyncHandler(controller.list));
router.post('/', canWrite, validate({ body: createShopSchema }), asyncHandler(controller.create));
/** Upload shop logo/banner images before create/update (avoids huge data-URL JSON bodies). */
router.post('/assets', canWrite, upload.single('file'), asyncHandler(controller.uploadAsset));
router.get('/:id', canRead, validate({ params: shopIdParams }), asyncHandler(controller.getOne));
router.get('/:id/report', canRead, validate({ params: shopIdParams }), asyncHandler(controller.report));
router.patch('/:id', canWrite, validate({ params: shopIdParams, body: updateShopSchema }), asyncHandler(controller.update));
router.post('/:id/publish', canWrite, validate({ params: shopIdParams }), asyncHandler(controller.publish));
router.delete('/:id', canWrite, validate({ params: shopIdParams }), asyncHandler(controller.archive));

export default router;
