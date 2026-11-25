import { Order } from './order.model.js';

/** Next SM-YYYY-NNNNNN number. Platform-wide sequence, so it skips the tenant guard. */
export async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `SM-${year}-`;
  // Must use max sequence, not count — gaps / deleted rows make count+1 collide
  // with an existing unique orderNumber (Mongo 409 DUPLICATE).
  const latest = await Order.findOne({ orderNumber: { $regex: `^${prefix}` } })
    .sort({ orderNumber: -1 })
    .select('orderNumber')
    .setOptions({ skipTenantGuard: true, includeDeleted: true })
    .lean();
  let seq = 1;
  if (latest?.orderNumber) {
    const parsed = Number.parseInt(String(latest.orderNumber).slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

function isOrderNumberClash(err) {
  return (
    Boolean(err?.keyPattern?.orderNumber) ||
    Boolean(err?.keyValue && Object.prototype.hasOwnProperty.call(err.keyValue, 'orderNumber')) ||
    String(err?.message || '').includes('orderNumber')
  );
}

/** Create an Order, retrying only when two writers race for the same orderNumber. */
export async function createOrderWithNumber(doc, { attempts = 5 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await Order.create({
        ...doc,
        orderNumber: doc.orderNumber || (await nextOrderNumber()),
      });
    } catch (err) {
      lastErr = err;
      if (err?.code !== 11000 || !isOrderNumberClash(err)) throw err;
      doc = { ...doc, orderNumber: undefined };
    }
  }
  throw lastErr;
}
