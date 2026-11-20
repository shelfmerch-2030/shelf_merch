import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

const TIMEOUT_MS = 20_000;

export function isDelhiveryConfigured() {
  return Boolean(env.DELHIVERY_API_TOKEN && env.DELHIVERY_PICKUP_LOCATION);
}

export function delhiveryTrackingUrl(awb) {
  return `https://www.delhivery.com/track/package/${encodeURIComponent(awb)}`;
}

/** Delhivery's manifest API rejects a handful of special characters in free-text fields. */
function clean(value, max = 200) {
  return String(value ?? '')
    .replace(/[&#%;\\"'<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Manifest a forward (prepaid) shipment on Delhivery One via the CMU create API.
 * Weight and dimensions are intentionally omitted — the Delhivery team measures
 * the parcel at pickup and updates it on their dashboard.
 *
 * @returns {{ waybill: string, raw: object }}
 */
export async function createDelhiveryShipment(order) {
  if (!isDelhiveryConfigured()) {
    throw new ApiError(
      503,
      'Delhivery is not configured. Set DELHIVERY_API_TOKEN and DELHIVERY_PICKUP_LOCATION.',
      'DELHIVERY_NOT_CONFIGURED',
    );
  }

  const addr = order.shippingAddress ?? {};
  const missing = ['name', 'phone', 'line1', 'city', 'state', 'pincode'].filter((k) => !String(addr[k] ?? '').trim());
  if (missing.length) {
    throw new ApiError(
      422,
      `Order shipping address is missing: ${missing.join(', ')}`,
      'SHIPPING_ADDRESS_INCOMPLETE',
    );
  }

  const items = order.items ?? [];
  const quantity = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0) || 1;
  const productsDesc = items
    .map((i) => `${i.name ?? 'Item'}${i.variant?.size ? ` (${i.variant.size})` : ''} x${i.qty ?? 1}`)
    .join(', ');

  const shipment = {
    name: clean(addr.name, 100),
    add: clean([addr.line1, addr.line2].filter(Boolean).join(', '), 250),
    pin: String(addr.pincode).trim(),
    city: clean(addr.city, 60),
    state: clean(addr.state, 60),
    country: 'India',
    phone: String(addr.phone).replace(/\D/g, '').slice(-10),
    order: order.orderNumber,
    payment_mode: 'Prepaid',
    products_desc: clean(productsDesc, 250) || 'Merchandise',
    total_amount: Number(order.amountBreakdown?.total ?? 0),
    cod_amount: 0,
    quantity: String(quantity),
    shipping_mode: 'Surface',
  };

  const payload = {
    shipments: [shipment],
    pickup_location: { name: env.DELHIVERY_PICKUP_LOCATION },
  };

  const body = new URLSearchParams({ format: 'json', data: JSON.stringify(payload) });
  let res;
  try {
    res = await fetch(`${env.DELHIVERY_BASE_URL.replace(/\/$/, '')}/api/cmu/create.json`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DELHIVERY_API_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApiError(502, `Could not reach Delhivery: ${err.message}`, 'DELHIVERY_UNREACHABLE');
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(502, `Delhivery returned HTTP ${res.status}: ${text.slice(0, 200)}`, 'DELHIVERY_ERROR');
  }

  const pkg = data?.packages?.[0];
  if (!res.ok || !data?.success || !pkg?.waybill || String(pkg.status).toLowerCase() !== 'success') {
    const remarks = [pkg?.remarks, data?.rmk, data?.error].flat().filter(Boolean).join('; ');
    throw new ApiError(
      502,
      `Delhivery rejected the shipment${remarks ? `: ${remarks}` : ''}`,
      'DELHIVERY_REJECTED',
      { response: data },
    );
  }

  return { waybill: String(pkg.waybill), raw: data };
}
