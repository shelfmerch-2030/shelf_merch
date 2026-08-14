/**
 * Merge HRIS integration slugs.
 * Verified: https://docs.merge.dev/guides/merge-link/single-integration/
 */
export const MERGE_HRIS_INTEGRATIONS = Object.freeze([
  'workday',
  'bamboohr',
  'gusto',
  'keka',
  'deel',
  'ukg-pro',
  'hibob',
]);

export const MERGE_API_BASE = 'https://api.merge.dev/api';

export const MERGE_CREATE_LINK_TOKEN_URL = `${MERGE_API_BASE}/integrations/create-link-token`;

/** HRIS public_token → account_token exchange (verified Merge docs). */
export const MERGE_ACCOUNT_TOKEN_URL = (publicToken) =>
  `${MERGE_API_BASE}/hris/v1/account-token/${encodeURIComponent(publicToken)}`;

export const MERGE_ACCOUNT_DETAILS_URL = `${MERGE_API_BASE}/hris/v1/account-details`;

/** Unlink / delete a Merge Linked Account (verified Merge docs). */
export const MERGE_DELETE_ACCOUNT_URL = `${MERGE_API_BASE}/hris/v1/delete-account`;

export const MERGE_HRIS_EMPLOYEES_URL = `${MERGE_API_BASE}/hris/v1/employees`;
export const MERGE_HRIS_EMPLOYMENTS_URL = `${MERGE_API_BASE}/hris/v1/employments`;
/** Departments are Merge Groups with type=DEPARTMENT (no /departments endpoint). */
export const MERGE_HRIS_GROUPS_URL = `${MERGE_API_BASE}/hris/v1/groups`;
export const MERGE_HRIS_LOCATIONS_URL = `${MERGE_API_BASE}/hris/v1/locations`;

export const MERGE_CONNECTION_STATUSES = Object.freeze([
  'connected',
  'expired',
  'error',
  'disconnected',
  'needs_attention',
]);

export const MERGE_SYNC_STATUSES = Object.freeze([
  'idle',
  'syncing',
  'success',
  'failed',
]);
