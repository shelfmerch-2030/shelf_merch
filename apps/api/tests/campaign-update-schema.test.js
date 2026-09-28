import { describe, expect, it } from 'vitest';
import { updateCampaignSchema } from '../src/modules/campaigns/campaigns.validation.js';

const SHOP_ID = '6ab9f1d5087bb917d3ff4498';
const ENTITY_ID = '6ab9f1d5087bb917d3ff4499';

describe('updateCampaignSchema', () => {
  it('does not clear shopId when a draft finish omits it', () => {
    const parsed = updateCampaignSchema.parse({
      entityId: ENTITY_ID,
      name: 'Gandhi Jyanti',
      pointsScope: 'shop',
      message: { from: 'SHIVA', body: 'GOOD' },
      schedule: { mode: 'now' },
    });

    expect(parsed).not.toHaveProperty('shopId');
    expect(parsed).not.toHaveProperty('kitId');
    expect(parsed).not.toHaveProperty('fulfillmentMode');
    expect(parsed).not.toHaveProperty('selectedProductIds');
    expect(parsed.name).toBe('Gandhi Jyanti');
  });

  it('keeps an explicit shopId', () => {
    const parsed = updateCampaignSchema.parse({
      entityId: ENTITY_ID,
      shopId: SHOP_ID,
      name: 'Gandhi Jyanti',
    });

    expect(parsed.shopId).toBe(SHOP_ID);
  });
});