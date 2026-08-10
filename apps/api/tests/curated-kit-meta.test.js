import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import {
  parseCuratedKitMeta,
  isCuratedKitMeta,
  resolveCuratedApproxValueInr,
} from '../src/modules/kits/curatedKitMeta.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('curatedKitMeta', () => {
  it('parses curated designNotes and rejects non-curated / invalid JSON', () => {
    expect(parseCuratedKitMeta(null)).toBeNull();
    expect(parseCuratedKitMeta('{not-json')).toBeNull();
    expect(parseCuratedKitMeta(JSON.stringify({ curated: false }))).toBeNull();
    expect(parseCuratedKitMeta(JSON.stringify({ name: 'x' }))).toBeNull();

    const meta = parseCuratedKitMeta(
      JSON.stringify({
        curated: true,
        originalId: 'abc',
        approxValueInr: 1999,
        itemImages: [{ imageUrl: '/a.png', label: 'Mug' }],
      }),
    );
    expect(isCuratedKitMeta(meta)).toBe(true);
    expect(meta.approxValueInr).toBe(1999);
    expect(meta.itemImages).toHaveLength(1);
  });

  it('prefers live platform approxValueInr over frozen designNotes', async () => {
    const platform = await PlatformKit.create({
      name: 'Welcome Bundle',
      approxValueInr: 2500,
      status: 'active',
      items: [],
      source: { provider: 'shopify', externalId: 'gid://shopify/Product/1' },
    });

    const kit = { kitPrice: 900 };
    const meta = {
      curated: true,
      originalId: String(platform._id),
      approxValueInr: 1200,
    };

    expect(await resolveCuratedApproxValueInr(kit, meta)).toBe(2500);
  });

  it('falls back to designNotes then kitPrice when platform value is missing', async () => {
    expect(
      await resolveCuratedApproxValueInr(
        { kitPrice: 500 },
        { curated: true, approxValueInr: 1800 },
      ),
    ).toBe(1800);

    expect(
      await resolveCuratedApproxValueInr({ kitPrice: 750 }, { curated: true, approxValueInr: 0 }),
    ).toBe(750);
  });
});
