import { describe, it, expect } from 'vitest';
import {
  customisedKitSendTotals,
  PREMIUM_BOX_PER_RECIP,
  SAMPLE_WRAP_PER_KIT,
  SAMPLE_SHIP_PER_KIT,
  sampleKitSendTotals,
} from '../src/modules/kits/kitPricing.js';

describe('sampleKitSendTotals', () => {
  it('uses 35 wrapping, 50 shipping, and existing 18 percent GST for pre-curated kits', () => {
    const t = sampleKitSendTotals({
      kind: 'pre-designed',
      packaging: 'wrap',
      pricePerKitInr: 1180,
    });
    expect(t.unitPrice).toBe(1000);
    expect(t.pkgPerKit).toBe(SAMPLE_WRAP_PER_KIT);
    expect(t.pkgPerKit).not.toBe(PREMIUM_BOX_PER_RECIP);
    expect(t.ship).toBe(SAMPLE_SHIP_PER_KIT);
    expect(t.branding).toBe(0);
    expect(t.tax).toBe(Math.ceil((1000 + 35) * 0.18));
    expect(t.total).toBe(t.unitPrice + t.pkgPerKit + t.tax + t.ship);
  });

  it('charges 0 wrapping when pre-curated sample ships without wrapping', () => {
    const t = sampleKitSendTotals({
      kind: 'pre-designed',
      packaging: 'none',
      pricePerKitInr: 1180,
    });
    expect(t.pkgPerKit).toBe(0);
    expect(t.ship).toBe(SAMPLE_SHIP_PER_KIT);
    expect(t.tax).toBe(Math.ceil(1000 * 0.18));
    expect(t.total).toBe(1000 + t.tax + SAMPLE_SHIP_PER_KIT);
  });

  it('reuses customised 49 packaging math and only adds sample shipping', () => {
    const products = [{ basePriceInr: 118, category: 'Office' }];
    const send = customisedKitSendTotals(1, 'box', products);
    const sample = sampleKitSendTotals({
      kind: 'customised',
      packaging: 'box',
      products,
    });
    expect(sample.pkgPerKit).toBe(PREMIUM_BOX_PER_RECIP);
    expect(sample.tax).toBe(send.tax);
    expect(sample.ship).toBe(SAMPLE_SHIP_PER_KIT);
    expect(sample.branding).toBe(0);
    expect(sample.total).toBe(send.total + SAMPLE_SHIP_PER_KIT);
  });

  it('charges 35 wrapping for customised samples', () => {
    const products = [{ basePriceInr: 118, category: 'Office' }];
    const none = sampleKitSendTotals({
      kind: 'customised',
      packaging: 'none',
      products,
    });
    const sample = sampleKitSendTotals({
      kind: 'customised',
      packaging: 'wrap',
      products,
    });
    expect(sample.pkgPerKit).toBe(SAMPLE_WRAP_PER_KIT);
    expect(sample.ship).toBe(SAMPLE_SHIP_PER_KIT);
    expect(sample.branding).toBe(0);
    expect(sample.total).toBeGreaterThan(none.total);
  });
});
