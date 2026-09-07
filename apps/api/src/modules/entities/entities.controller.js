import * as entitiesService from './entities.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { env } from '../../config/env.js';

export async function list(req, res) {
  res.json(
    await entitiesService.listEntities({
      tenantId: req.tenantId,
      user: req.user,
      walletId: req.query.walletId,
    }),
  );
}

export async function getOne(req, res) {
  res.json(await entitiesService.getEntity({ tenantId: req.tenantId, entityId: req.params.id }));
}

export async function transactions(req, res) {
  res.json(
    await entitiesService.listEntityTransactions({
      tenantId: req.tenantId,
      entityId: req.params.id,
      user: req.user,
      query: req.query,
    }),
  );
}

export async function create(req, res) {
  const entity = await entitiesService.createEntity({
    tenantId: req.tenantId,
    data: req.body,
    userId: req.user.userId,
  });
  writeAudit({ req, action: 'entity.create', entityType: 'Entity', entityId: entity._id, after: entity.toObject() });
  res.status(201).json(entity);
}

export async function update(req, res) {
  const { before, entity } = await entitiesService.updateEntity({
    tenantId: req.tenantId,
    entityId: req.params.id,
    patch: req.body,
  });
  writeAudit({ req, action: 'entity.update', entityType: 'Entity', entityId: entity._id, before, after: entity.toObject() });
  res.json(entity);
}

export async function remove(req, res) {
  const entity = await entitiesService.deleteEntity({ tenantId: req.tenantId, entityId: req.params.id });
  writeAudit({ req, action: 'entity.delete', entityType: 'Entity', entityId: entity._id });
  res.json({ success: true });
}

export async function assignManager(req, res) {
  const { entity, manager, inviteToken } = await entitiesService.assignManager({
    tenantId: req.tenantId,
    entityId: req.params.id,
    data: req.body,
    userId: req.user.userId,
  });
  writeAudit({
    req,
    action: 'entity.assign_manager',
    entityType: 'Entity',
    entityId: entity._id,
    after: { managerUserId: manager._id, email: manager.email },
  });
  res.status(201).json({
    entity,
    manager: { id: String(manager._id), email: manager.email, status: manager.status },
    alreadyActive: manager.status === 'active',
    ...(env.NODE_ENV !== 'production' ? { inviteToken } : {}),
  });
}
