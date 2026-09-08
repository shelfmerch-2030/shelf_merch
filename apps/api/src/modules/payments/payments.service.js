import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  getRazorpayClient,
  verifyPaymentSignature,
  verifyWebhookSignature as verifyRazorpayWebhookSignature,
} from '../../services/razorpay.service.js';
import { Payment } from './payment.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { transitionState } from '../../services/stateMachine.service.js';
import { notify } from '../notifications/notifications.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';

/** Razorpay receipt max length is 40. */
function razorpayReceipt(prefix, id) {
  const idPart = String(id).slice(-8);
  const ts = Date.now().toString(36);
  return `${prefix}_${idPart}_${ts}`.slice(0, 40);
}

function mapRazorpayError(err) {
  if (err instanceof ApiError) throw err;
  const description = err?.error?.description || err?.message || 'Razorpay request failed';
  const status = Number(err?.statusCode) || 502;
  throw new ApiError(
    status >= 400 && status < 600 ? status : 502,
    description,
    err?.error?.code || 'RAZORPAY_ERROR',
  );
}

/** §7.11 — create Razorpay order for wallet online funding or campaign UPI/card spend. */
export async function createRazorpayOrder({
  tenantId,
  userId,
  walletId,
  amountInr,
  purpose = 'wallet_funding',
}) {
  if (amountInr < 1) throw new ApiError(422, 'Amount must be at least ₹1', 'INVALID_AMOUNT');

  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const isCampaignSpend = purpose === 'campaign_spend';
  if (!isCampaignSpend && wallet.fundingDocument.approvalStatus === 'pending') {
    throw new ApiError(
      422,
      'A funding request is already pending finance approval',
      'FUNDING_PENDING',
    );
  }

  const amountPaise = Math.round(amountInr * 100);
  const receipt = razorpayReceipt(isCampaignSpend ? 'c' : 'w', walletId);
  const relatedType = isCampaignSpend ? 'campaign_spend' : 'wallet_funding';

  const razorpay = getRazorpayClient();
  let order;
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        tenantId: String(tenantId),
        walletId: String(walletId),
        performedBy: String(userId),
        purpose: isCampaignSpend ? 'campaign_spend' : 'wallet_funding',
        walletName: wallet.name?.slice(0, 100) ?? '',
      },
    });
  } catch (err) {
    mapRazorpayError(err);
  }

  const payment = await Payment.create({
    tenantId,
    relatedType,
    relatedId: wallet._id,
    userId,
    provider: 'razorpay',
    providerRefId: order.id,
    razorpayOrderId: order.id,
    amount: amountInr,
    currency: 'INR',
    status: 'pending',
  });

  return {
    orderId: order.id,
    amount: amountInr,
    amountPaise,
    currency: 'INR',
    keyId: env.RAZORPAY_KEY_ID,
    paymentId: String(payment._id),
    walletId: String(wallet._id),
  };
}

export function verifyCheckoutSignature(orderId, paymentId, signature) {
  verifyPaymentSignature(orderId, paymentId, signature);
}

/**
 * Frontend checkout success → verify HMAC.
 * Wallet funding queues finance approval; campaign spend marks payment captured for launch.
 */
export async function verifyWalletPayment({
  tenantId,
  userId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

  const pendingOrDone = await Payment.findOne({
    tenantId,
    provider: 'razorpay',
    $or: [
      { razorpayOrderId },
      { providerRefId: razorpayOrderId },
      { razorpayPaymentId },
      { providerRefId: razorpayPaymentId },
    ],
  }).setOptions({ skipTenantGuard: true });

  if (pendingOrDone?.relatedType === 'campaign_spend') {
    return settleCampaignSpendPayment({
      payment: pendingOrDone,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
  }

  const payment = await findWalletFundingPayment(tenantId, razorpayOrderId, razorpayPaymentId);
  if (!payment) throw new NotFoundError('Payment not found');

  if (payment.status === 'succeeded') {
    const wallet = await Wallet.findOne({ _id: payment.relatedId, tenantId }).lean();
    const pendingApproval = wallet?.fundingDocument?.approvalStatus === 'pending';
    return {
      verified: true,
      idempotent: true,
      paymentId: String(payment._id),
      walletId: String(payment.relatedId),
      amount: payment.amount,
      status: pendingApproval ? 'pending_approval' : 'succeeded',
      pendingApproval,
    };
  }

  if (payment.status === 'failed') {
    throw new ApiError(422, 'Payment previously marked as failed', 'PAYMENT_FAILED');
  }

  const razorpay = getRazorpayClient();
  const rzPayment = await razorpay.payments.fetch(razorpayPaymentId);
  if (rzPayment.status !== 'captured' && rzPayment.status !== 'authorized') {
    throw new ApiError(422, 'Payment was not captured', 'PAYMENT_NOT_CAPTURED');
  }
  if (rzPayment.order_id !== razorpayOrderId) {
    throw new ApiError(422, 'Payment order mismatch', 'PAYMENT_ORDER_MISMATCH');
  }
  const expectedPaise = Math.round(payment.amount * 100);
  if (rzPayment.amount !== expectedPaise) {
    throw new ApiError(422, 'Payment amount does not match order', 'PAYMENT_AMOUNT_MISMATCH');
  }

  const result = await settleWalletFundingPayment({
    payment,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    amountInr: rzPayment.amount / 100,
    performedBy: userId ?? payment.userId,
    rawEvent: null,
  });

  return {
    verified: true,
    paymentId: result.paymentId,
    walletId: String(payment.relatedId),
    amount: payment.amount,
    status: 'pending_approval',
    pendingApproval: true,
  };
}

/** Mark a campaign UPI/card payment as succeeded (no wallet credit). */
async function settleCampaignSpendPayment({
  payment,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  if (payment.status === 'succeeded') {
    return {
      verified: true,
      idempotent: true,
      paymentId: String(payment._id),
      walletId: String(payment.relatedId),
      amount: payment.amount,
      status: 'succeeded',
      pendingApproval: false,
      purpose: 'campaign_spend',
    };
  }
  if (payment.status === 'failed') {
    throw new ApiError(422, 'Payment previously marked as failed', 'PAYMENT_FAILED');
  }

  const razorpay = getRazorpayClient();
  const rzPayment = await razorpay.payments.fetch(razorpayPaymentId);
  if (rzPayment.status !== 'captured' && rzPayment.status !== 'authorized') {
    throw new ApiError(422, 'Payment was not captured', 'PAYMENT_NOT_CAPTURED');
  }
  if (rzPayment.order_id !== razorpayOrderId) {
    throw new ApiError(422, 'Payment order mismatch', 'PAYMENT_ORDER_MISMATCH');
  }
  const expectedPaise = Math.round(payment.amount * 100);
  if (rzPayment.amount !== expectedPaise) {
    throw new ApiError(422, 'Payment amount does not match order', 'PAYMENT_AMOUNT_MISMATCH');
  }

  payment.providerRefId = razorpayPaymentId;
  payment.razorpayOrderId = razorpayOrderId;
  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = razorpaySignature;
  payment.status = 'succeeded';
  await payment.save();

  return {
    verified: true,
    paymentId: String(payment._id),
    walletId: String(payment.relatedId),
    amount: payment.amount,
    status: 'succeeded',
    pendingApproval: false,
    purpose: 'campaign_spend',
  };
}

/**
 * Confirm a captured campaign_spend payment covers `expectedAmountInr` and has not been used.
 * Returns the payment document for launch to attach to the campaign.
 */
export async function assertCampaignSpendPayment({
  tenantId,
  expectedAmountInr,
  razorpayOrderId,
  razorpayPaymentId,
  campaignId,
}) {
  if (!razorpayOrderId || !razorpayPaymentId) {
    throw new ApiError(422, 'Razorpay payment is required for UPI / card checkout', 'PAYMENT_REQUIRED');
  }

  const payment = await Payment.findOne({
    tenantId,
    relatedType: 'campaign_spend',
    status: 'succeeded',
    $or: [
      { razorpayPaymentId },
      { providerRefId: razorpayPaymentId },
      { razorpayOrderId },
      { providerRefId: razorpayOrderId },
    ],
  }).setOptions({ skipTenantGuard: true });

  if (!payment) {
    throw new ApiError(422, 'Razorpay payment not found or not verified', 'PAYMENT_NOT_FOUND');
  }
  if (payment.razorpayPaymentId && payment.razorpayPaymentId !== razorpayPaymentId) {
    throw new ApiError(422, 'Payment id mismatch', 'PAYMENT_MISMATCH');
  }
  if (Math.abs(payment.amount - expectedAmountInr) > 0.01) {
    throw new ApiError(422, 'Payment amount does not match order total', 'PAYMENT_AMOUNT_MISMATCH');
  }

  const Campaign = (await import('../campaigns/campaign.model.js')).Campaign;
  const reused = await Campaign.findOne({
    tenantId,
    razorpayPaymentId,
    ...(campaignId ? { _id: { $ne: campaignId } } : {}),
    status: { $in: ['launched', 'redemption_open', 'redemption_closed', 'fulfilled'] },
  }).lean();
  if (reused) {
    throw new ApiError(422, 'This payment was already used for another campaign', 'PAYMENT_ALREADY_USED');
  }

  return payment;
}

/** Razorpay order for redemption checkout (points + UPI top-up). */
export async function createCampaignCheckoutOrder({ tenantId, recipientId, amountInr }) {
  if (amountInr < 1) throw new ApiError(422, 'Amount must be at least ₹1', 'INVALID_AMOUNT');

  const amountPaise = Math.round(amountInr * 100);
  const receipt = razorpayReceipt('r', recipientId);

  const razorpay = getRazorpayClient();
  let order;
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        tenantId: String(tenantId),
        recipientId: String(recipientId),
        purpose: 'redemption_checkout',
      },
    });
  } catch (err) {
    mapRazorpayError(err);
  }

  const payment = await Payment.create({
    tenantId,
    relatedType: 'campaign_checkout',
    relatedId: recipientId,
    provider: 'razorpay',
    providerRefId: order.id,
    razorpayOrderId: order.id,
    amount: amountInr,
    currency: 'INR',
    status: 'pending',
  });

  return {
    orderId: order.id,
    amount: amountInr,
    amountPaise,
    currency: 'INR',
    keyId: env.RAZORPAY_KEY_ID,
    paymentId: String(payment._id),
  };
}

/** Verify a captured Razorpay payment for redemption checkout. */
export async function verifyCampaignCheckoutPayment({
  tenantId,
  recipientId,
  expectedAmountInr,
  razorpayPayment,
}) {
  const { orderId, paymentId, signature } = razorpayPayment;
  verifyPaymentSignature(orderId, paymentId, signature);

  const payment = await Payment.findOne({
    tenantId,
    relatedType: 'campaign_checkout',
    relatedId: recipientId,
    $or: [{ razorpayOrderId: orderId }, { providerRefId: orderId }],
    status: 'pending',
  }).setOptions({ skipTenantGuard: true });

  if (!payment) throw new NotFoundError('Payment not found');
  if (Math.abs(payment.amount - expectedAmountInr) > 0.01) {
    throw new ApiError(422, 'Payment amount does not match order balance', 'PAYMENT_AMOUNT_MISMATCH');
  }

  const razorpay = getRazorpayClient();
  const rzPayment = await razorpay.payments.fetch(paymentId);
  if (rzPayment.status !== 'captured') {
    throw new ApiError(422, 'Payment was not captured', 'PAYMENT_NOT_CAPTURED');
  }
  if (rzPayment.order_id !== orderId) {
    throw new ApiError(422, 'Payment order mismatch', 'PAYMENT_ORDER_MISMATCH');
  }
  if (rzPayment.amount !== Math.round(expectedAmountInr * 100)) {
    throw new ApiError(422, 'Payment amount does not match order balance', 'PAYMENT_AMOUNT_MISMATCH');
  }

  payment.providerRefId = paymentId;
  payment.razorpayPaymentId = paymentId;
  payment.razorpaySignature = signature;
  payment.status = 'succeeded';
  await payment.save();
  return payment;
}

export function verifyWebhookSignature(rawBody, signature) {
  verifyRazorpayWebhookSignature(rawBody, signature);
}

/**
 * §9.3 — trust webhook only. Idempotent: replayed payment_id returns existing result.
 */
export async function handleRazorpayWebhook(rawBody, signature) {
  verifyRazorpayWebhookSignature(rawBody, signature);
  const event = JSON.parse(rawBody.toString());
  const eventType = event.event;

  if (eventType === 'payment.captured') {
    return processPaymentCaptured(event.payload.payment.entity, event);
  }
  if (eventType === 'payment.failed') {
    return processPaymentFailed(event.payload.payment.entity, event);
  }

  logger.info({ eventType }, 'Razorpay webhook ignored');
  return { handled: false, event: eventType };
}

async function findWalletFundingPayment(tenantId, orderId, paymentId) {
  const query = {
    relatedType: 'wallet_funding',
    provider: 'razorpay',
    $or: [
      { razorpayOrderId: orderId },
      { providerRefId: orderId },
      ...(paymentId ? [{ razorpayPaymentId: paymentId }, { providerRefId: paymentId }] : []),
    ],
  };
  if (tenantId) query.tenantId = tenantId;

  return Payment.findOne(query).setOptions({ skipTenantGuard: true });
}

/**
 * Shared settle path for verify + webhook — record payment, queue finance approval.
 * Wallet balance is credited only when platform finance approves (same as PO flow).
 */
async function settleWalletFundingPayment({
  payment,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  amountInr,
  performedBy,
  rawEvent,
}) {
  // Re-read to win races between verify and webhook.
  const fresh = await Payment.findById(payment._id).setOptions({ skipTenantGuard: true });
  if (!fresh) return { handled: false, reason: 'payment_not_found' };
  if (fresh.status === 'succeeded') {
    return { handled: true, idempotent: true, paymentId: String(fresh._id) };
  }

  fresh.providerRefId = razorpayPaymentId;
  fresh.razorpayOrderId = razorpayOrderId || fresh.razorpayOrderId;
  fresh.razorpayPaymentId = razorpayPaymentId;
  if (razorpaySignature) fresh.razorpaySignature = razorpaySignature;
  fresh.status = 'succeeded';
  if (rawEvent) fresh.rawWebhookPayload = rawEvent;
  if (amountInr != null) fresh.amount = amountInr;
  await fresh.save();

  const tenantId = fresh.tenantId;
  const walletId = fresh.relatedId;

  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) {
    logger.warn({ walletId, paymentId: razorpayPaymentId }, 'Wallet not found for Razorpay settlement');
    return { handled: false, reason: 'wallet_not_found' };
  }

  if (wallet.fundingDocument.approvalStatus === 'pending') {
    return { handled: true, idempotent: true, paymentId: String(fresh._id) };
  }

  wallet.fundingMethod = 'online';
  wallet.fundingDocument.approvalStatus = 'pending';
  wallet.fundingDocument.requestedAmount = fresh.amount;
  wallet.fundingDocument.docType = 'Online Payment';
  wallet.fundingDocument.docNumber = razorpayPaymentId;

  if (wallet.status === 'draft') {
    transitionState('wallet', wallet, 'wallet_created', { userId: performedBy ?? wallet.ownerUserId });
  }
  await wallet.save();

  if (wallet.ownerUserId) {
    await notify({
      type: 'wallet_funding_pending',
      tenantId,
      userId: wallet.ownerUserId,
      title: 'Payment received — pending approval',
      body: `Your payment of ₹${fresh.amount.toLocaleString('en-IN')} for ${wallet.name} is awaiting finance review.`,
      link: `/app/wallets?wallet=${wallet._id}`,
    });
  }

  return { handled: true, paymentId: String(fresh._id), pendingApproval: true };
}

async function processPaymentCaptured(entity, rawEvent) {
  const orderId = entity.order_id;
  const paymentId = entity.id;

  let payment = await Payment.findOne({
    provider: 'razorpay',
    relatedType: 'wallet_funding',
    $or: [{ razorpayOrderId: orderId }, { providerRefId: orderId }],
  }).setOptions({ skipTenantGuard: true });

  if (!payment) {
    payment = await Payment.findOne({
      provider: 'razorpay',
      relatedType: 'wallet_funding',
      $or: [{ razorpayPaymentId: paymentId }, { providerRefId: paymentId }],
    }).setOptions({ skipTenantGuard: true });
  }

  if (!payment) {
    // Campaign checkout / spend payments are settled via frontend verify, not wallet credit.
    const other = await Payment.findOne({
      provider: 'razorpay',
      $or: [{ razorpayOrderId: orderId }, { providerRefId: orderId }, { providerRefId: paymentId }],
    }).setOptions({ skipTenantGuard: true });
    if (other?.relatedType === 'campaign_checkout' || other?.relatedType === 'campaign_spend') {
      if (other.status !== 'succeeded') {
        other.providerRefId = paymentId;
        other.razorpayPaymentId = paymentId;
        other.status = 'succeeded';
        other.rawWebhookPayload = rawEvent;
        await other.save();
      }
      return { handled: true, relatedType: other.relatedType, paymentId: String(other._id) };
    }
    logger.warn({ orderId, paymentId }, 'Payment record not found for webhook');
    return { handled: false, reason: 'payment_not_found' };
  }

  if (payment.status === 'succeeded') {
    return { handled: true, idempotent: true, paymentId: String(payment._id) };
  }

  const notes = entity.notes ?? {};
  return settleWalletFundingPayment({
    payment,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: '',
    amountInr: entity.amount / 100,
    performedBy: notes.performedBy ?? payment.userId ?? null,
    rawEvent,
  });
}

async function processPaymentFailed(entity, rawEvent) {
  const orderId = entity.order_id;
  const payment = await Payment.findOne({
    provider: 'razorpay',
    $or: [{ razorpayOrderId: orderId }, { providerRefId: orderId }],
  }).setOptions({ skipTenantGuard: true });
  if (!payment) return { handled: false, reason: 'payment_not_found' };

  if (payment.status === 'succeeded') {
    return { handled: true, idempotent: true, status: 'succeeded' };
  }

  payment.status = 'failed';
  payment.rawWebhookPayload = rawEvent;
  await payment.save();

  if (payment.relatedType !== 'wallet_funding') {
    return { handled: true, status: 'failed' };
  }

  const wallet = await Wallet.findOne({ _id: payment.relatedId, tenantId: payment.tenantId });
  if (wallet?.ownerUserId) {
    await notify({
      type: 'payment_failed',
      tenantId: payment.tenantId,
      userId: wallet.ownerUserId,
      title: 'Wallet payment failed',
      body: `Your payment of ₹${payment.amount} could not be processed. Please try again.`,
      link: `/app/wallets?wallet=${wallet._id}`,
    });
  }

  return { handled: true, status: 'failed' };
}
