import { z } from 'zod';

// Additive transport fields. Optional for previously recorded MCP results.
export const pointsPresentationFields = {
  currency: z.literal('INR').optional(),
  currencyMode: z.enum(['points', 'inr']).optional(),
  pointsScope: z.enum(['shop', 'stadium']).optional(),
  shopName: z.string().optional(),
  campaignName: z.string().optional(),
  fundingSource: z.enum(['organization_unallocated', 'department_budget']).optional(),
  fundingName: z.string().optional(),
  departmentBudgetCharged: z.boolean().optional(),
};

export function pointsPresentation({ shop, pointsScope, funds, wallet, entity }) {
  return {
    currency: 'INR',
    ...(shop ? { currencyMode: shop.currencyMode, shopName: shop.name } : {}),
    pointsScope: pointsScope ?? 'shop',
    fundingSource: funds.department ? 'department_budget' : 'organization_unallocated',
    fundingName: funds.department ? entity?.name : wallet?.name,
    departmentBudgetCharged: funds.department,
  };
}
