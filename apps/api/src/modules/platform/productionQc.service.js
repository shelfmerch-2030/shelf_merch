import { ProductionTask } from './productionTask.model.js';
import { ApiError } from '../../utils/errors.js';
import { validNextStatuses } from '../../services/stateMachine.service.js';

export const QC_STATUSES = ['not_started', 'pending', 'passed', 'failed', 'rework'];

export function qcStatus(task) {
  if (!task) return 'not_started';
  if (task.status === 'qc_pending') return 'pending';
  if (task.qcResult === 'failed') return task.status === 'issue' ? 'failed' : 'rework';
  return task.qcResult || 'not_started';
}

export function taskQcFilter(status) {
  if (status === 'pending') return { status: 'qc_pending' };
  if (status === 'rework') return { qcResult: 'failed', status: { $nin: ['qc_pending', 'issue'] } };
  if (status === 'failed') return { qcResult: 'failed', status: 'issue' };
  if (status === 'passed') return { qcResult: 'passed', status: { $ne: 'qc_pending' } };
  return { qcResult: { $in: ['', null] }, status: { $ne: 'qc_pending' } };
}

export function latestProductionTask(orderId, session = null) {
  return ProductionTask.findOne({ orderId }).sort({ createdAt: -1, _id: -1 }).session(session);
}

export function productionNextStatuses(task, orderStatus, hasShipment) {
  return validNextStatuses('productionTask', task.status).filter((next) => {
    const orderAllowed = next === 'completed'
      ? ['packed', 'shipped', 'delivered'].includes(orderStatus)
      : ['in_production', 'qc_pending', 'packed'].includes(orderStatus);
    if (!orderAllowed) return false;
    if (task.status === 'qc_pending' && ['packing', 'in_production'].includes(next)) return false;
    if (['packing', 'ready_to_ship', 'completed'].includes(next) && task.qcResult !== 'passed') return false;
    return next !== 'completed' || hasShipment;
  });
}

export function assertTaskQcPassed(task) {
  if (!task || task.qcResult !== 'passed') {
    throw new ApiError(422, 'Record a passing QC inspection before packing or shipping.', 'QC_REQUIRED');
  }
}

export async function assertOrderPackingComplete(order, session = null) {
  const task = await latestProductionTask(order._id, session);
  assertTaskQcPassed(task);
  if (!['ready_to_ship', 'completed'].includes(task.status)) {
    throw new ApiError(422, 'Complete packing in Production before shipping.', 'PACKING_REQUIRED');
  }
  return task;
}

// Used by both platform and tenant-scoped status APIs, including impersonation.
export async function assertOrderFulfillmentTransition(order, status) {
  if (['packed', 'shipped', 'delivered'].includes(status)) await assertOrderPackingComplete(order);
}

export async function assertOrderShippable(order) {
  if (!['packed', 'shipped', 'delivered'].includes(order.status)) {
    throw new ApiError(422, 'The order must be packed before shipping.', 'ORDER_NOT_SHIPPABLE');
  }
  return assertOrderPackingComplete(order);
}
