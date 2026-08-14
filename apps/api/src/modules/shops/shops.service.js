import { Shop } from './shop.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { Order } from '../orders/order.model.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { ensureUniqueShopSlug, slugifyShopName } from '../../utils/shopSlug.js';
import { syncShopCatalogVisibility, syncActiveListingKeys } from './shopCatalogSync.js';
import { scheduleSlackBusinessNotification } from '../integrations/slack/slackNotify.service.js';
import { SLACK_EVENT_TYPES } from '../integrations/slack/slack.events.js';

async function backfillShopSlug(shop) {
  if (shop.slug?.trim()) return shop;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      shop.slug = await ensureUniqueShopSlug(Shop, shop.name, shop._id);
      await shop.save();
      return shop;
    } catch (err) {
      if (err?.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  return shop;
}

export async function listShops({ tenantId }) {
  const shops = await Shop.find({ tenantId }).sort({ createdAt: -1 });
  for (const shop of shops) {
    if (!shop.slug?.trim()) await backfillShopSlug(shop);
  }
  return Shop.find({ tenantId }).sort({ createdAt: -1 });
}

export async function getShop({ tenantId, shopId }) {
  const shop = await Shop.findOne({ _id: shopId, tenantId });
  if (!shop) throw new NotFoundError('Shop not found');
  return backfillShopSlug(shop);
}

export async function getShopBySlug(slug) {
  const shop = await Shop.findOne({ slug: slugifyShopName(slug), status: 'live' }).setOptions({
    skipTenantGuard: true,
  });
  if (!shop) throw new NotFoundError('Shop not found');
  return shop;
}

export async function createShop({ tenantId, data }) {
  const slug = await ensureUniqueShopSlug(Shop, data.slug || data.name);
  return Shop.create({ tenantId, ...data, slug });
}

export async function updateShop({ tenantId, shopId, patch }) {
  const shop = await getShop({ tenantId, shopId });
  const before = shop.toObject();
  const {
    status: _ignored,
    slug: slugPatch,
    currencyMode: _currencyIgnored,
    selectedCatalogProductIds,
    featuredCatalogProductIds,
    activeListingKeys,
    featuredListingKeys,
    ...rest
  } = patch; // publish endpoint owns status; currency is permanent
  Object.assign(shop, rest);
  if (slugPatch != null && String(slugPatch).trim()) {
    shop.slug = await ensureUniqueShopSlug(Shop, slugPatch, shop._id);
  } else if (!shop.slug?.trim()) {
    shop.slug = await ensureUniqueShopSlug(Shop, shop.name, shop._id);
  }
  let saved = false;
  if (activeListingKeys !== undefined) {
    await syncActiveListingKeys(shop, tenantId, activeListingKeys);
    saved = true;
  } else if (selectedCatalogProductIds !== undefined) {
    await syncShopCatalogVisibility(shop, tenantId, selectedCatalogProductIds);
    saved = true;
  }
  if (featuredListingKeys !== undefined) {
    if (!Array.isArray(shop.activeListingKeys)) shop.activeListingKeys = [];
    const active = new Set(shop.activeListingKeys.map(String));
    shop.featuredListingKeys = featuredListingKeys.filter((k) => active.has(String(k)));
    await shop.save();
    saved = true;
  } else if (featuredCatalogProductIds !== undefined) {
    shop.featuredCatalogProductIds = featuredCatalogProductIds;
    await shop.save();
    saved = true;
  }
  if (!saved) {
    await shop.save();
  }
  return { before, shop };
}

/** §7.6 — publish requires at least one category. */
export async function publishShop({ tenantId, shopId, actorUserId = null }) {
  const shop = await getShop({ tenantId, shopId });
  if (shop.status === 'live') {
    return shop;
  }
  if (!shop.categories.length) {
    throw new ApiError(422, 'Add at least one category before publishing', 'SHOP_NO_CATEGORIES');
  }
  shop.status = 'live';
  await shop.save();

  const productCount = Array.isArray(shop.activeListingKeys) && shop.activeListingKeys.length
    ? shop.activeListingKeys.length
    : Array.isArray(shop.selectedCatalogProductIds)
      ? shop.selectedCatalogProductIds.length
      : 0;

  scheduleSlackBusinessNotification({
    tenantId,
    type: SLACK_EVENT_TYPES.SHOP_LAUNCHED,
    eventKey: `SHOP_LAUNCHED:${shop._id}`,
    resourceType: 'Shop',
    resourceId: shop._id,
    actorUserId,
    payload: {
      shopName: shop.name,
      productCount,
    },
  });

  return shop;
}

export async function archiveShop({ tenantId, shopId }) {
  const shop = await getShop({ tenantId, shopId });
  await shop.softDelete();
  return shop;
}

/* ── Shop performance report (Reports tab) ─────────────────────────────── */

const LAUNCHED_STATUSES = ['launched', 'redemption_open', 'redemption_closed'];
const REPORT_WEEKS = 12;

/** UTC Monday 00:00 of the week containing `date`. */
function weekStartUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d;
}

const emptyReport = (shop) => ({
  shopId: String(shop._id),
  shopName: shop.name,
  generatedAt: new Date(),
  totals: {
    campaignsLaunched: 0,
    recipients: 0,
    pointsIssuedInr: 0,
    pointsRedeemedInr: 0,
    redemptionRate: 0,
    ordersCount: 0,
    orderValueInr: 0,
    avgOrderValueInr: 0,
  },
  funnel: [],
  weekly: [],
  topProducts: [],
});

/**
 * Aggregated performance for one shop: KPIs, redemption funnel, weekly order
 * volume and top products. Every $match carries tenantId explicitly because
 * `.aggregate` bypasses the tenantScope query guard.
 */
export async function shopReport({ tenantId, shopId }) {
  const shop = await getShop({ tenantId, shopId });
  const campaigns = await Campaign.find({ tenantId, shopId: shop._id })
    .select('_id status')
    .lean();
  const campaignIds = campaigns.map((c) => c._id);
  if (!campaignIds.length) return emptyReport(shop);

  const scopedTenantId = shop.tenantId; // ObjectId, not the request string
  const since = weekStartUtc(new Date());
  since.setUTCDate(since.getUTCDate() - 7 * (REPORT_WEEKS - 1));

  const [recipientRows, [orderTotals], dailyRows, productRows] = await Promise.all([
    Recipient.aggregate([
      { $match: { tenantId: scopedTenantId, campaignId: { $in: campaignIds } } },
      {
        $group: {
          _id: '$redemptionStatus',
          count: { $sum: 1 },
          pointsInr: { $sum: { $ifNull: ['$creditAmount', 0] } },
        },
      },
    ]),
    Order.aggregate([
      { $match: { tenantId: scopedTenantId, campaignId: { $in: campaignIds } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          valueInr: { $sum: { $ifNull: ['$amountBreakdown.total', 0] } },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          tenantId: scopedTenantId,
          campaignId: { $in: campaignIds },
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          valueInr: { $sum: { $ifNull: ['$amountBreakdown.total', 0] } },
        },
      },
    ]),
    Order.aggregate([
      { $match: { tenantId: scopedTenantId, campaignId: { $in: campaignIds } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $ifNull: ['$items.name', 'Unknown'] },
          qty: { $sum: { $ifNull: ['$items.qty', 1] } },
          valueInr: {
            $sum: {
              $multiply: [{ $ifNull: ['$items.unitPriceInr', 0] }, { $ifNull: ['$items.qty', 1] }],
            },
          },
        },
      },
      { $sort: { qty: -1, valueInr: -1 } },
      { $limit: 6 },
    ]),
  ]);

  // Stages are cumulative: a recipient sitting at "verified" has passed "opened".
  const byStatus = Object.fromEntries(recipientRows.map((r) => [r._id, r]));
  const stageCount = (...statuses) => statuses.reduce((n, s) => n + (byStatus[s]?.count ?? 0), 0);
  const stagePoints = (...statuses) =>
    statuses.reduce((n, s) => n + (byStatus[s]?.pointsInr ?? 0), 0);

  const invited = stageCount('invited', 'opened', 'verified', 'redeemed', 'order_created');
  const opened = stageCount('opened', 'verified', 'redeemed', 'order_created');
  const verified = stageCount('verified', 'redeemed', 'order_created');
  const redeemed = stageCount('redeemed', 'order_created');
  const pct = (n) => (invited > 0 ? Math.round((n / invited) * 100) : 0);

  // Continuous Monday-based weekly buckets so the chart has no gaps.
  const weekMap = new Map();
  for (let i = 0; i < REPORT_WEEKS; i += 1) {
    const start = new Date(since);
    start.setUTCDate(start.getUTCDate() + 7 * i);
    weekMap.set(start.toISOString().slice(0, 10), { orders: 0, valueInr: 0 });
  }
  for (const row of dailyRows) {
    const key = weekStartUtc(new Date(`${row._id}T00:00:00Z`)).toISOString().slice(0, 10);
    const bucket = weekMap.get(key);
    if (bucket) {
      bucket.orders += row.orders;
      bucket.valueInr += row.valueInr;
    }
  }

  const ordersCount = orderTotals?.count ?? 0;
  const orderValueInr = orderTotals?.valueInr ?? 0;

  return {
    shopId: String(shop._id),
    shopName: shop.name,
    generatedAt: new Date(),
    totals: {
      campaignsLaunched: campaigns.filter((c) => LAUNCHED_STATUSES.includes(c.status)).length,
      recipients: invited,
      pointsIssuedInr: stagePoints('invited', 'opened', 'verified', 'redeemed', 'order_created'),
      pointsRedeemedInr: stagePoints('redeemed', 'order_created'),
      redemptionRate: pct(redeemed),
      ordersCount,
      orderValueInr,
      avgOrderValueInr: ordersCount > 0 ? Math.round(orderValueInr / ordersCount) : 0,
    },
    funnel: [
      { stage: 'invited', label: 'Invited', count: invited, pct: pct(invited) },
      { stage: 'opened', label: 'Opened', count: opened, pct: pct(opened) },
      { stage: 'verified', label: 'Verified', count: verified, pct: pct(verified) },
      { stage: 'redeemed', label: 'Redeemed', count: redeemed, pct: pct(redeemed) },
    ],
    weekly: [...weekMap.entries()].map(([weekStart, v]) => ({ weekStart, ...v })),
    topProducts: productRows.map((r) => ({ name: r._id, qty: r.qty, valueInr: r.valueInr })),
  };
}
