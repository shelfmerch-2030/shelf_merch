import { ShopifyImportJob } from './shopifyImportJob.model.js';
import { importFromShopify } from './shopifyImport.service.js';
import { NotFoundError } from '../../utils/errors.js';

export function shopifyImportJobDto(job) {
  return {
    importJobId: String(job._id),
    status: job.status,
    domain: job.domain,
    total: job.total,
    imported: job.imported,
    updated: job.updated,
    skipped: job.skipped,
    failed: job.failed,
    products: job.products,
    kits: job.kits,
    items: job.items,
    error: job.error,
  };
}

export async function getShopifyImportStatus(jobId, kind) {
  const job = await ShopifyImportJob.findOne({ _id: jobId, kind }).lean();
  if (!job) throw new NotFoundError('Shopify import job not found');
  return shopifyImportJobDto(job);
}

/** Shared by BullMQ and the Redis-down in-process fallback. */
export async function runShopifyImportJob({ jobId, domain, accessToken, only }) {
  // Queue delivery and fallback may overlap if enqueue acknowledgement was lost.
  const job = await ShopifyImportJob.findOneAndUpdate(
    { _id: jobId, kind: only, status: 'queued' },
    { $set: { status: 'processing', error: '' } },
    { returnDocument: 'after' },
  );
  if (!job) {
    const existing = await ShopifyImportJob.findById(jobId).lean();
    if (!existing) throw new NotFoundError('Shopify import job not found');
    return shopifyImportJobDto(existing);
  }

  const redact = (value) => String(value || '').split(accessToken).join('[redacted]');
  let persistedItems = 0;
  async function saveProgress(summary, status = 'processing') {
    const { imported, updated, skipped, failed, total, products, kits } = summary;
    const newItems = summary.items.slice(persistedItems).map(({ title, status: itemStatus, reason, kind }) => ({
      title, status: itemStatus, kind, ...(reason ? { reason: redact(reason) } : {}),
    }));
    await ShopifyImportJob.updateOne(
      { _id: jobId },
      {
        $set: { imported, updated, skipped, failed, total, products, kits, status },
        ...(newItems.length ? { $push: { items: { $each: newItems } } } : {}),
      },
    );
    persistedItems = summary.items.length;
  }

  try {
    const summary = await importFromShopify({ domain, token: accessToken, only, onProgress: saveProgress });
    await saveProgress(summary, 'done');
  } catch (err) {
    // Keep the last successful snapshot and never persist credentials from errors.
    await ShopifyImportJob.updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: redact(err?.message || 'Shopify import failed') } },
    );
  }
  return getShopifyImportStatus(jobId, only);
}
