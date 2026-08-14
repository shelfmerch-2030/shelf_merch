/**
 * Slack OAuth v2 + Web API constants (Phase 1).
 * Bot scopes must match the Slack app (OAuth & Permissions → Bot Token Scopes).
 */

export const SLACK_CALLBACK_PATH = '/api/integrations/slack/callback';

export const SLACK_OAUTH_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
export const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
export const SLACK_CONVERSATIONS_LIST_URL = 'https://slack.com/api/conversations.list';
export const SLACK_CONVERSATIONS_INFO_URL = 'https://slack.com/api/conversations.info';
export const SLACK_CHAT_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';
export const SLACK_AUTH_REVOKE_URL = 'https://slack.com/api/auth.revoke';

/**
 * Single source of truth for Slack bot OAuth scopes.
 * Used by authorize URL generation — do not duplicate elsewhere.
 */
export const SLACK_BOT_SCOPES = Object.freeze([
  'channels:read',
  'chat:write',
  'chat:write.public',
]);

export const SLACK_CONNECTION_STATUSES = Object.freeze([
  'connected',
  'needs_attention',
  'disconnected',
]);

export const SLACK_TEST_MESSAGE =
  '🎁 ShelfMerch is connected successfully. Slack notifications are ready for this workspace.';

/** Client SPA path after OAuth (absolute redirect uses BASE_URL / APP_URL). */
export const SLACK_INTEGRATIONS_CLIENT_PATH = '/app/integrations';
