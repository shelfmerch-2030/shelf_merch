import { sanitizeOrderItems } from '../orders/order.model.js';
import { publicStatus } from '../orders/publicStatus.js';

export { PUBLIC_ORDER_STATUSES, internalStatusesFor, publicStatus } from '../orders/publicStatus.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Order (+ optional shipment) → the documented public order object. */
export function serializePublicOrder(order, shipment = null) {
  const o = order?.toObject ? order.toObject() : order;
  const addr = o.shippingAddress ?? {};
  return {
    object: 'order',
    id: String(o._id),
    number: o.orderNumber,
    external_id: o.apiRef?.externalId ?? null,
    status: publicStatus(o.status),
    test: Boolean(o.testMode),
    customer: {
      name: o.customerSnapshot?.name ?? '',
      email: o.customerSnapshot?.email ?? '',
      phone: o.customerSnapshot?.phone ?? '',
    },
    shipping_address: {
      name: addr.name ?? '',
      phone: addr.phone ?? '',
      line1: addr.line1 ?? '',
      line2: addr.line2 ?? '',
      city: addr.city ?? '',
      state: addr.state ?? '',
      pincode: addr.pincode ?? '',
      country: addr.country ?? 'IN',
    },
    items: sanitizeOrderItems(o.items ?? []).map((i) => ({
      sku: i.sku ?? '',
      product_id: i.catalogProductId ?? null,
      name: i.name ?? '',
      quantity: i.qty,
      size: i.variant?.size ?? null,
      color: i.variant?.color ?? null,
      unit_price: i.unitPriceInr ?? 0,
      image_url: i.imageUrl || null,
      artwork_url: i.artworkUrl || null,
      // Exact placements the client sent (print_areas); empty for lines placed by a listing or none.
      print_areas: (i.placements ?? [])
        .filter((p) => Number(p.widthIn) > 0)
        .map((p) => ({
          area: p.key,
          artwork_url: p.artworkUrl || null,
          width_in: p.widthIn,
          height_in: p.heightIn,
          left_in: p.leftIn,
          top_in: p.topIn,
          effective_dpi: p.effectiveDpi ?? null,
        })),
    })),
    amounts: {
      currency: 'INR',
      subtotal: o.amountBreakdown?.subtotal ?? 0,
      shipping: o.amountBreakdown?.shipping ?? 0,
      tax: o.amountBreakdown?.gst ?? 0,
      total: o.amountBreakdown?.total ?? 0,
    },
    tracking: shipment || o.trackingNumber
      ? {
          courier: shipment?.courier || null,
          awb: shipment?.awb || o.trackingNumber || null,
          url: shipment?.trackingUrl || null,
        }
      : null,
    notes: o.notes ?? null,
    metadata: o.metadata ?? {},
    created_at: iso(o.createdAt),
    updated_at: iso(o.updatedAt),
  };
}
