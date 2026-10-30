import Provider, { errors } from 'oidc-provider';
import { env } from '../../config/env.js';
import { OidcMongoAdapter } from './oidcMongoAdapter.js';
import { findOauthAccount } from './oauthAccount.js';
import { shelfMerchInteractionPolicy } from './oauthInteraction.js';
import {
  localOauthClients,
  mcpResourceUrl,
  oauthIssuer,
  oidcCookieKeys,
  oidcJwks,
} from './oauth.config.js';
import { allowChatGptClient, allowChatGptMetadataFetch } from './chatgptClient.js';

const DAY = 24 * 60 * 60;

async function defaultResource(_ctx, _client, oneOf) {
  const canonical = mcpResourceUrl();
  if (Array.isArray(oneOf) && oneOf.length === 1 && oneOf[0] === canonical) return canonical;
  throw new errors.InvalidTarget('resource indicator is missing, or unknown');
}

async function getResourceServerInfo(_ctx, resourceIndicator) {
  const canonical = mcpResourceUrl();
  if (resourceIndicator !== canonical) {
    throw new errors.InvalidTarget('resource indicator is missing, or unknown');
  }
  return {
    scope: 'catalog:read orders:read campaigns:read wallets:read employees:read gifts:read',
    audience: canonical,
    accessTokenTTL: 15 * 60,
    accessTokenFormat: 'jwt',
    jwt: { sign: { alg: 'RS256' } },
  };
}

let provider;

export function getOidcProvider() {
  if (provider) return provider;

  const issuer = oauthIssuer();
  const secure = issuer.startsWith('https:');
  provider = new Provider(issuer, {
    adapter: OidcMongoAdapter,
    jwks: oidcJwks(),
    clients: localOauthClients(),
    cookies: {
      keys: oidcCookieKeys(),
      names: {
        session: 'sm_oauth_session',
        interaction: 'sm_oauth_interaction',
        resume: 'sm_oauth_resume',
      },
      long: { httpOnly: true, sameSite: 'lax', secure },
      short: { httpOnly: true, sameSite: 'lax', secure },
    },
    // Read scopes only. oidc-provider 9.13.3 also adds openid in collectScopes
    // because the OIDC claims set is always present. Consent grants the subset
    // the client requested, so an existing catalog:read grant stays unchanged.
    scopes: ['catalog:read', 'orders:read', 'campaigns:read', 'wallets:read', 'employees:read', 'gifts:read'],
    responseTypes: ['code'],
    clientAuthMethods: ['none', 'private_key_jwt'],
    pkce: {
      required() {
        return true;
      },
    },
    issueRefreshToken(_ctx, client) {
      return client.grantTypeAllowed('refresh_token');
    },
    rotateRefreshToken(ctx) {
      const refreshToken = ctx.oidc.entities.RefreshToken;
      if (refreshToken && refreshToken.totalLifetime() >= 365.25 * DAY) return false;
      return true;
    },
    async expiresWithSession() {
      return false;
    },
    findAccount: findOauthAccount,
    ttl: {
      AccessToken: 15 * 60,
      AuthorizationCode: 60,
      RefreshToken: DAY,
      Grant: 30 * DAY,
      Session: 60 * 60,
      Interaction: 10 * 60,
      IdToken: 60 * 60,
      ClientCredentials: 10 * 60,
      DeviceCode: 10 * 60,
      BackchannelAuthenticationRequest: 10 * 60,
    },
    formats: {
      customizers: {
        async jwt(_ctx, token, structured) {
          if (token.grantId) structured.payload.grant_id = token.grantId;
        },
      },
    },
    interactions: {
      policy: shelfMerchInteractionPolicy(),
      url() {
        return '/oauth/consent';
      },
    },
    features: {
      clientIdMetadataDocument: {
        enabled: true,
        ack: 'draft-02',
        allowFetch: allowChatGptMetadataFetch,
        allowClient: allowChatGptClient,
      },
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      registration: { enabled: false },
      revocation: { enabled: true },
      rpInitiatedLogout: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource,
        getResourceServerInfo,
        useGrantedResource() {
          return true;
        },
      },
    },
  });
  provider.proxy = env.TRUST_PROXY > 0;
  return provider;
}
