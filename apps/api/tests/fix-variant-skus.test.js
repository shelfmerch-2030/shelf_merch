import { describe, it, expect } from 'vitest';
import { colorCode, planVariantSkus, sizeCode } from '../src/scripts/fix-variant-skus.js';

describe('fix-variant-skus planner', () => {
  it('builds readable codes', () => {
    expect(colorCode('Midnight Navy')).toBe('MNAV');
    expect(colorCode('Heather red')).toBe('HRED');
    expect(colorCode('Black')).toBe('BLAC');
    expect(sizeCode('2XL')).toBe('2XL');
  });

  it('renames empty, product-SKU and cross-product duplicate variant SKUs; skips Shopify products', () => {
    const products = [
      { _id: 'a', sku: 'TEE-1', variants: [
        { _id: 'a1', sku: 'TEE-1', size: 'L', color: 'Midnight Navy' },
        { _id: 'a2', sku: '', size: 'M', color: 'Black' },
        { _id: 'a3', sku: 'SHARED', size: 'S', color: 'Black' },
        { _id: 'a4', sku: 'TEE-1-OK', size: 'XL', color: 'Black' },
      ] },
      { _id: 'b', sku: 'TEE-2', variants: [{ _id: 'b1', sku: 'SHARED', size: 'S', color: 'Black' }] },
      { _id: 'c', sku: 'SHOP-1', source: { provider: 'shopify' }, variants: [{ _id: 'c1', sku: 'SHOP-1', size: 'L', color: 'Red' }] },
    ];
    const plan = planVariantSkus(products);
    expect(plan.map((c) => [c.variantId, c.to])).toEqual([
      ['a1', 'TEE-1-MNAV-L'],
      ['a2', 'TEE-1-BLAC-M'],
      ['b1', 'TEE-2-BLAC-S'],
    ]);
  });
});
