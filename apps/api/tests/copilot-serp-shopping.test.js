import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import {
  isProductShoppingRequest,
  mapShoppingResults,
  runSerpShoppingRecommendation,
  shoppingPlan,
} from '../src/modules/copilot/copilotSerpShopping.js';

const listing = (title, price, extracted) => ({
  title,
  link: `https://www.amazon.in/dp/${title.slice(0, 8).replace(/\s/g, '')}`,
  product_link: 'https://www.google.com/search?ibp=oshop&q=secret-wrapper',
  source: 'Amazon.in',
  price,
  extracted_price: extracted,
  thumbnail: `https://m.media-amazon.com/images/${title.slice(0, 6).replace(/\s/g, '')}.jpg`,
  serpapi_product_api: 'https://serpapi.com/search.json?api_key=should-not-leak',
});

describe('SerpAPI shopping product cards', () => {
  afterEach(() => {
    env.SERPAPI_API_KEY = '';
    vi.unstubAllGlobals();
  });

  it('treats a messy employee gift request as a shopping question', () => {
    expect(isProductShoppingRequest('i want to give 5 emp can u should me some products ?')).toBe(true);
    expect(isProductShoppingRequest('show my employees')).toBe(false);
    expect(isProductShoppingRequest('send kits to the employees')).toBe(false);
    expect(isProductShoppingRequest('only show shelf merch products')).toBe(false);
  });

  it('plans five different gift searches and keeps 5 as the employee count', () => {
    const plan = shoppingPlan('i want to give 5 emp can u show me some products');
    expect(plan.mode).toBe('employee_gifts');
    expect(plan.recipientCount).toBe(5);
    expect(plan.queries.map(row => row.query)).toEqual([
      'insulated stainless steel water bottle',
      'wireless charging pad',
      'mini bluetooth speaker',
      'premium hardcover notebook',
      'portable power bank',
    ]);
  });

  it('searches one named product and applies the budget', () => {
    const plan = shoppingPlan('show me bluetooth speakers under ₹2,000');
    expect(plan.mode).toBe('focused');
    expect(plan.perQuery).toBe(5);
    expect(plan.budget).toEqual({ inr: 2000, exclusive: true });
  });

  it('keeps a photo, price, and merchant link and drops the SerpAPI credential URL', () => {
    const [card] = mapShoppingResults({
      shopping_results: [
        listing('Insulated steel bottle', '₹799', 799),
        listing('Luxury bottle', '₹2,499', 2499),
      ],
    }, { reason: 'Everyday useful.', budget: { inr: 1000, exclusive: false }, limit: 5 });
    expect(card.product).toMatchObject({
      name: 'Insulated steel bottle',
      priceText: '₹799',
      priceNumeric: 799,
      currency: 'INR',
      imageProvenance: 'shopping_result',
      merchantDisplayName: 'Amazon.in',
      reason: 'Everyday useful.',
    });
    expect(card.product.imageUrl).toMatch(/^https:\/\/m\.media-amazon\.com\//);
    expect(card.product.productUrl).toMatch(/^https:\/\/www\.amazon\.in\/dp\//);
    expect(JSON.stringify(card)).not.toContain('api_key');
    expect(mapShoppingResults({ shopping_results: [listing('Luxury bottle', '₹2,499', 2499)] }, {
      budget: { inr: 1000, exclusive: true }, limit: 1,
    })).toEqual([]);
  });

  it('asks SerpAPI for India shopping results and returns up to five cards', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      expect(href).toContain('engine=google_shopping');
      expect(href).toContain('gl=in');
      expect(href).toContain('google_domain=google.co.in');
      const query = new URL(href).searchParams.get('q');
      return {
        ok: true,
        json: async () => ({ shopping_results: [listing(query, '₹650', 650)] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSerpShoppingRecommendation({
      text: 'i want to give 5 emp can u show me some products',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.products).toHaveLength(5);
    expect(result.products.every(row => row.product.imageUrl && row.product.priceText && row.product.productUrl)).toBe(true);
    expect(result.content).toContain('5 product ideas');
    expect(result.content).toContain('5 employees');
  });
});
