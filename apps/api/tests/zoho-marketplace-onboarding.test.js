import { describe, expect, it } from 'vitest';
import { getDocsHtml } from '../src/modules/docs/docs.controller.js';

describe('Zoho Marketplace website onboarding HTML', () => {
  it('serves both existing account routes and preserves guide destinations', () => {
    const html = getDocsHtml('/docs/zoho-people');
    expect(html).toContain('href="/signup">Create ShelfMerch Account');
    expect(html).toContain('href="/login">Log In to ShelfMerch');
    expect(html).toContain('Integrations → Zoho People → Connect');
    expect(html).toContain('Employees are not synced automatically.');
    expect(html).toContain('a Zoho Web Tab is not required.');
    for (const path of ['/docs/zoho-people/user-guide', '/docs/zoho-people/admin-guide', '/case-studies/zoho-people']) {
      expect(html).toContain(`href="${path}"`);
    }
  });
  it.each(['/docs/zoho-people/user-guide', '/docs/zoho-people/admin-guide'])('%s uses the website flow and manual sync', path => {
    const html = getDocsHtml(path);
    expect(html).toContain('Integrations → Zoho People → Connect');
    expect(html).toContain('Sync now');
    expect(html).not.toContain('from the Web Tab');
    expect(html).not.toContain('Open the ShelfMerch Web Tab');
  });
});
