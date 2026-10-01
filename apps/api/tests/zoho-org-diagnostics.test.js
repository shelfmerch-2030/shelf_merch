import { describe, it, expect, vi } from 'vitest';
import * as envModule from '../src/config/env.js';

describe('Zoho organisation verification diagnostics', () => {
  const accessToken = 'org-access-token-value';

  async function loadOrgApi() {
    return import('../src/modules/integrations/zoho/zohoPeople.service.js');
  }

  function assertNoSecrets(serialized) {
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain('refresh-token-value');
    expect(serialized).not.toContain('auth-code-value');
    expect(serialized).not.toContain('test-zoho-secret');
    expect(serialized).not.toContain('person@example.com');
  }

  it('stores sanitized diagnostics for organisation HTTP 429', async () => {
    const { logger } = await import('../src/config/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const longMessage = 'm'.repeat(250);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({
          response: { status: 1, code: 'XXXXX', message: longMessage },
          EmailID: 'person@example.com',
        }),
    });

    try {
      const { fetchZohoOrganization, formatZohoOrgLastError } = await loadOrgApi();
      const error = await fetchZohoOrganization({
        location: 'in',
        apiDomain: 'https://www.zohoapis.in',
        accessToken,
      }).catch((err) => err);

      expect(error).toMatchObject({
        status: 502,
        code: 'ZOHO_ORG_FETCH_FAILED',
        message: 'Could not verify Zoho People organisation',
        details: {
          httpStatus: 429,
          zohoStatus: 1,
          zohoCode: 'XXXXX',
          zohoMessage: 'm'.repeat(200),
        },
      });
      expect(formatZohoOrgLastError(error.details)).toBe(`http 429; code XXXXX; ${'m'.repeat(200)}`);
      expect(error.details.zohoMessage).toHaveLength(200);
      expect(Object.keys(error.details).sort()).toEqual([
        'httpStatus',
        'zohoCode',
        'zohoMessage',
        'zohoStatus',
      ]);

      const logged = JSON.stringify(warnSpy.mock.calls);
      assertNoSecrets(logged);
      expect(logged).not.toContain(longMessage);
      expect(fetchMock.mock.calls[0][0]).toBe('https://people.zoho.in/api/v3/organization');
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    } finally {
      warnSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it('stores sanitized diagnostics for organisation HTTP 403 with a Zoho error code', async () => {
    const { logger } = await import('../src/config/logger.js');
    const { ZohoIntegration } = await import('../src/modules/integrations/zoho/zohoIntegration.model.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const updateSpy = vi.spyOn(ZohoIntegration, 'findOneAndUpdate').mockResolvedValue({ id: 'saved' });
    const previous = { ...envModule.env };
    Object.assign(envModule.env, {
      ZOHO_CLIENT_ID: 'test-zoho-client',
      ZOHO_CLIENT_SECRET: 'test-zoho-secret',
      ZOHO_REDIRECT_URI: 'http://localhost:8080/api/integrations/zoho/callback',
      ZOHO_ACCOUNTS_URL: 'https://accounts.zoho.in',
      TOKEN_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      NODE_ENV: 'test',
    });
    const configuredSpy = vi.spyOn(envModule, 'zohoPeopleConfigured').mockReturnValue(true);
    const redirectSpy = vi
      .spyOn(envModule, 'zohoRedirectUri')
      .mockReturnValue('http://localhost:8080/api/integrations/zoho/callback');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes('/oauth/v2/token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: accessToken,
            refresh_token: 'refresh-token-value',
            expires_in: 3600,
            api_domain: 'https://www.zohoapis.in',
          }),
        };
      }
      return {
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            response: {
              status: 1,
              message: 'Error occurred',
              errors: { code: 7074, detail: 'person@example.com' },
            },
          }),
      };
    });

    try {
      const { completeZohoConnection } = await import(
        '../src/modules/integrations/zoho/zohoOAuth.service.js'
      );
      await expect(
        completeZohoConnection({
          tenantId: 'tenant-1',
          userId: 'user-1',
          code: 'auth-code-value',
          zohoLocation: 'in',
        }),
      ).rejects.toMatchObject({
        status: 502,
        code: 'ZOHO_ORG_VERIFY_FAILED',
        message: 'Connected to Zoho but organisation verification failed',
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const saved = updateSpy.mock.calls[0][1].$set;
      expect(saved.status).toBe('error');
      expect(saved.lastError).toBe('http 403; code 7074; Error occurred');
      expect(saved.zohoLocation).toBe('in');
      assertNoSecrets(saved.lastError);
      assertNoSecrets(JSON.stringify(warnSpy.mock.calls));
      const orgCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('/api/v3/organization'),
      );
      expect(String(orgCall[0])).toBe('https://people.zoho.in/api/v3/organization');
      expect(orgCall[1].method).toBe('GET');
      expect(orgCall[1].headers.Authorization.startsWith('Zoho-oauthtoken ')).toBe(true);
    } finally {
      fetchMock.mockRestore();
      warnSpy.mockRestore();
      updateSpy.mockRestore();
      configuredSpy.mockRestore();
      redirectSpy.mockRestore();
      Object.assign(envModule.env, previous);
    }
  });

  it('stores sanitized diagnostics for an unusable 2xx organisation response', async () => {
    const { logger } = await import('../src/config/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: { status: 1, message: 'Error occurred for person@example.com' },
        EmailID: 'person@example.com',
      }),
    });

    try {
      const { fetchZohoOrganization, formatZohoOrgLastError } = await loadOrgApi();
      const error = await fetchZohoOrganization({
        location: 'in',
        apiDomain: 'https://www.zohoapis.in',
        accessToken,
      }).catch((err) => err);

      expect(error).toMatchObject({
        status: 502,
        code: 'ZOHO_ORG_UNUSABLE',
        message: 'Zoho organisation response was unusable',
        details: {
          httpStatus: 200,
          zohoStatus: 1,
          zohoCode: null,
          zohoMessage: 'Error occurred for [redacted]',
        },
      });
      expect(formatZohoOrgLastError(error.details)).toBe('http 200; Error occurred for [redacted]');
      assertNoSecrets(JSON.stringify(warnSpy.mock.calls));
      assertNoSecrets(JSON.stringify(error.details));
    } finally {
      warnSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it('accepts a successful organisation response without a diagnostic error', async () => {
    const { logger } = await import('../src/config/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Company: '89740123',
        organizationName: 'Acme',
      }),
    });

    try {
      const { fetchZohoOrganization } = await loadOrgApi();
      const org = await fetchZohoOrganization({
        location: 'in',
        apiDomain: 'https://www.zohoapis.in',
        accessToken,
      });
      expect(org).toEqual({
        id: '89740123',
        name: 'Acme',
        peopleBaseUrl: 'https://people.zoho.in',
        needsAttention: false,
      });
      expect(warnSpy).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toBe('https://people.zoho.in/api/v3/organization');
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    } finally {
      warnSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });
});
