import { describe, expect, it } from 'vitest';
import {
  categoryFilter,
  productSearchFilter,
  productSourceLabel,
  sourceProviderFilter,
  tenantCatalogFilter,
} from '../src/modules/catalog/catalogFilters.js';

describe('catalogFilters', () => {
  it('filters shopify vs native sources', () => {
    expect(sourceProviderFilter('shopify')).toEqual({ 'source.provider': 'shopify' });
    expect(sourceProviderFilter('native')).toEqual({
      'source.provider': { $nin: ['shopify', 'seed'] },
    });
    expect(sourceProviderFilter()).toEqual({});
    expect(sourceProviderFilter('all')).toEqual({});
  });

  it('labels product source', () => {
    expect(productSourceLabel({ provider: 'shopify' })).toBe('shopify');
    expect(productSourceLabel({ provider: 'manual' })).toBe('native');
    expect(productSourceLabel(undefined)).toBe('native');
  });

  it('tenant catalog includes manual, shopify, seed, and legacy products', () => {
    expect(tenantCatalogFilter()).toEqual({
      $or: [
        { 'source.provider': { $in: ['manual', 'shopify', 'seed'] } },
        { source: { $exists: false } },
        { 'source.provider': { $exists: false } },
      ],
    });
  });

  it('builds search filter across name, sku and brand', () => {
    expect(productSearchFilter('')).toEqual({});
    expect(productSearchFilter('  ')).toEqual({});
    const f = productSearchFilter('hm');
    expect(f.$or).toHaveLength(3);
    expect(f.$or[0]).toEqual({ name: { $regex: 'hm', $options: 'i' } });
    expect(f.$or[1]).toEqual({ sku: { $regex: 'hm', $options: 'i' } });
    expect(f.$or[2]).toEqual({ brand: { $regex: 'hm', $options: 'i' } });
  });

  it('expands Accessories to former parent category names', () => {
    expect(categoryFilter('Accessories')).toEqual({
      category: {
        $in: [
          'Accessories',
          'Key Chains',
          'Bags',
          'Drinkware',
          'Office Supplies',
          'Technology',
          'Card Holders',
        ],
      },
    });
    expect(categoryFilter('Apparel')).toEqual({ category: 'Apparel' });
  });
});
