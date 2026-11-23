import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import { publicResearchRequest } from '../src/modules/copilot/copilotWebResearch.js';
import {
  applyImageToExternalProducts,
  buildExternalProductArtifacts,
  buildGiftKitIdeaArtifacts,
} from '../src/modules/copilot/copilotExternalProductArtifacts.js';
import {
  extractListingImageUrl,
  enrichListingImages,
  fetchListingHtml,
  isBlockedIp,
  publicHttpsUrl,
  resolvePublicHostname,
} from '../src/modules/copilot/copilotExternalListingMedia.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';

const modelId = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const config = {
  COPILOT_AI_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'synthetic-no-network',
  EMBEDDED_COPILOT_WEB_SEARCH_ENABLED: 'true',
  EMBEDDED_COPILOT_WEB_SEARCH_KILL_SWITCH: 'false',
  EMBEDDED_COPILOT_WEB_SEARCH_TENANT_ALLOWLIST: '',
  EMBEDDED_COPILOT_WEB_SEARCH_MAX_USES: 3,
  EMBEDDED_COPILOT_WEB_SEARCH_MAX_CONTINUATIONS: 1,
  EMBEDDED_COPILOT_EXTERNAL_PRODUCT_CARDS_ENABLED: 'true',
  EMBEDDED_COPILOT_EXTERNAL_IMAGE_ENRICHMENT_ENABLED: 'false',
  EMBEDDED_COPILOT_RESEARCH_SYNTHESIS_TIMEOUT_MS: 12_000,
};
const previousEnv = Object.fromEntries(Object.keys(config).map(key => [key, env[key]]));
const { evaluateReservation } = vi.hoisted(() => ({ evaluateReservation: vi.fn() }));
vi.mock('../src/config/redis.js', async importOriginal => ({
  ...await importOriginal(), ensureRedisReady: async () => true,
  getRedis: () => ({ eval: evaluateReservation }),
}));

const cite = (url, title, quote = 'Public listing excerpt') => ({
  type: 'web_search_result_location', url, title, cited_text: quote, encrypted_index: 'server-only-index',
});
const searchResult = (url, title = 'Public listing') => ({
  type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1',
  content: [{ type: 'web_search_result', url, title, encrypted_content: 'server-only-content' }],
});
const listings = entries => ({
  text: 'ignored', contentBlocks: [
    ...entries.map(([slug]) => searchResult(`https://example.com/${slug}`, entries.find(([s]) => s === slug)?.[1])),
    { type: 'text', text: 'Native raw narration', citations: entries.map(([slug, title, quote]) => cite(`https://example.com/${slug}`, title, quote)) },
  ], finishReason: 'end_turn', webSearchRequests: 1, toolCalls: [], usage: { promptTokens: 50, completionTokens: 20 },
});
const synthesis = (findings, concepts = [], kits) => ({
  finishReason: 'end_turn', toolCalls: [],
  text: JSON.stringify({ findings, concepts, ...(kits ? { kits } : {}) }),
  usage: { promptTokens: 24, completionTokens: 18 },
});
const point = (source, name, evidence, price) => ({
  source, name, evidence, price, reason: 'A practical option for a frequently used gift',
});

beforeAll(connectTestDb);
beforeEach(async () => {
  vi.restoreAllMocks();
  evaluateReservation.mockReset().mockResolvedValue(1);
  Object.assign(env, { ...config });
  await clearTestDb();
});
afterAll(async () => { Object.assign(env, previousEnv); await disconnectTestDb(); });

async function workspace() {
  const tenant = await makeTenant();
  const { user } = await makeUser(tenant, 'company_admin');
  env.EMBEDDED_COPILOT_WEB_SEARCH_TENANT_ALLOWLIST = tenant.id;
  const scope = { tenantId: tenant._id, userId: user._id, role: 'company_admin' };
  const conversation = await createConversation(scope);
  const toolCtx = buildCopilotToolCtx({ tenantId: scope.tenantId, user: { userId: scope.userId, role: 'company_admin' } });
  return {
    ...scope, id: conversation.id,
    async turn(content) {
      await streamAssistantTurn({ ...scope, conversationId: conversation.id, toolCtx, content, mode: 'chat' });
      const saved = await CopilotConversation.findById(conversation.id).lean();
      return { reply: saved.messages.at(-1), saved };
    },
  };
}

function mockClaude() {
  const client = { models: { retrieve: vi.fn().mockResolvedValue({ capabilities: {
    server_tools: { web_search: { supported: true } },
  } }) } };
  vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue(client);
  return vi.spyOn(adapter, 'streamAnthropicCompletion');
}

describe('Milestone 2 external product discovery', () => {
  it('routes the natural CEO gifting kit prompt into listings research without search-the-web wording', () => {
    const brief = publicResearchRequest(
      'I need something innovative in kitchen tech for Toast employees. Give me nice gifting kit ideas.',
    );
    expect(brief).toMatchObject({
      purpose: 'listings',
      topic: 'kitchen technology and kitchenware',
      kitIntent: true,
      audience: 'employee gifting',
      company: 'Toast',
    });
  });

  it('builds verified external_product artifacts without inventing prices or availability', () => {
    const findings = [{
      row: { name: 'Smart Kitchen Scale', source: 1 },
      source: { url: 'https://example.com/scale', title: 'Smart Kitchen Scale', excerpt: 'Smart Kitchen Scale for ₹1,299 per piece.' },
      price: { text: '₹1,299', numeric: 1299, currency: 'INR', inr: true },
      reason: 'Useful for meal-prep kits',
    }];
    const [card] = buildExternalProductArtifacts(findings, { retrievedAt: '2026-11-23T10:00:00.000Z' });
    expect(card).toMatchObject({
      kind: 'external_product',
      product: {
        verification: 'verified_listing',
        name: 'Smart Kitchen Scale',
        productUrl: 'https://example.com/scale',
        merchantHostname: 'example.com',
        priceText: '₹1,299',
        currency: 'INR',
        availability: 'unknown',
      },
    });
    expect(card.product).not.toHaveProperty('imageUrl');
  });

  it('fills requested gift kits with concepts when verified listings are short', () => {
    const findings = [{
      row: { name: 'Milk Frother', source: 1 },
      source: { url: 'https://example.com/frother', title: 'Milk Frother', excerpt: 'Milk Frother for ₹899' },
      price: { text: '₹899', numeric: 899, currency: 'INR', inr: true },
      reason: 'Coffee welcome kit staple',
    }];
    const products = buildExternalProductArtifacts(findings, { retrievedAt: '2026-11-23T10:00:00.000Z' });
    const concepts = Array.from({ length: 8 }, (_, i) => ({
      name: `Concept kit ${i + 1}`, reason: 'A themed corporate kitchen gift idea to source',
    }));
    const kits = buildGiftKitIdeaArtifacts({
      findings, concepts, externalProducts: products, requestedCount: 8, company: 'Toast', audience: 'employee gifting',
    });
    expect(kits).toHaveLength(8);
    expect(kits[0].kit.components.some(row => row.role === 'verified_listing')).toBe(true);
    expect(kits.filter(row => row.kit.components.every(c => c.role === 'concept')
      || row.kit.components.some(c => c.role === 'concept')).length).toBeGreaterThanOrEqual(7);
    expect(kits[0].kit.budget.status).toMatch(/partial|complete|unavailable/);
    expect(kits[1].kit.budget.missingPriceCount).toBeGreaterThan(0);
    expect(kits.every(row => row.kit.imagePolicy === 'none')).toBe(true);
  });

  it('rejects private and non-https image targets during enrichment', () => {
    expect(publicHttpsUrl('http://shop.example.com/a.jpg')).toBeNull();
    expect(publicHttpsUrl('https://127.0.0.1/a.jpg')).toBeNull();
    expect(publicHttpsUrl('https://localhost/a.jpg')).toBeNull();
    expect(publicHttpsUrl('https://shop.example.com/a.jpg?token=secret')).toBeNull();
    expect(publicHttpsUrl('https://cdn.shop.example.com/products/a.jpg')).toBe('https://cdn.shop.example.com/products/a.jpg');
  });

  it('blocks private, link-local, and reserved IP addresses after DNS resolution', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254',
      '100.64.1.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedIp(ip)).toBe(true);
    }
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
  });

  it('refuses enrichment fetches when DNS resolves to a private address (nip.io-style SSRF)', async () => {
    const lookup = vi.fn(async () => [{ address: '169.254.169.254', family: 4 }]);
    expect(await resolvePublicHostname('127.0.0.1.nip.io', lookup)).toBeNull();
    expect(await fetchListingHtml('https://shop.example.com/scale', {
      lookup,
      fetchImpl: async () => { throw new Error('must not fetch'); },
    })).toBeNull();
    expect(lookup).toHaveBeenCalled();
  });

  it('caps HTML body size even when Content-Length is missing', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
    const huge = 'x'.repeat(600 * 1024);
    const html = await fetchListingHtml('https://shop.example.com/scale', {
      lookup,
      fetchImpl: async () => new Response(huge, { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    expect(html).toBeNull();
  });

  it('extracts og:image and rejects unsuitable placeholders', () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://cdn.shop.example.com/products/scale.jpg" />
        <meta name="twitter:image" content="https://cdn.shop.example.com/1x1.gif" />
      </head></html>`;
    expect(extractListingImageUrl(html, 'https://example.com/scale'))
      .toBe('https://cdn.shop.example.com/products/scale.jpg');
    expect(extractListingImageUrl(
      '<meta property="og:image" content="https://cdn.shop.example.com/spacer.png" />',
      'https://example.com/scale',
    )).toBeNull();
  });

  it('soft-fails enrichment when fetch is blocked and still attaches cards without images', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
    const images = await enrichListingImages(['https://example.com/scale'], {
      lookup,
      fetchImpl: async () => { throw new Error('blocked'); },
    });
    expect(images.size).toBe(0);
    const products = applyImageToExternalProducts(buildExternalProductArtifacts([{
      row: { name: 'Smart Kitchen Scale', source: 1 },
      source: { url: 'https://example.com/scale', title: 'Smart Kitchen Scale', excerpt: 'Smart Kitchen Scale' },
      price: null, reason: 'Useful',
    }], { retrievedAt: '2026-11-23T10:00:00.000Z' }), images);
    expect(products[0].product.imageUrl).toBeUndefined();
  });

  it('drops image URLs that fail publicHttpsUrl when applying enrichment', () => {
    const products = buildExternalProductArtifacts([{
      row: { name: 'Smart Kitchen Scale', source: 1 },
      source: { url: 'https://example.com/scale', title: 'Smart Kitchen Scale', excerpt: 'Smart Kitchen Scale' },
      price: null, reason: 'Useful',
    }], { retrievedAt: '2026-11-23T10:00:00.000Z' });
    const poisoned = applyImageToExternalProducts(products, new Map([
      ['https://example.com/scale', { imageUrl: 'http://169.254.169.254/latest/meta-data', provenance: 'merchant_og' }],
    ]));
    expect(poisoned[0].product.imageUrl).toBeUndefined();
  });

  it('persists external_product and gift_kit_idea artifacts for a natural kit prompt', async () => {
    const stream = mockClaude();
    const chat = await workspace();
    const entries = [
      ['scale', 'Smart Kitchen Scale', 'Smart Kitchen Scale for ₹1,299 per piece.'],
      ['frother', 'Milk Frother', 'Milk Frother for ₹899 per piece.'],
    ];
    const concepts = Array.from({ length: 6 }, (_, i) => ({
      name: `Prep kit idea ${i + 1}`, reason: 'A useful kitchen concept for employees',
    }));
    stream.mockResolvedValueOnce(listings(entries)).mockResolvedValueOnce(synthesis(
      entries.map(([, name, quote], index) => point(index + 1, name, quote, ['₹1,299', '₹899'][index])),
      concepts,
    ));
    const { reply, saved } = await chat.turn(
      'I need something innovative in kitchen tech for Toast employees. Give me nice gifting kit ideas.',
    );
    expect(stream.mock.calls[0][0].webSearch).toEqual({ maxUses: 3 });
    expect(JSON.parse(stream.mock.calls[0][0].messages[0].content)).toMatchObject({
      purpose: 'listings', topic: 'kitchen technology and kitchenware',
    });
    expect(JSON.parse(stream.mock.calls[0][0].messages[0].content)).not.toHaveProperty('company');
    const external = reply.artifacts.filter(row => row.kind === 'external_product');
    const kits = reply.artifacts.filter(row => row.kind === 'gift_kit_idea');
    expect(external.length).toBeGreaterThanOrEqual(1);
    expect(external[0].product).toMatchObject({
      verification: 'verified_listing', availability: 'unknown', merchantHostname: 'example.com',
    });
    expect(kits.length).toBeGreaterThanOrEqual(3);
    expect(kits.some(row => row.kit.components.some(c => c.role === 'concept'))).toBe(true);
    expect(JSON.stringify(saved.messages)).toContain('external_product');
    expect(JSON.stringify(saved.messages)).toContain('gift_kit_idea');
  });

  it('keeps cards off when the Milestone 2 flag is disabled', async () => {
    env.EMBEDDED_COPILOT_EXTERNAL_PRODUCT_CARDS_ENABLED = 'false';
    const stream = mockClaude();
    const chat = await workspace();
    const entries = [['scale', 'Smart Kitchen Scale', 'Smart Kitchen Scale for ₹1,299 per piece.']];
    stream.mockResolvedValueOnce(listings(entries)).mockResolvedValueOnce(synthesis([
      point(1, 'Smart Kitchen Scale', entries[0][2], '₹1,299'),
    ]));
    const { reply } = await chat.turn('Search the web for kitchen-tech gadgets available in India.');
    expect(reply.artifacts.every(row => row.kind === 'web_research')).toBe(true);
  });

  it('emits verified external_product cards from cited titles when synthesis times out', async () => {
    env.EMBEDDED_COPILOT_RESEARCH_SYNTHESIS_TIMEOUT_MS = 40;
    const stream = mockClaude();
    const chat = await workspace();
    const entries = [
      ['frother', 'Rechargeable Milk Frother — Merchant', 'Rechargeable Milk Frother price ₹399.'],
      ['scale', 'Compact Digital Kitchen Scale', 'Compact Digital Kitchen Scale for ₹599 per piece'],
    ];
    stream.mockResolvedValueOnce(listings(entries)).mockImplementationOnce(async ({ signal }) => new Promise((_, reject) => {
      const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (signal?.aborted) return fail();
      signal.addEventListener('abort', fail, { once: true });
    }));
    const { reply } = await chat.turn(
      'Search the web for 5 innovative kitchen-tech gadgets available in India. Show product names, verified prices where available, suppliers, and source links.',
    );
    const products = reply.artifacts.filter(row => row.kind === 'external_product');
    expect(reply.artifacts[0].research).toMatchObject({ status: 'partial' });
    expect(reply.artifacts[0].research.leadsOnly).toBeFalsy();
    expect(products).toHaveLength(2);
    expect(products[0].product).toMatchObject({
      verification: 'verified_listing',
      name: 'Rechargeable Milk Frother',
      merchantHostname: 'example.com',
      priceText: '₹399',
      currency: 'INR',
      availability: 'unknown',
    });
    expect(products[1].product).toMatchObject({
      name: 'Compact Digital Kitchen Scale',
      priceText: '₹599',
      currency: 'INR',
    });
    expect(products.every(row => !row.product.imageUrl)).toBe(true);
    expect(reply.content).not.toMatch(/sold by|in stock|Flipkart|Amazon/i);
  });
});
