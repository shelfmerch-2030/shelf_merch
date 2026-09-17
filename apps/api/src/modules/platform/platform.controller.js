import { env } from '../../config/env.js';
import * as platformService from './platform.service.js';
import * as teamService from './team.service.js';
import * as settingsService from './platformSettings.service.js';
import { writeAudit } from '../../services/audit.service.js';

// ---- Dashboard ----

export async function dashboard(_req, res) {
  res.json(await platformService.getDashboard());
}

// ---- Orders ----

export async function listOrders(req, res) {
  res.json(await platformService.listPlatformOrders({ query: req.query }));
}

export async function getOrder(req, res) {
  res.json(await platformService.getPlatformOrderDetail(req.params.id));
}

export async function updateOrderStatus(req, res) {
  const before = await platformService.getPlatformOrder(req.params.id);
  const order = await platformService.updatePlatformOrderStatus({
    orderId: req.params.id,
    status: req.body.status,
    note: req.body.note,
    actor: { userId: req.user.userId },
  });
  writeAudit({
    req,
    action: 'order.status_override',
    entityType: 'Order',
    entityId: order._id,
    before: { status: before.status },
    after: { status: order.status, note: req.body.note ?? '' },
  });
  res.json(await platformService.getPlatformOrderDetail(order._id));
}

export async function assignVendor(req, res) {
  const before = await platformService.getPlatformOrder(req.params.id);
  const order = await platformService.assignVendorToOrder({
    orderId: req.params.id,
    vendorId: req.body.vendorId,
  });
  writeAudit({
    req,
    action: 'order.assign_vendor',
    entityType: 'Order',
    entityId: order._id,
    before: { vendorId: before.vendorId },
    after: { vendorId: order.vendorId },
  });
  res.json(order);
}

export async function addOrderNote(req, res) {
  const order = await platformService.addOrderNote({
    orderId: req.params.id,
    body: req.body.body,
    actorUserId: req.user.userId,
  });
  res.status(201).json(order.internalNotes);
}

export async function uploadOrderMockup(req, res) {
  const order = await platformService.attachOrderMockup({
    orderId: req.params.id,
    url: req.body.url,
    actor: { userId: req.user.userId },
  });
  writeAudit({
    req,
    action: 'order.mockup_upload',
    entityType: 'Order',
    entityId: order._id,
    after: { mockupUrl: order.mockupUrl, status: order.status },
  });
  res.json(order);
}

export async function createReplacement(req, res) {
  const { original, replacement } = await platformService.createReplacementOrder({
    orderId: req.params.id,
    reason: req.body.reason,
    actor: { userId: req.user.userId },
  });
  writeAudit({
    req,
    action: 'order.replacement_create',
    entityType: 'Order',
    entityId: replacement._id,
    after: {
      replacementOfOrderId: String(original._id),
      originalOrderNumber: original.orderNumber,
      reason: req.body.reason,
    },
  });
  res.status(201).json({ original, replacement });
}

// ---- Production ----

export async function productionBoard(_req, res) {
  res.json(await platformService.getProductionBoard());
}

export async function listProductionTasks(req, res) {
  res.json(await platformService.listProductionTasks({ query: req.query }));
}

export async function createProductionTask(req, res) {
  const task = await platformService.createProductionTask({
    orderId: req.body.orderId,
    assignedTo: req.body.assignedTo,
    expectedDispatchAt: req.body.expectedDispatchAt,
    actor: { userId: req.user.userId },
  });
  writeAudit({
    req,
    action: 'production.task_create',
    entityType: 'ProductionTask',
    entityId: task._id,
    after: { orderId: String(task.orderId), assignedTo: task.assignedTo },
  });
  res.status(201).json(task);
}

export async function updateProductionTaskStatus(req, res) {
  const task = await platformService.updateProductionTaskStatus({
    taskId: req.params.id,
    status: req.body.status,
    note: req.body.note,
    actor: { userId: req.user.userId },
  });
  writeAudit({
    req,
    action: 'production.status_change',
    entityType: 'ProductionTask',
    entityId: task._id,
    after: { status: task.status, note: req.body.note ?? '' },
  });
  res.json(task);
}

export async function recordQc(req, res) {
  const task = await platformService.recordQcResult({
    taskId: req.params.id,
    passed: req.body.passed,
    reason: req.body.reason,
    photoUrl: req.body.photoUrl,
    actor: { userId: req.user.userId },
  });
  writeAudit({
    req,
    action: req.body.passed ? 'production.qc_passed' : 'production.qc_failed',
    entityType: 'ProductionTask',
    entityId: task._id,
    after: { qcResult: task.qcResult, reason: req.body.reason ?? '' },
  });
  res.json(task);
}

export async function updateProductionTask(req, res) {
  const task = await platformService.updateProductionTaskFields({
    taskId: req.params.id,
    patch: { ...req.body, actorUserId: req.user.userId },
  });
  res.json(task);
}

// ---- Audit logs ----

export async function listAuditLogs(req, res) {
  res.json(await platformService.listAuditLogs({ query: req.query }));
}

// ---- Impersonation ----

export async function endImpersonation(req, res) {
  writeAudit({ req, action: 'impersonation.end', entityType: 'Tenant', entityId: req.tenantId });
  res.json({ ok: true });
}

// ---- Team (§5) ----

export async function listTeam(_req, res) {
  res.json(await teamService.listTeam());
}

export async function inviteTeamMember(req, res) {
  const { user, inviteToken } = await teamService.invitePlatformUser(req.body);
  writeAudit({
    req,
    action: 'team.invite',
    entityType: 'User',
    entityId: user._id,
    after: { email: user.email, role: req.body.role },
  });
  res.status(201).json({
    user: { id: String(user._id), email: user.email, status: user.status },
    ...(env.NODE_ENV !== 'production' ? { inviteToken } : {}),
  });
}

export async function changeTeamRole(req, res) {
  const { user, before, after } = await teamService.changePlatformRole({
    userId: req.params.userId,
    role: req.body.role,
  });
  writeAudit({
    req,
    action: 'team.role_change',
    entityType: 'User',
    entityId: user._id,
    before: { role: before },
    after: { role: after },
  });
  res.json({ id: String(user._id), role: after });
}

export async function deactivateTeamMember(req, res) {
  const user = await teamService.deactivatePlatformUser(req.params.userId);
  writeAudit({ req, action: 'team.deactivate', entityType: 'User', entityId: user._id });
  res.json({ id: String(user._id), status: user.status });
}

export async function reactivateTeamMember(req, res) {
  const user = await teamService.reactivatePlatformUser(req.params.userId);
  writeAudit({ req, action: 'team.reactivate', entityType: 'User', entityId: user._id });
  res.json({ id: String(user._id), status: user.status });
}

export async function teamMemberActivity(req, res) {
  res.json(await teamService.getPlatformUserActivity(req.params.userId, req.query));
}

// ---- Settings (§6) ----

export async function getSettings(_req, res) {
  res.json(await settingsService.getAllSettings());
}

export async function getSetting(req, res) {
  res.json({ key: req.params.key, value: await settingsService.getSetting(req.params.key) });
}

export async function getDemoLoginPassword(_req, res) {
  res.json(await settingsService.getDemoLoginPasswordStatus());
}

export async function generateDemoLoginPassword(req, res) {
  const result = await settingsService.generateDemoLoginPassword(req.user.userId);
  writeAudit({
    req,
    action: 'settings.demo_login_password.generate',
    entityType: 'PlatformSetting',
    after: {
      email: result.email,
      expiresAt: result.expiresAt,
    },
  });
  res.status(201).json(result);
}

export async function revokeDemoLoginPassword(req, res) {
  const result = await settingsService.revokeDemoLoginPassword(req.user.userId);
  writeAudit({
    req,
    action: 'settings.demo_login_password.revoke',
    entityType: 'PlatformSetting',
    after: {
      email: result.email,
      revokedAt: result.revokedAt,
    },
  });
  res.json(result);
}

export async function putSetting(req, res) {
  const before = await settingsService.getSetting(req.params.key);
  const doc = await settingsService.setSetting(req.params.key, req.body.value, req.user.userId);
  writeAudit({
    req,
    action: 'settings.update',
    entityType: 'PlatformSetting',
    entityId: doc._id,
    before: { key: req.params.key, value: before },
    after: { key: req.params.key, value: doc.value },
  });
  res.json({ key: doc.key, value: doc.value });
}
