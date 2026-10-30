/** Read scopes an MCP client may be granted. Nothing here is a write permission. */
export const RESOURCE_SCOPES = ['catalog:read', 'orders:read', 'campaigns:read', 'wallets:read', 'employees:read', 'gifts:read'];

/** Kept for callers that still name the original catalog permission. */
export const RESOURCE_SCOPE = 'catalog:read';

/**
 * oidc-provider 9.13.3 always adds this scope to discovery because the openid
 * claim set is built in. ChatGPT requests every advertised OIDC scope.
 */
export const PROTOCOL_SCOPE = 'openid';

/** OIDC scope that asks for a refresh token. It is not a ShelfMerch data permission. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

export function scopeList(value) {
  return String(value || '').split(/\s+/).filter(Boolean);
}

const READ_SCOPES = new Set(RESOURCE_SCOPES);

/** catalog:read, orders:read, campaigns:read, wallets:read, employees:read, and gifts:read, in the allowlist order, from a scope string. */
export function requestedResourceScopes(value) {
  const present = new Set(scopeList(value));
  return RESOURCE_SCOPES.filter((scope) => present.has(scope));
}

/**
 * At least one read scope is required. openid and offline_access may accompany
 * those scopes. offline_access is not a data permission. Wildcards, write
 * scopes, and any other scope are rejected.
 */
export function requestedScopesAllowed(value) {
  const scopes = scopeList(value);
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) return false;
  const resource = requestedResourceScopes(value);
  if (resource.length === 0) return false;
  return scopes.every((scope) => (
    scope === PROTOCOL_SCOPE || scope === OFFLINE_ACCESS_SCOPE || READ_SCOPES.has(scope)
  ));
}

/** A stored grant may contain only the read scopes, with no duplicates. */
export function grantScopesAllowed(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0 || new Set(scopes).size !== scopes.length) return false;
  return scopes.every((scope) => READ_SCOPES.has(scope));
}
