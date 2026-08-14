import { z } from 'zod';
import { MERGE_HRIS_INTEGRATIONS } from './merge.constants.js';

export const createLinkTokenBodySchema = z
  .object({
    integration: z.enum(MERGE_HRIS_INTEGRATIONS).optional(),
  })
  .strict();

export const exchangeTokenBodySchema = z
  .object({
    publicToken: z.string().trim().min(1, 'publicToken is required'),
    /** Optional when Merge Link used the full picker; required for single-provider cards. */
    integration: z.enum(MERGE_HRIS_INTEGRATIONS).optional(),
  })
  .strict();

export const connectionIdParamsSchema = z.object({
  connectionId: z.string().trim().min(1),
});
