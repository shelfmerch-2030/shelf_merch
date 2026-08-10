import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.middleware.js';
import { idempotency } from '../../middleware/idempotency.middleware.js';
import {
  recipientTicketRateLimit,
  sendOtpRateLimit,
  verifyOtpRateLimit,
} from '../../middleware/rateLimit.middleware.js';
import { objectId } from '../users/users.validation.js';
import { ApiError } from '../../utils/errors.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { requireRedemptionSession } from '../../middleware/redemptionSession.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import * as redemptionsService from './redemptions.service.js';
import * as supportService from '../support/support.service.js';
import { recipientCreateTicketSchema } from '../support/support.validation.js';

async function attachRedemptionScope(req, _res, next) {
  const recipient = await Recipient.findOne({ redemptionToken: req.params.token }).setOptions({
    skipTenantGuard: true,
  });
  if (recipient) {
    req.tenantId = recipient.tenantId;
    req.user = { userId: String(recipient._id) };
  }
  next();
}

const router = Router();

const tokenParams = z.object({ token: z.string().min(16) });
const brandedListingProductId = z
  .string()
  .regex(/^(?:[a-f\d]{24}|[a-f\d]{24}:[a-f\d]{24})$/i, 'Invalid id');

router.get(
  '/:token',
  validate({ params: tokenParams }),
  asyncHandler(async (req, res) => {
    try {
      res.json(await redemptionsService.getRedemptionPortal(req.params.token));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_REDEEMED') {
        return res.status(409).json({
          error: { code: err.code, message: err.message },
          orderNumber: err.details?.orderNumber,
          trackUrl: err.details?.trackUrl,
        });
      }
      throw err;
    }
  }),
);

router.post(
  '/:token/send-otp',
  validate({
    params: tokenParams,
    body: z.object({ contact: z.string().min(3) }),
  }),
  sendOtpRateLimit,
  asyncHandler(async (req, res) => {
    res.json(await redemptionsService.sendOtp(req.params.token, req.body));
  }),
);

router.post(
  '/:token/verify-otp',
  validate({
    params: tokenParams,
    body: z.object({ code: z.string().length(6) }),
  }),
  verifyOtpRateLimit,
  asyncHandler(async (req, res) => {
    res.json(await redemptionsService.verifyOtp(req.params.token, req.body));
  }),
);

router.get(
  '/:token/catalog',
  validate({ params: tokenParams }),
  requireRedemptionSession,
  asyncHandler(async (req, res) => {
    res.json(await redemptionsService.getCatalog(req.params.token));
  }),
);

router.get(
  '/:token/kit',
  validate({ params: tokenParams }),
  requireRedemptionSession,
  asyncHandler(async (req, res) => {
    res.json(await redemptionsService.getKitContents(req.params.token));
  }),
);

router.post(
  '/:token/razorpay/order',
  validate({
    params: tokenParams,
    body: z.object({ amountInr: z.number().positive() }),
  }),
  requireRedemptionSession,
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await redemptionsService.createRedemptionRazorpayOrder(req.params.token, req.body),
    );
  }),
);

router.post(
  '/:token/submit',
  validate({ params: tokenParams }),
  requireRedemptionSession,
  attachRedemptionScope,
  idempotency({ required: true }),
  validate({
    params: tokenParams,
    body: z.object({
      items: z
        .array(
          z.object({
            productId: brandedListingProductId,
            variant: z.object({ size: z.string().optional(), color: z.string().optional() }).optional(),
            qty: z.number().int().positive(),
          }),
        )
        .min(0),
      /** Curated kit appearance variant image URL (from /kit variantImages). */
      kitVariantImage: z.string().min(1).optional(),
      shippingAddress: z.object({
        name: z.string().min(1),
        phone: z.string().min(1),
        line1: z.string().min(1),
        line2: z.string().optional().default(''),
        city: z.string().min(1),
        state: z.string().min(1),
        pincode: z.string().min(1),
        country: z.string().optional().default('IN'),
      }),
      paymentMode: z.enum(['points', 'points_upi', 'upi']).optional().default('points'),
      razorpayPayment: z
        .object({
          orderId: z.string().min(1),
          paymentId: z.string().min(1),
          signature: z.string().min(1),
        })
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await redemptionsService.submitRedemption(req.params.token, req.body));
  }),
);

router.get(
  '/:token/orders',
  validate({ params: tokenParams }),
  requireRedemptionSession,
  asyncHandler(async (req, res) => {
    res.json(await redemptionsService.listRedemptionOrders(req.params.token));
  }),
);

router.get(
  '/:token/track',
  validate({ params: tokenParams }),
  asyncHandler(async (req, res) => {
    res.json(await redemptionsService.trackRedemption(req.params.token));
  }),
);

// ── Employee support: recipients raise and track tickets from the store ──

router.get(
  '/:token/support-tickets',
  validate({ params: tokenParams }),
  requireRedemptionSession,
  asyncHandler(async (req, res) => {
    const recipient = req.redemptionRecipient;
    res.json(
      await supportService.listRecipientTickets({
        tenantId: recipient.tenantId,
        recipientId: recipient._id,
      }),
    );
  }),
);

router.post(
  '/:token/support-tickets',
  validate({ params: tokenParams, body: recipientCreateTicketSchema }),
  requireRedemptionSession,
  recipientTicketRateLimit,
  asyncHandler(async (req, res) => {
    const recipient = req.redemptionRecipient;
    const ticket = await supportService.createRecipientTicket({
      recipient,
      subject: req.body.subject,
      description: req.body.description,
      type: req.body.type,
    });
    writeAudit({
      req,
      action: 'support_ticket.create',
      entityType: 'SupportTicket',
      entityId: ticket._id,
      after: { subject: ticket.subject, status: ticket.status, source: 'recipient' },
    });
    res.status(201).json(ticket);
  }),
);

router.post(
  '/:token/support-tickets/:ticketId/messages',
  validate({
    params: z.object({ token: z.string().min(16), ticketId: objectId }),
    body: z.object({ body: z.string().min(1) }),
  }),
  requireRedemptionSession,
  asyncHandler(async (req, res) => {
    const recipient = req.redemptionRecipient;
    res.json(
      await supportService.addRecipientMessage({
        ticketId: req.params.ticketId,
        tenantId: recipient.tenantId,
        recipientId: recipient._id,
        authorName: recipient.name || '',
        body: req.body.body,
      }),
    );
  }),
);

router.post(
  '/:token/support-tickets/:ticketId/confirm',
  validate({ params: z.object({ token: z.string().min(16), ticketId: objectId }) }),
  requireRedemptionSession,
  asyncHandler(async (req, res) => {
    const recipient = req.redemptionRecipient;
    res.json(
      await supportService.confirmRecipientTicket({
        ticketId: req.params.ticketId,
        tenantId: recipient.tenantId,
        recipientId: recipient._id,
        authorName: recipient.name || '',
      }),
    );
  }),
);

export default router;
