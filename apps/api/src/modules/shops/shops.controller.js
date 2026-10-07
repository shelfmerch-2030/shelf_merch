import * as shopsService from './shops.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { uploadFile } from '../../services/storage.service.js';
import { ApiError } from '../../utils/errors.js';

export async function list(req, res) {
  res.json(await shopsService.listShops({ tenantId: req.tenantId }));
}

/** Persist a shop logo or custom banner image; returns a short `/uploads/…` URL. */
export async function uploadAsset(req, res) {
  if (!req.file) throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  const kind = req.query?.kind === 'banner' ? 'mockup' : 'logo';
  const { url } = await uploadFile({ tenantId: req.tenantId, kind, file: req.file });
  res.status(201).json({ url });
}

export async function getOne(req, res) {
  res.json(await shopsService.getShop({ tenantId: req.tenantId, shopId: req.params.id }));
}

export async function report(req, res) {
  res.json(await shopsService.shopReport({ tenantId: req.tenantId, shopId: req.params.id }));
}

export async function create(req, res) {
  const shop = await shopsService.createShop({ tenantId: req.tenantId, data: req.body });
  writeAudit({ req, action: 'shop.create', entityType: 'Shop', entityId: shop._id, after: shop.toObject() });
  res.status(201).json(shop);
}

export async function update(req, res) {
  const { before, shop } = await shopsService.updateShop({
    tenantId: req.tenantId,
    shopId: req.params.id,
    patch: req.body,
  });
  writeAudit({ req, action: 'shop.update', entityType: 'Shop', entityId: shop._id, before, after: shop.toObject() });
  res.json(shop);
}

export async function publish(req, res) {
  const shop = await shopsService.publishShop({ tenantId: req.tenantId, shopId: req.params.id, actorUserId: req.user?.userId });
  writeAudit({ req, action: 'shop.publish', entityType: 'Shop', entityId: shop._id, after: { status: 'live' } });
  res.json(shop);
}

export async function archive(req, res) {
  const shop = await shopsService.archiveShop({ tenantId: req.tenantId, shopId: req.params.id });
  writeAudit({ req, action: 'shop.archive', entityType: 'Shop', entityId: shop._id, after: { deletedAt: shop.deletedAt } });
  res.json({ ok: true });
}
