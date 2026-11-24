import { describe, expect, it } from 'vitest';
import { publicResearchRequest, resolveCatalogTopic, researchProductFocus } from '../src/modules/copilot/copilotWebResearch.js';
import { isCreativeGiftingRequest, isGiftingAdvisorRequest, requestedAdvice, updateAdvisorBrief } from '../src/modules/copilot/giftingAdvisor.js';
import { isCopilotBusinessRequest } from '../src/modules/copilot/giftingAdvisor.js';
import { catalogDiscoveryIntent } from '../src/modules/copilot/copilotCatalogDiscovery.js';
import { curatorSource, mergeBrief } from '../src/modules/copilot/curator.js';
import { openAiImageSearchEnabled } from '../src/modules/copilot/copilotOpenAiImageSearch.js';

const STAGING_EXTERNAL = 'Suggest 5 unique and innovative tech gifts for remote employees under INR 3,000 each, available in India. Search the internet for actual products from external sellers, not the ShelfMerch catalog.';

describe('Scenario A — general conversation', () => {
  it('does not force gifting research or advisor for AWS explanations', () => {
    const prompt = 'Explain AWS Lambda in simple terms.';
    expect(publicResearchRequest(prompt)).toBeNull();
    expect(isGiftingAdvisorRequest(prompt)).toBe(false);
    expect(isCreativeGiftingRequest(prompt)).toBe(false);
  });
});

describe('Scenario B — gifting ideation', () => {
  it('keeps useful gift ideas on the advisor lane without supplier listings', () => {
    const prompt = 'I want to give gifts to 5 employees. Suggest some useful ideas.';
    expect(publicResearchRequest(prompt)).toBeNull();
    expect(isGiftingAdvisorRequest(prompt)).toBe(true);
    expect(updateAdvisorBrief({}, { brief: {}, queries: [] }, prompt).recipients).toBe(5);
  });
});

describe('Scenario C — external product discovery', () => {
  it('classifies the staging external tech-gift prompt for listings with electronics focus', () => {
    const brief = publicResearchRequest(STAGING_EXTERNAL);
    expect(brief).toMatchObject({
      purpose: 'listings',
      region: 'India',
      count: 5,
      audience: 'employee gifting',
      source: 'external',
      category: 'Electronics & Gadgets',
      topic: 'electronics and gadgets',
      budget: { inr: 3000, exclusive: true },
    });
    expect(brief.productFocus).toEqual(expect.arrayContaining(['innovative tech gadgets', 'useful for remote employees']));
    expect(resolveCatalogTopic(STAGING_EXTERNAL)?.[2]).toBe('Electronics & Gadgets');
    expect(curatorSource(STAGING_EXTERNAL, null)).toBe('external');
  });
});

describe('Scenario D — ShelfMerch catalog', () => {
  it('routes backpack browse to catalog discovery intent', () => {
    const discovery = catalogDiscoveryIntent('Show backpacks from the ShelfMerch catalog.');
    expect(discovery).toBeTruthy();
    expect(publicResearchRequest('Show backpacks from the ShelfMerch catalog.')).toBeNull();
  });
});

describe('Scenario E — follow-up context', () => {
  it('remembers recipients when a budget follow-up arrives', () => {
    const prior = updateAdvisorBrief({}, { brief: { recipients: 10 }, queries: [] }, 'I need welcome gifts for 10 employees.');
    expect(prior.recipients).toBe(10);
    const next = updateAdvisorBrief(prior, { brief: { budgetPerRecipient: 2000, currency: 'INR' }, queries: [] }, 'My budget is INR 2,000 per employee');
    expect(next).toMatchObject({ recipients: 10, budgetPerRecipient: 2000, currency: 'INR' });
    expect(mergeBrief(prior, {}, 'My budget is INR 2,000 per employee').budgetPerRecipient).toBe(2000);
    expect(requestedAdvice('Show cheaper alternatives.', { count: 8 }).count).toBe(8);
  });
});

describe('Scenario F — web research', () => {
  it('routes official AWS update asks to trends/research without gifting listings', () => {
    const prompt = 'What are the latest AWS Lambda updates? Search official AWS sources.';
    const brief = publicResearchRequest(prompt);
    expect(brief).toBeTruthy();
    expect(brief.purpose).not.toBe('listings');
    expect(isGiftingAdvisorRequest(prompt)).toBe(false);
  });
});

describe('Scenario G — image discovery', () => {
  it('keeps illustrative OpenAI image search disabled by default and distinct from listings', () => {
    expect(openAiImageSearchEnabled()).toBe(false);
    const prompt = 'Show me examples of premium employee welcome kits with images.';
    expect(isGiftingAdvisorRequest(prompt) || isCreativeGiftingRequest(prompt)).toBe(true);
    expect(researchProductFocus(prompt)).toEqual(expect.arrayContaining(['welcome or onboarding use']));
  });
});

describe('Scenario H — authorized operations', () => {
  it('keeps kit send / store writes on the business/MCP confirmation path', () => {
    const prompt = 'Send a Diwali kit to the team';
    expect(isCopilotBusinessRequest(prompt)).toBe(true);
    expect(isGiftingAdvisorRequest(prompt)).toBe(false);
    expect(publicResearchRequest(prompt)).toBeNull();
  });
});