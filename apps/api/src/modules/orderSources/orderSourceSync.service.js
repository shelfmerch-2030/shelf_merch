import { decryptToken, encryptToken } from '../../utils/tokenEncryption.js';

// Retained for catalog matching and existing encrypted connections.
// Order polling and ingestion have been removed.
export function encryptCredentials(credentials) {
  return encryptToken(JSON.stringify(credentials));
}

export function decryptCredentials(encrypted) {
  return JSON.parse(decryptToken(encrypted));
}

/** Catalog-facing connection settings, with credentials decrypted server-side. */
export function connectionContext(connection) {
  return {
    shopDomain: connection.shopDomain,
    config: connection.config ?? null,
    credentials: decryptCredentials(connection.encryptedCredentials),
  };
}
