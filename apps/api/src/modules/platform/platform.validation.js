import { z } from 'zod';
import { objectId } from '../users/users.validation.js';
import { ORDER_STATUSES } from '../orders/order.model.js';
import { PRODUCTION_TASK_STATUSES } from './productionTask.model.js';
import { PLATFORM_ROLES } from '../roles/roleAssignment.model.js';
import { QC_STATUSES } from './productionQc.service.js';

export const listPlatformOrdersQuery = z.object({
  qcStatus: z.enum(QC_STATUSES).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  tenantId: objectId.optional(),
  vendorId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Include test-mode (sandbox API) orders. */
  includeTest: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export const orderIdParam = z.object({ id: objectId });

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().optional().default(''),
});

export const assignVendorSchema = z.object({
  vendorId: objectId,
});

export const orderNoteSchema = z.object({
  body: z.string().min(1),
});

export const orderMockupSchema = z.object({
  url: z.string().min(1),
});

export const replacementSchema = z.object({
  reason: z.string().min(1),
});

export const createProductionTaskSchema = z.object({
  orderId: objectId,
  assignedTo: z.string().optional().default(''),
  expectedDispatchAt: z.coerce.date().optional().nullable(),
});

export const listProductionTasksQuery = z.object({
  qcStatus: z.enum(QC_STATUSES).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(PRODUCTION_TASK_STATUSES).optional(),
  tenantId: objectId.optional(),
  assignedTo: z.string().optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(PRODUCTION_TASK_STATUSES),
  note: z.string().optional().default(''),
});

const qcPhotoUrl = z.string().trim().min(1).max(2000).refine((value) => {
  if (value.startsWith('/uploads/') && !value.includes('..') && !value.includes('\\')) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}, 'Use an uploaded photo URL');

export const qcSchema = z.object({
  passed: z.boolean(),
  reason: z.string().trim().max(2000).optional().default(''),
  notes: z.string().trim().max(4000).optional().default(''),
  inspectedQuantity: z.number().int().positive(),
  failedQuantity: z.number().int().nonnegative(),
  checks: z.object({
    product: z.boolean(), artwork: z.boolean(), workmanship: z.boolean(),
    quantity: z.boolean(), contents: z.boolean(),
  }),
  photoUrls: z.array(qcPhotoUrl).min(1).max(20),
}).superRefine((value, ctx) => {
  if (!value.passed && !value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'QC failure requires a reason' });
  if (value.failedQuantity > value.inspectedQuantity) ctx.addIssue({ code: 'custom', path: ['failedQuantity'], message: 'Failed quantity cannot exceed inspected quantity' });
  if (value.passed && (value.failedQuantity !== 0 || Object.values(value.checks).some((checked) => !checked))) {
    ctx.addIssue({ code: 'custom', message: 'Passing QC requires all checks and zero failed units' });
  }
  if (!value.passed && value.failedQuantity === 0) ctx.addIssue({ code: 'custom', path: ['failedQuantity'], message: 'Enter the number of failed units' });
});

export const updateTaskSchema = z.object({
  assignedTo: z.string().optional(),
  expectedDispatchAt: z.coerce.date().optional().nullable(),
  mockupUrl: z.string().optional(),
  productionSheetUrl: z.string().optional(),
  qcPhotoUrl: qcPhotoUrl.optional(),
  note: z.string().optional(),
});

export const listAuditLogsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  tenantId: objectId.optional(),
  actorUserId: objectId.optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const inviteTeamSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(PLATFORM_ROLES),
});

export const changeTeamRoleSchema = z.object({
  role: z.enum(PLATFORM_ROLES),
});

export const teamUserIdParam = z.object({ userId: objectId });

export const settingKeyParam = z.object({ key: z.string().min(1) });

export const putSettingSchema = z.object({
  value: z.any(),
});
