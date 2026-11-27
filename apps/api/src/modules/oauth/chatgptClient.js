import { logger } from '../../config/logger.js';

const HOST = 'chatgpt.com';
const METADATA_LIMIT = 5 * 1024;
const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const CALLBACK_ID = '[A-Za-z0-9_-]{1,128}';

function httpsPath(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  if (url.hostname !== HOST || (url.port && url.port !== '443')) return null;
  return url.pathname;
}

/** Official ChatGPT client metadata documents. No other host is fetched. */
export function isChatGptMetadataUrl(value) {
  const path = httpsPath(value);
  if (!path) return false;
  if (path === '/oauth/client.json') return true;
  return new RegExp(`^/oauth/${CALLBACK_ID}/client\\.json$`).test(path);
}

/** Redirects published for ChatGPT when issuer identification is enabled, plus callback-specific URIs. */
export function isChatGptRedirectUri(value) {
  const path = httpsPath(value);
  if (!path) return false;
  if (path === '/connector_platform_oauth_redirect') return true;
  return new RegExp(`^/connector/oauth/${CALLBACK_ID}$`).test(path);
}

export function isChatGptJwksUri(value) {
  return httpsPath(value) === '/oauth/jwks.json';
}

export async function allowChatGptMetadataFetch(_ctx, clientId) {
  return isChatGptMetadataUrl(clientId);
}

export async function fetchChatGptOAuthDocument(url, options) {
  const metadata = isChatGptMetadataUrl(url);
  if (!metadata && !isChatGptJwksUri(url)) {
    throw new Error('OAuth document destination is not allowed');
  }

  const document = metadata ? 'client_metadata' : 'client_jwks';
  const headers = new Headers(options.headers);
  headers.set('user-agent', 'ShelfMerch-OAuth');
  try {
    // Keep oidc-provider's timeout and SSRF-protected dispatcher.
    const response = await fetch(url, { ...options, headers, redirect: 'manual' });
    if (response.status !== 200) {
      logger.warn({ document, upstreamStatus: response.status }, 'ChatGPT OAuth document fetch returned an unexpected status');
      return response;
    }
    if (!metadata) return response;
    if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new Error('OAuth metadata response is not JSON');
    }

    const chunks = [];
    let size = 0;
    if (!response.body) throw new Error('Empty OAuth metadata document');
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > METADATA_LIMIT) throw new Error('OAuth metadata document exceeds size limit');
      chunks.push(chunk);
    }
    const properties = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // ChatGPT also advertises this grant for other products. ShelfMerch only
    // registers the authorization-code and refresh-token portion of its metadata.
    if (Array.isArray(properties?.grant_types) && properties.grant_types.includes(JWT_BEARER_GRANT)) {
      properties.grant_types = properties.grant_types.filter(grant => grant !== JWT_BEARER_GRANT);
    }
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-length');
    responseHeaders.delete('content-encoding');
    return Response.json(properties, { headers: responseHeaders });
  } catch (error) {
    logger.warn({
      document,
      errorName: error.name,
      networkCode: error.cause?.code ?? error.code,
      stage: error instanceof SyntaxError ? 'parse' : 'fetch_or_read',
    }, 'ChatGPT OAuth document fetch or parsing failed');
    throw error;
  }
}

export async function allowChatGptClient(_ctx, client) {
  const redirects = client.redirectUris;
  if (!Array.isArray(redirects) || redirects.length === 0 || !redirects.every(isChatGptRedirectUri)) {
    return false;
  }
  const method = client.tokenEndpointAuthMethod;
  if (method !== 'none' && method !== 'private_key_jwt') return false;
  const grants = client.grantTypes;
  if (!Array.isArray(grants) || !grants.includes('authorization_code')) return false;
  if (grants.some((grant) => grant !== 'authorization_code' && grant !== 'refresh_token')) return false;
  const responses = client.responseTypes;
  if (!Array.isArray(responses) || responses.length === 0 || responses.some((type) => type !== 'code')) {
    return false;
  }
  if (method === 'private_key_jwt') {
    if (client.tokenEndpointAuthSigningAlg !== 'RS256') return false;
    if (!isChatGptJwksUri(client.jwksUri)) return false;
  }
  return true;
}
