import { createHash } from 'node:crypto';

function canonical(value) {
  if (value == null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value?.toHexString === 'function') return JSON.stringify(value.toHexString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function recoveryHash(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function durableState(doc) {
  const value = doc.toObject ? doc.toObject() : { ...doc };
  const { createdAt, updatedAt, __v, ...state } = value;
  return state;
}
