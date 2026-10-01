import { z } from 'zod';
import { objectId } from '../users/users.validation.js';

export const createCampaignSchema = z.object({
  entityId: objectId,
  name: z.string().min(1),
  type: z.enum(['points', 'items', 'kit']),
  fulfillmentMode: z.enum(['redeem', 'surprise', 'single']).optional().default('redeem'),
  singleLocation: z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().default(''),
      line1: z.string().min(1),
      line2: z.string().optional().default(''),
      city: z.string().min(1),
      state: z.string().min(1),
      pincode: z.string().min(1),
      country: z.string().optional().default('IN'),
    })
    .optional(),
  catalogMode: z.enum(['full_store', 'selected_products']).optional().default('full_store'),
  selectedProductIds: z.array(objectId).optional().default([]),
  kitId: objectId.nullable().optional().default(null),
  shopId: objectId.nullable().optional().default(null),
  isSample: z.boolean().optional().default(false),
  brandingEnabled: z.boolean().optional().default(false),
  pointsScope: z.enum(['stadium', 'shop']).optional().default('shop'),
  message: z
    .object({
      from: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
  schedule: z
    .object({
      mode: z.enum(['now', 'scheduled', 'self']).optional(),
      sendAt: z.coerce.date().nullable().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

/** Drop `.default()` so a partial update does not invent values for omitted fields. */
function withoutDefault(field) {
  let current = field;
  while (current?.def?.type === 'default') current = current.def.innerType;
  return current;
}

// `.partial()` still applies create-schema defaults (shopId: null, kitId: null, …).
// Finishing a saved points draft PATCHes name/message only — those defaults were
// unlinking the campaign from its shop after the wallet was charged.
export const updateCampaignSchema = z.object(
  Object.fromEntries(
    Object.entries(createCampaignSchema.shape).map(([key, field]) => [
      key,
      withoutDefault(field).optional(),
    ]),
  ),
);

export const importRecipientsSchema = z.object({
  recipients: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional().default(''),
        contactId: objectId.optional(),
        creditAmount: z.number().positive().optional(),
        variants: z
          .record(
            z.object({
              size: z.string().optional(),
              color: z.string().optional(),
              /** Curated kit appearance variant image URL. */
              variantImage: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
  /** Checkout total in INR — required for kit/items wallet debit on launch. */
  totalBudget: z.number().positive().optional(),
  /** Packaging choice for kit sends — used to recompute server-side totals. */
  packaging: z.enum(['none', 'box', 'wrap']).optional(),
  /** Kit/items may pay via UPI/card when wallet cannot cover the order. */
  paymentMode: z.enum(['wallet', 'upi', 'card']).optional().default('wallet'),
  razorpay_order_id: z.string().min(1).optional(),
  razorpay_payment_id: z.string().min(1).optional(),
});

export const allocateCreditsSchema = z.object({
  /** Budget per recipient in INR — whole rupees only, minimum ₹250. */
  creditsPerRecipient: z
    .number()
    .int('Budget per recipient must be a whole number')
    .min(250, 'Minimum of ₹250 must be allocated'),
  /** Full checkout total in INR (incl. fees/tax). Falls back to credits × recipients. */
  totalBudget: z.number().positive().optional(),
  paymentMode: z.enum(['wallet', 'upi', 'card']).optional().default('wallet'),
  razorpay_order_id: z.string().min(1).optional(),
  razorpay_payment_id: z.string().min(1).optional(),
});

export const launchCampaignSchema = z
  .object({
    paymentMode: z.enum(['wallet', 'upi', 'card']).optional().default('wallet'),
    razorpay_order_id: z.string().min(1).optional(),
    razorpay_payment_id: z.string().min(1).optional(),
  })
  .default({});

export const campaignIdParams = z.object({ id: objectId });

export const savePointsDraftSchema = z.object({
  campaignId: objectId.optional(),
  entityId: objectId,
  shopId: objectId,
  name: z.string().min(1),
  pointsScope: z.enum(['stadium', 'shop']).optional().default('shop'),
  creditsPerRecipient: z.number().nonnegative().optional().default(0),
  message: z
    .object({
      from: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
  schedule: z
    .object({
      mode: z.enum(['now', 'scheduled', 'self']).optional(),
      sendAt: z.coerce.date().nullable().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  draftState: z
    .object({
      step: z.number().int().min(0).max(3).optional(),
      selectedWalletId: z.string().optional(),
      selRecips: z.array(z.string()).optional(),
      recips: z.number().nonnegative().optional(),
      pay: z.enum(['wallet', 'upi', 'card']).optional(),
      preview: z.enum(['landing', 'email']).optional(),
      when: z.enum(['now', 'scheduled', 'self']).optional(),
    })
    .optional(),
  recipients: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional().default(''),
        contactId: objectId.optional(),
      }),
    )
    .optional(),
});
