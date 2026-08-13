import { describe, it, expect } from 'vitest';
import { resolveKitItemOptions, isDrinkwareProduct, effectiveProductGroup } from '../src/modules/kits/kitProductOptions.js';

describe('kitProductOptions', () => {
  it('bottle never requires size but keeps colour when catalog has colour variants', () => {
    const product = {
      group: 'bottle',
      category: 'Drinkware',
      variants: [{ size: 'S', color: 'White' }],
      primaryImageUrl: '/uploads/bottle.jpg',
      maskImageUrl: '/uploads/broken-mask.png',
    };
    const opts = resolveKitItemOptions(product, { group: 'bottle' });
    expect(opts.requiresSize).toBe(false);
    expect(opts.sizes).toEqual([]);
    expect(opts.requiresColor).toBe(true);
    expect(opts.colors).toEqual(['White']);
    expect(isDrinkwareProduct(product, { group: 'bottle' })).toBe(true);
  });

  it('notebook / tech expose colour variants without inventing sizes', () => {
    const product = {
      group: 'notebook',
      category: 'Office Supplies',
      variants: [
        { color: 'Black', colorHex: '#111111' },
        { color: 'Navy', colorHex: '#001f5b' },
      ],
    };
    const opts = resolveKitItemOptions(product, { group: 'notebook' });
    expect(opts.requiresSize).toBe(false);
    expect(opts.requiresColor).toBe(true);
    expect(opts.colors).toEqual(['Black', 'Navy']);
  });

  it('detects drinkware from product name when group is missing', () => {
    const product = {
      name: 'Work Well Stainless Bottle',
      group: '',
      category: 'Technology',
      variants: [],
      primaryImageUrl: '/uploads/bottle-photo.jpg',
    };
    expect(isDrinkwareProduct(product, { name: 'Work Well Stainless Bottle' })).toBe(true);
    expect(resolveKitItemOptions(product, { name: 'Work Well Stainless Bottle' }).requiresSize).toBe(false);
    expect(effectiveProductGroup(product, { group: 'tee' })).toBe('power');
  });

  it('wrong kit ref group does not override drinkware category', () => {
    const product = { group: '', category: 'Drinkware', name: 'Steel Bottle', variants: [{ size: 'M' }] };
    expect(resolveKitItemOptions(product, { group: 'tee' }).requiresSize).toBe(false);
  });

  it('tee without variants gets default apparel sizes', () => {
    const product = { group: 'tee', category: 'Apparel', variants: [] };
    const opts = resolveKitItemOptions(product, { group: 'tee' });
    expect(opts.requiresSize).toBe(true);
    expect(opts.sizes).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  });

  it('hoodie with non-standard variant sizes falls back to defaults', () => {
    const product = {
      group: 'hoodie',
      category: 'Apparel',
      variants: [{ size: 'G', color: '#d33636' }],
    };
    const opts = resolveKitItemOptions(product, { group: 'hoodie' });
    expect(opts.requiresSize).toBe(true);
    expect(opts.sizes).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    expect(opts.requiresColor).toBe(true);
    expect(opts.colors).toEqual(['#d33636']);
  });

  it('apparel with multiple variant colours asks for colour in kit redemption', () => {
    const product = {
      group: 'tee',
      category: 'Apparel',
      variants: [
        { size: 'L', color: '#0d68c9' },
        { size: 'M', color: '#df58d4' },
        { size: 'S', color: '#e1944c' },
      ],
    };
    const opts = resolveKitItemOptions(product, { group: 'tee' });
    expect(opts.requiresSize).toBe(true);
    expect(opts.requiresColor).toBe(true);
    expect(opts.colors).toEqual(['#0d68c9', '#df58d4', '#e1944c']);
  });
});
