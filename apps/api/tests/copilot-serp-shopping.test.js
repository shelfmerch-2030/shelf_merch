import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import {
  discoverSearchPlan,
  isConcreteShoppingQuery,
  isProductShoppingRequest,
  isShoppingFollowUp,
  prefersShoppingCards,
  mapShoppingResults,
  planFromAssistant,
  rememberedShoppingPlan,
  runSerpShoppingRecommendation,
  shoppingPlan,
  wantsRememberedProducts,
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
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'false';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    vi.unstubAllGlobals();
  });

  it('treats a messy employee gift request as a shopping question', () => {
    expect(isProductShoppingRequest('i want to give 5 emp can u should me some products ?')).toBe(true);
    expect(isProductShoppingRequest('show my employees')).toBe(false);
    expect(isProductShoppingRequest('send kits to the employees')).toBe(false);
    expect(isProductShoppingRequest('only show shelf merch products')).toBe(false);
    expect(isProductShoppingRequest('I want to discuss a corporate gift. The occasion is a new employee welcome. The budget is ₹500 per person. Can you help me plan the kit first?')).toBe(false);
    expect(isProductShoppingRequest('i want to give a gift to emp my budget is 500')).toBe(true);
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

  it('searches kitchen gifts when the user asks to see kitchen ideas', () => {
    const text = 'can u show me kitchen tch innovative gifting ideas ?';
    expect(prefersShoppingCards(text)).toBe(true);
    expect(prefersShoppingCards('Suggest eight creative kitchen-tech gifting kits for Toast employees.')).toBe(false);
    const plan = shoppingPlan(text);
    expect(plan.mode).toBe('variety');
    expect(plan.perQuery).toBe(1);
    expect(plan.budget).toEqual({ inr: 2500, exclusive: false });
    expect(plan.queries.map(row => row.query)).toEqual([
      'electric kettle',
      'milk frother',
      'vegetable chopper',
      'digital kitchen scale',
      'hand blender',
    ]);
  });

  it('plans employee gifts when the budget is written as a sentence', () => {
    const plan = shoppingPlan('i want to give a gift to emp my budget is 500', { discover: true });
    expect(plan.mode).toBe('employee_gifts');
    expect(plan.budget).toEqual({ inr: 500, exclusive: false });
    expect(plan.queries.map(row => row.query)).toEqual([
      'insulated stainless steel water bottle',
      'wireless charging pad',
      'mini bluetooth speaker',
      'premium hardcover notebook',
      'portable power bank',
    ]);
  });

  it('leaves out named products and searches innovative gadgets instead', () => {
    const text = 'i want some innovative products apart from bottle, bags hoodie, caps';
    const plan = shoppingPlan(text, { discover: true });
    expect(plan.mode).toBe('variety');
    expect(plan.queries.map(row => row.query)).toEqual([
      'bluetooth speaker',
      'wireless earbuds',
      'portable power bank',
      'wireless mouse',
      'smartwatch',
    ]);
    const [card] = mapShoppingResults({
      shopping_results: [
        listing('Steel water bottle', '₹299', 299),
        listing('ESP32-S3 Development Board', '₹449', 449),
        listing('OnePlus Nord Buds', '₹1,649', 1649),
      ],
    }, { reason: 'A gadget.', budget: plan.budget, limit: 5, drop: plan.drop, require: plan.queries[1].require, describe: true });
    expect(card.product.name).toBe('OnePlus Nord Buds');
    expect(card.product.reason).toBe('OnePlus Nord Buds is a current match for this search.');
  });

  it('splits a kit budget across the notebook, pen, and mug', () => {
    const plan = shoppingPlan('show me a notebook, a pen, and a mug, my budget is 500', { discover: true });
    expect(plan.queries.map(row => [row.query, row.budget.inr])).toEqual([
      ['premium hardcover notebook', 150],
      ['ceramic coffee mug gift', 250],
      ['gel pen', 100],
    ]);
  });

  it('drops a dining table from a kitchen gadget search and a sandwich maker from a tech search', () => {
    const kitchen = shoppingPlan('can u show me kitchen tch innovative gifting ideas ?');
    const imported = { ...listing('Electric Milk Frother Import', '₹799', 799), source: 'Ubuy.in' };
    expect(mapShoppingResults({
      shopping_results: [
        listing('Solid Wood Dining Chair', '₹27000', 27000),
        listing('Morphy Richards Oven Toaster Grill', '₹8605', 8605),
        imported,
        listing('Electric Milk Frother', '₹799', 799),
      ],
    }, { reason: 'Kitchen.', budget: kitchen.budget, limit: 5, require: kitchen.queries[1].require, drop: kitchen.drop })).toMatchObject([
      { product: { name: 'Electric Milk Frother' } },
    ]);
    const tech = shoppingPlan('show me innovative tech products under ₹2000');
    expect(mapShoppingResults({
      shopping_results: [listing('Milton Electric Grill Sandwich Maker', '₹1099', 1099)],
    }, { reason: 'Tech.', budget: tech.budget, limit: 5, require: tech.queries[0].require, drop: tech.queries[0].drop })).toEqual([]);
    const mug = shoppingPlan('show me a mug under ₹250', { discover: true });
    expect(mapShoppingResults({
      shopping_results: [
        listing('Love Unlimited Ceramic Tea Cups Set Of 6', '₹196', 196),
        listing('ZYOZI Ceramic Glossy Mugs Set of Cups and Mugs', '₹180', 180),
        listing('Ceramic Coffee Mug', '₹180', 180),
      ],
    }, { reason: 'Mug.', budget: mug.budget, limit: 5, require: mug.queries[0].require, query: mug.queries[0].query })).toMatchObject([
      { product: { name: 'Ceramic Coffee Mug' } },
    ]);
  });

  it('searches each named kit item when the user asks to see them', () => {
    const text = 'show me a notebook, a pen, and a mug under ₹500';
    expect(isProductShoppingRequest(text)).toBe(true);
    const plan = shoppingPlan(text, { discover: true });
    expect(plan.mode).toBe('named');
    expect(plan.budget).toEqual({ inr: 500, exclusive: true });
    expect(plan.queries.map(row => row.query)).toEqual([
      'premium hardcover notebook',
      'ceramic coffee mug gift',
      'gel pen',
    ]);
  });

  it('uses the notebook, pen, mug, and budget from the earlier chat when the user says show them', async () => {
    const messages = [
      { role: 'user', content: 'My budget is ₹500. The occasion is a new employee welcome. Can you help me design a kit?' },
      { role: 'assistant', content: 'A notebook, a pen, and a mug would fit within ₹500.' },
      { role: 'user', content: 'show them' },
    ];
    expect(wantsRememberedProducts('show them')).toBe(true);
    expect(wantsRememberedProducts('can we have a chat ?')).toBe(false);
    const plan = rememberedShoppingPlan('show them', messages);
    expect(plan.budget).toEqual({ inr: 500, exclusive: false });
    expect(plan.queries.map(row => row.query)).toEqual([
      'premium hardcover notebook',
      'ceramic coffee mug gift',
      'gel pen',
    ]);
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const fetchMock = vi.fn(async (url) => {
      const query = new URL(String(url)).searchParams.get('q');
      expect(query).toMatch(/under (?:100|150|250)/);
      return { ok: true, json: async () => ({ shopping_results: [listing(query, '₹80', 80)] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSerpShoppingRecommendation({ text: 'show them', messages, discover: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.products).toHaveLength(3);
    expect(result.content).toContain('3 product ideas');
    expect(result.content).not.toContain('more');
  });

  it('uses Claude product choices and keeps a vague tech search on the variety plan', () => {
    const kit = planFromAssistant({
      queries: ['notebook', 'pen', 'mug'],
      budgetInr: 500,
      perItem: false,
      exclude: ['bottle'],
    });
    expect(kit.queries.map(row => [row.query, row.budget.inr])).toEqual([
      ['premium hardcover notebook', 150],
      ['gel pen', 100],
      ['ceramic coffee mug gift', 250],
    ]);
    expect(kit.drop.some(pattern => pattern.test('steel water bottle'))).toBe(true);
    const tech = discoverSearchPlan({
      text: 'show me innovative tech products under ₹2000',
      messages: [],
      toolArgs: { queries: ['gadgets'], budgetInr: 2000, exclusive: true, perItem: true },
    });
    expect(tech.queries.map(row => row.query)).toEqual([
      'bluetooth speaker',
      'wireless earbuds',
      'portable power bank',
      'wireless mouse',
      'smartwatch',
    ]);
  });

  it('leaves out a bottle the user rejected when they say show them', () => {
    const messages = [
      { role: 'user', content: 'The budget is ₹500 per person. Can you help me plan the kit first?' },
      { role: 'assistant', content: 'A bottle, a mug, or a notebook, plus a pen.' },
      { role: 'user', content: 'Please use a notebook, a pen, and a mug, and leave out the bottle.' },
      { role: 'assistant', content: 'I can start looking for a notebook, pen, and mug.' },
      { role: 'user', content: 'show them' },
    ];
    const plan = rememberedShoppingPlan('show them', messages);
    expect(plan.queries.map(row => [row.query, row.budget.inr])).toEqual([
      ['premium hardcover notebook', 150],
      ['ceramic coffee mug gift', 250],
      ['gel pen', 100],
    ]);
  });

  it('keeps the cheapest pen that fits the kit when nothing fits the pen share', async () => {
    const messages = [
      { role: 'user', content: 'My budget is ₹500. A notebook, a pen, and a mug.' },
      { role: 'user', content: 'show them' },
    ];
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const fetchMock = vi.fn(async (url) => {
      const query = new URL(String(url)).searchParams.get('q');
      if (query === 'gel pen under 100') {
        return { ok: true, json: async () => ({ shopping_results: [listing('Pilot gel pen', '₹250', 250)] }) };
      }
      if (query === 'gel pen under 500') {
        return { ok: true, json: async () => ({ shopping_results: [listing('Pilot gel pen', '₹250', 250), listing('Classmate gel pen', '₹180', 180)] }) };
      }
      return { ok: true, json: async () => ({ shopping_results: [listing(query, '₹80', 80)] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSerpShoppingRecommendation({ text: 'show them', messages, discover: true });
    expect(result.products.map(row => row.product.name)).toEqual([
      'premium hardcover notebook under 150',
      'ceramic coffee mug gift under 250',
      'Classmate gel pen',
    ]);
    expect(result.products[2].product.priceNumeric).toBe(180);
  });

  it('keeps one card from each gadget type and uses the written lines', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const fetchMock = vi.fn(async (url) => {
      const query = new URL(String(url)).searchParams.get('q');
      const title = query.includes('speaker') ? 'Mini Bluetooth Speaker'
        : query.includes('earbuds') ? 'OnePlus Nord Buds'
          : query.includes('power') ? 'Mi Power Bank'
            : query.includes('mouse') ? 'Logitech Wireless Mouse'
              : 'Redmi Watch 5 Active';
      return { ok: true, json: async () => ({ shopping_results: [listing(title, '₹999', 999), listing('Noise Smart Watch', '₹1,499', 1499)] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSerpShoppingRecommendation({
      text: 'show me innovative tech products under ₹2000',
      discover: true,
      describeCards: async () => ({
        intro: 'Five different gadgets under ₹2,000.',
        reasons: [
          'Mini Bluetooth Speaker is a small speaker.',
          'Wrong product that should be ignored.',
          'Mi Power Bank is a power bank.',
          'Logitech Wireless Mouse is a desk mouse.',
          'Redmi Watch 5 Active is a watch.',
        ],
      }),
    });
    expect(result.products.map(row => row.product.name)).toEqual([
      'Mini Bluetooth Speaker',
      'OnePlus Nord Buds',
      'Mi Power Bank',
      'Logitech Wireless Mouse',
      'Redmi Watch 5 Active',
    ]);
    expect(result.content).toBe('Five different gadgets under ₹2,000.');
    expect(result.products[0].product.reason).toBe('Mini Bluetooth Speaker is a small speaker.');
    expect(result.products[1].product.reason).toBe('OnePlus Nord Buds is a current match for this search.');
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
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
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

  it('skips products already shown when the user asks for more or says they are the same', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const shown = listing('Adult ion8 bottle', '₹3628', 3628);
    const next = listing('Borosil flask', '₹899', 899);
    const messages = [{
      role: 'assistant',
      artifacts: [{
        kind: 'external_product',
        product: {
          imageProvenance: 'shopping_result',
          name: shown.title,
          productUrl: shown.link,
        },
      }],
    }];
    expect(isShoppingFollowUp('you are showing me the same products', messages)).toBe(true);
    expect(isShoppingFollowUp('you are showing me the same products', [])).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ shopping_results: [shown, next] }),
    })));
    const more = await runSerpShoppingRecommendation({
      text: 'can u show me some more products',
      messages,
    });
    expect(more.products.map(row => row.product.name)).not.toContain(shown.title);
    expect(more.products[0].product.name).toBe(next.title);
    expect(more.content).toContain('more product ideas');
    expect(more.followUp).toBe(true);
  });

  it('searches earbuds as earbuds and drops headphone titles', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        shopping_results: [
          listing('Yaroh Wireless Bluetooth Headphones', '₹500', 500),
          listing('OnePlus Nord Buds earbuds', '₹1299', 1299),
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSerpShoppingRecommendation({
      text: 'show me wireless earbuds under 2000',
      discover: true,
    });
    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('q');
    expect(query).toContain('wireless earbuds');
    expect(query).not.toContain('headphones');
    expect(result.products.map((row) => row.product.name)).toEqual(['OnePlus Nord Buds earbuds']);
  });

  it('lowers the cap and skips the cards already shown when the user asks to make it cheaper', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const shown = listing('Premium earbuds', '₹1800', 1800);
    const stillHigh = listing('Other earbuds', '₹1700', 1700);
    const cheap = listing('Basic earbuds', '₹799', 799);
    const messages = [
      { role: 'user', content: 'show me wireless earbuds under 2000' },
      {
        role: 'assistant',
        artifacts: [{
          kind: 'external_product',
          product: {
            imageProvenance: 'shopping_result',
            name: shown.title,
            productUrl: shown.link,
            priceNumeric: 1800,
          },
        }],
      },
    ];
    expect(isShoppingFollowUp('make it cheaper', messages)).toBe(true);
    expect(isShoppingFollowUp('Exclude these', messages)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get('q')).toContain('wireless earbuds');
      const page = parsed.searchParams.get('start') === '20' ? [] : [shown, stillHigh, cheap];
      return { ok: true, json: async () => ({ shopping_results: page }) };
    }));
    const cheaper = await runSerpShoppingRecommendation({
      text: 'make it cheaper',
      messages,
      discover: true,
    });
    expect(cheaper.products.map((row) => row.product.name)).toEqual(['Other earbuds', 'Basic earbuds']);
    expect(cheaper.followUp).toBe(true);
  });

  it('keeps the same search and drops the cards on screen when the user says exclude these', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    env.EMBEDDED_COPILOT_SERPAPI_KILL_SWITCH = 'false';
    const shown = listing('Premium earbuds', '₹1800', 1800);
    const next = listing('Basic earbuds', '₹799', 799);
    const messages = [
      { role: 'user', content: 'show me wireless earbuds' },
      {
        role: 'assistant',
        artifacts: [{
          kind: 'external_product',
          product: {
            imageProvenance: 'shopping_result',
            name: shown.title,
            productUrl: shown.link,
            priceNumeric: 1800,
          },
        }],
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const page = new URL(String(url)).searchParams.get('start') === '20' ? [] : [shown, next];
      return { ok: true, json: async () => ({ shopping_results: page }) };
    }));
    const excluded = await runSerpShoppingRecommendation({
      text: 'Exclude these',
      messages,
      discover: true,
    });
    expect(excluded.products.map((row) => row.product.name)).toEqual(['Basic earbuds']);
  });

  it('keeps later Google Shopping links when only the query string differs', () => {
    const shown = 'https://www.google.com/search?ibp=oshop&q=bottle-a';
    const next = 'https://www.google.com/search?ibp=oshop&q=bottle-b';
    const cards = mapShoppingResults({
      shopping_results: [
        { title: 'Ion8 bottle', product_link: shown, source: 'ubuy.co.in', price: '₹3628', extracted_price: 3628, thumbnail: 'https://m.media-amazon.com/images/ion8.jpg' },
        { title: 'Milton flask', product_link: next, source: 'Amazon.in', price: '₹749', extracted_price: 749, thumbnail: 'https://m.media-amazon.com/images/milton.jpg' },
      ],
    }, {
      reason: 'Another bottle.',
      limit: 1,
      exclude: { urls: new Set([shown.toLowerCase()]), names: new Set(['ion8 bottle']) },
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].product.name).toBe('Milton flask');
    expect(cards[0].product.productUrl).toBe(next);
  });

  it('does not send a vague budget sentence to SerpAPI', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    const text = 'my budget is 190 rs show me 10 products';
    expect(isConcreteShoppingQuery(text)).toBe(false);
    const plan = shoppingPlan(text, { discover: true });
    expect(plan.queries).toEqual([]);
    const search = vi.fn();
    const result = await runSerpShoppingRecommendation({ text, discover: true, search });
    expect(search).not.toHaveBeenCalled();
    expect(result.products).toEqual([]);
    expect(result.content).toBe('');
  });

  it('uses Claude searches for a vague request, keeps the stated budget, and returns the requested count', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    const text = 'my budget is 190 rs show me 10 products';
    const plan = discoverSearchPlan({
      text,
      toolArgs: { queries: ['gel pen', 'keychain'], budgetInr: 5000, count: 10 },
    });
    expect(plan.queries.map((row) => row.query)).toEqual(['gel pen', 'keychain']);
    expect(plan.budget).toEqual({ inr: 190, exclusive: false });
    expect(plan.limit).toBe(10);
    const rows = [
      listing('Fancy keychain', '₹250', 250),
      ...Array.from({ length: 12 }, (_, index) => listing(`${String.fromCharCode(65 + index)} gel pen`, '₹40', 40)),
    ];
    const search = vi.fn(async () => ({ shopping_results: rows }));
    const result = await runSerpShoppingRecommendation({
      text, discover: true, plan, search, config: env,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.products).toHaveLength(10);
    expect(result.products.every((row) => row.product.priceNumeric <= 190)).toBe(true);
    expect(result.products.some((row) => row.product.name === 'Fancy keychain')).toBe(false);
    expect(result.content).not.toMatch(/took too long/);
  });

  it('keeps cards from a later search when an earlier SerpAPI call times out', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    const search = vi.fn()
      .mockResolvedValueOnce({ shopping_results: [], failure: 'timeout' })
      .mockResolvedValueOnce({ shopping_results: [listing('Ceramic mug', '₹120', 120), listing('Steel bottle', '₹400', 400)] });
    const result = await runSerpShoppingRecommendation({
      text: 'show me a pen and a mug under 190',
      discover: true,
      search,
      config: env,
    });
    expect(search.mock.calls.length).toBeGreaterThan(1);
    expect(result.products.map((row) => row.product.name)).toEqual(['Ceramic mug']);
    expect(result.content).not.toMatch(/took too long/);
  });

  it('says the search took too long only when every search times out', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    const search = vi.fn(async () => ({ shopping_results: [], failure: 'timeout' }));
    const result = await runSerpShoppingRecommendation({
      text: 'show me a mug under 190',
      discover: true,
      search,
      config: env,
    });
    expect(result.products).toEqual([]);
    expect(result.content).toMatch(/took too long/);
  });

  it('follows a narrower request from Claude and does not repeat cards already shown', async () => {
    env.SERPAPI_API_KEY = 'test-key';
    env.EMBEDDED_COPILOT_SERPAPI_ENABLED = 'true';
    const shown = listing('Premium earbuds', '₹1800', 1800);
    const messages = [
      { role: 'user', content: 'show me wireless earbuds under 2000' },
      {
        role: 'assistant',
        artifacts: [{
          kind: 'external_product',
          product: {
            imageProvenance: 'shopping_result',
            name: shown.title,
            productUrl: shown.link,
            priceNumeric: 1800,
          },
        }],
      },
    ];
    const text = 'only tech products';
    expect(isShoppingFollowUp(text, messages)).toBe(false);
    const plan = discoverSearchPlan({
      text,
      messages,
      toolArgs: { queries: ['bluetooth speaker', 'power bank'], budgetInr: 2000 },
    });
    expect(plan.queries.map((row) => row.query)).toEqual(['mini bluetooth speaker', 'portable power bank']);
    const search = vi.fn(async () => ({
      shopping_results: [shown, listing('Mini Bluetooth Speaker', '₹999', 999)],
    }));
    const result = await runSerpShoppingRecommendation({
      text, messages, discover: true, plan, search, config: env,
    });
    expect(result.products.map((row) => row.product.name)).toEqual(['Mini Bluetooth Speaker']);
  });
});
