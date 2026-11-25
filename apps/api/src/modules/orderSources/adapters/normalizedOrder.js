/**
 * NormalizedOrder — the one shape every adapter returns:
 * {
 *   externalId, externalNumber, createdAt, updatedAt,
 *   status: 'open' | 'cancelled', financialStatus, fulfillmentStatus,
 *   currency, note,
 *   customer: { name, email, phone },
 *   shippingAddress: { name, phone, line1, line2, city, state, pincode, country },
 *   items: [{ externalLineId, externalSku, name, qty, unitPrice, variant: { size, color } }],
 *   totals: { subtotal, shipping, tax, total },
 *   raw   // provider payload, stored separately and never returned to clients
 * }
 */

export function emptyAddress() {
  return { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', country: 'IN' };
}

export function toMoney(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Reasons the address cannot be shipped to; empty array means OK. */
export function addressProblems(addr = {}) {
  const problems = [];
  if (!addr.name) problems.push('Shipping name is missing');
  if (!addr.line1) problems.push('Shipping address line 1 is missing');
  if (!addr.city) problems.push('Shipping city is missing');
  if (!addr.pincode) problems.push('Shipping pincode is missing');
  if ((addr.country || 'IN') === 'IN' && addr.pincode && !/^\d{6}$/.test(addr.pincode)) {
    problems.push(`Pincode "${addr.pincode}" is not a 6-digit Indian pincode`);
  }
  return problems;
}
