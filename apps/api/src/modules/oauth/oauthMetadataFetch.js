import { Agent, fetch as undiciFetch } from 'undici';
import { applySSRFProtection } from 'oidc-provider/lib/helpers/fetch_request.js';

let protectedDispatcher;

function ssrfDispatcher() {
  protectedDispatcher ??= applySSRFProtection(new Agent());
  return protectedDispatcher;
}

/**
 * oidc-provider builds its SSRF dispatcher from the process-wide Undici agent.
 * Importing the npm `undici` package installs that agent. Node 20's built-in
 * fetch is an older Undici and rejects the agent before the request is sent:
 * InvalidArgumentError "invalid onRequestStart method" (UND_ERR_INVALID_ARG).
 * Fetch and the dispatcher have to come from the same Undici. The SSRF
 * connect check stays on the dispatcher that actually performs the request.
 */
function compatibleDispatcher(dispatcher) {
  if (dispatcher instanceof Agent) return dispatcher;
  const installed = globalThis[Symbol.for('undici.globalDispatcher.2')]?.constructor;
  if (typeof installed === 'function' && dispatcher instanceof installed) return dispatcher;
  return ssrfDispatcher();
}

export function oauthMetadataFetch(url, options = {}) {
  return undiciFetch(url, { ...options, dispatcher: compatibleDispatcher(options.dispatcher) });
}

export async function closeOauthMetadataDispatcher() {
  const current = protectedDispatcher;
  protectedDispatcher = undefined;
  if (current) await current.close();
}
