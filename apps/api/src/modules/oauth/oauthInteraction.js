import { errors, interactionPolicy } from 'oidc-provider';
import { requestedScopesAllowed } from './oauthScopes.js';

/**
 * oidc-provider 9.13.3 always advertises `openid` in scopes_supported because
 * the openid claim is built in. Removing it from discovery would not reject a
 * request. This check runs before a code is issued and is the enforcement.
 */
function rejectUnsupportedOauthScope(ctx) {
  if (!requestedScopesAllowed(ctx.oidc?.params?.scope)) {
    throw new errors.InvalidScope('Only catalog:read can be requested');
  }
  return false;
}

export function shelfMerchInteractionPolicy() {
  const policy = interactionPolicy.base();
  const login = policy.get('login');
  login.checks.add(
    new interactionPolicy.Check(
      'catalog_read_only',
      'Only catalog:read can be requested',
      rejectUnsupportedOauthScope,
    ),
    0,
  );
  return policy;
}
