/** The only ShelfMerch permission granted to an MCP client. */
export const RESOURCE_SCOPE = 'catalog:read';

/**
 * oidc-provider 9.13.3 always adds this scope to discovery because the openid
 * claim set is built in. ChatGPT requests every advertised OIDC scope.
 */
export const PROTOCOL_SCOPE = 'openid';

export function scopeList(value) {
  return String(value || '').split(/\s+/).filter(Boolean);
}

/** catalog:read is required. openid may accompany it. Nothing else may. */
export function requestedScopesAllowed(value) {
  const scopes = scopeList(value);
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) return false;
  if (!scopes.includes(RESOURCE_SCOPE)) return false;
  return scopes.every((scope) => scope === RESOURCE_SCOPE || scope === PROTOCOL_SCOPE);
}
