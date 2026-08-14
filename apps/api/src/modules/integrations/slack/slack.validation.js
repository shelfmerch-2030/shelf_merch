import { z } from 'zod';

export const defaultChannelBodySchema = z.object({
  channelId: z.string().min(1).max(64),
});

export const testMessageBodySchema = z
  .object({
    channelId: z.string().min(1).max(64).optional(),
  })
  .default({});

export const notificationsBodySchema = z
  .object({
    walletApproved: z.boolean().optional(),
    budgetAssigned: z.boolean().optional(),
    lowBudget: z.boolean().optional(),
    pointsDistributed: z.boolean().optional(),
    kitsAssigned: z.boolean().optional(),
    orderDispatched: z.boolean().optional(),
    deliveryFailed: z.boolean().optional(),
    shopLaunched: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one notification preference is required',
  });
