import { MergeConnection } from './mergeConnection.model.js';

/**
 * Read-only duplicate report for non-empty Merge linked-account ids.
 * Does not update or delete rows, and does not select tokens.
 */
export async function findDuplicateMergeLinkedAccounts() {
  const rows = await MergeConnection.aggregate([
    { $match: { mergeLinkedAccountId: { $gt: '' } } },
    {
      $group: {
        _id: '$mergeLinkedAccountId',
        count: { $sum: 1 },
        connections: {
          $push: {
            connectionId: { $toString: '$_id' },
            tenantId: { $toString: '$tenantId' },
            provider: '$provider',
            status: '$status',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
  return rows.map((row) => ({
    mergeLinkedAccountId: row._id,
    count: row.count,
    connections: row.connections,
  }));
}
