import { describe, expect, it } from 'vitest';
import {
  parseShopifyStorefrontTabs,
  isKitLikeShopifyProduct,
  effectiveKitLikeFromOverride,
  mapShopifyKit,
} from '../src/modules/catalog/shopifyImport.service.js';

describe('Shopify kit mapping (curated, self-contained)', () => {
  it('imports a kit as an active, fixed-composition bundle with no items', () => {
    const kit = mapShopifyKit(
      { id: 42, handle: 'welcome-kit' },
      'demo.myshopify.com',
      { name: 'Welcome Kit', description: 'A kit', basePriceInr: 1200, imageUrls: ['/a.png'] },
    );
    expect(kit.status).toBe('active');
    expect(kit.items).toEqual([]);
    expect(kit.rules.fixedComposition).toBe(true);
    expect(kit.source).toMatchObject({ provider: 'shopify', externalId: '42' });
    expect(kit.approxValueInr).toBe(1200);
  });

  it('stamps a manual kindOverride onto the kit source when provided', () => {
    const kit = mapShopifyKit(
      { id: 7, handle: 'tee' },
      'demo.myshopify.com',
      { name: 'Tee', description: '', basePriceInr: 500, imageUrls: [] },
      'kit',
    );
    expect(kit.source.kindOverride).toBe('kit');
  });
});

describe('Shopify kit classifier (sort kits from catalog products)', () => {
  it('treats a "Kit" title as a kit bundle', () => {
    expect(isKitLikeShopifyProduct({ title: 'Welcome Aboard Employee Kit' })).toBe(true);
  });
  it('treats product_type / tags of kit|bundle as a kit', () => {
    expect(isKitLikeShopifyProduct({ title: 'Onboarding Pack', product_type: 'Kit' })).toBe(true);
    expect(isKitLikeShopifyProduct({ title: 'Combo', tags: ['gift', 'bundle'] })).toBe(true);
  });
  it('treats an enumerated "kit includes …" body as a kit', () => {
    expect(
      isKitLikeShopifyProduct({
        title: 'New Joiner Box',
        body_html: '<p>This kit includes a keychain, diary, bottle and pen.</p>',
      }),
    ).toBe(true);
  });
  it('treats a "Set" title or an enumerated-item title as a kit bundle', () => {
    expect(isKitLikeShopifyProduct({ title: 'Work Smart Set' })).toBe(true);
    expect(isKitLikeShopifyProduct({ title: 'Wooden Set For Employee' })).toBe(true);
    expect(isKitLikeShopifyProduct({ title: 'Wooden Diary, Pen & Lifetime Calendar' })).toBe(true);
  });
  it('keeps a single product as a catalog product', () => {
    expect(isKitLikeShopifyProduct({ title: 'Classic Cotton Tee', product_type: 'Apparel' })).toBe(false);
    expect(isKitLikeShopifyProduct({ title: 'Work Well Stainless Bottle' })).toBe(false);
    expect(isKitLikeShopifyProduct({ title: 'ZenCharge 3-in-1 Wireless Dock' })).toBe(false);
    // "set" must be a whole word — not a substring (Headset / Sunset / Mindset).
    expect(isKitLikeShopifyProduct({ title: 'Wireless Headset' })).toBe(false);
    expect(isKitLikeShopifyProduct({ title: 'Stainless Bottle', body_html: '<p>Keeps drinks cold.</p>' })).toBe(false);
  });
});

describe('Manual kindOverride beats name heuristics', () => {
  it('forces catalog even when the title looks like a set/kit', () => {
    expect(effectiveKitLikeFromOverride('catalog', { title: 'Work Smart Set' })).toBe(false);
    expect(effectiveKitLikeFromOverride('catalog', { title: 'Welcome Kit' })).toBe(false);
  });
  it('forces kit even when the title looks like a single product', () => {
    expect(effectiveKitLikeFromOverride('kit', { title: 'Classic Cotton Tee' })).toBe(true);
  });
  it('falls back to name heuristics when no override is stored', () => {
    expect(effectiveKitLikeFromOverride(null, { title: 'Work Smart Set' })).toBe(true);
    expect(effectiveKitLikeFromOverride(null, { title: 'Classic Cotton Tee' })).toBe(false);
    expect(effectiveKitLikeFromOverride(undefined, { title: 'Wooden Set For Employee' })).toBe(true);
  });
});

describe('Shopify storefront tab parser', () => {
  it('maps the three wanted tabs and ignores File Guidelines', () => {
    const tabs = parseShopifyStorefrontTabs(`
      <div data-tab-title="Description">
        <style>.noise { color: red; }</style>
        <span class="metafield-multi_line_text_field">Actual product description<br>Second line</span>
        <div>Read more</div>
      </div>
      <div data-tab-title="Key features">
        <ul>
          <li><p>Features</p><p>x x x</p></li>
          <li><p>Material</p><p>Cork</p></li>
          <li><p>Brand</p><p>9Cork</p></li>
        </ul>
      </div>
      <div data-tab-title="Size Guide">
        <table><tr><td>Feature</td><td>Details</td></tr></table>
      </div>
      <div data-tab-title="File Guidelines">Do not import this</div>
    `);

    expect(tabs.description).toBe('Actual product description\nSecond line');
    expect(tabs.keyFeatures).toBe('Material: Cork\nBrand: 9Cork');
    expect(tabs.sizeGuide).toBe('Feature: Details');
    expect(JSON.stringify(tabs)).not.toContain('Do not import this');
  });
});
