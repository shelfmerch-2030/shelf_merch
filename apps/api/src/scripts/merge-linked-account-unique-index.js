/**
 * Linked-account uniqueness rollout. This file does not run on startup.
 *
 * 1. Read-only duplicate audit (no writes):
 *    node src/scripts/merge-linked-account-unique-index.js --audit
 * 2. Resolve any reported rows manually.
 * 3. Create the partial unique index only after the audit is clean:
 *    node src/scripts/merge-linked-account-unique-index.js --apply
 *
 * --audit prints connection id, tenant id, provider, and status.
 * It does not print tokens or employee data.
 * --apply refuses to create the index while duplicates exist.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';

const INDEX = {
  key: { mergeLinkedAccountId: 1 },
  options: {
    name: 'mergeLinkedAccountId_unique_nonempty',
    unique: true,
    partialFilterExpression: { mergeLinkedAccountId: { $gt: '' } },
  },
};

const audit = process.argv.includes('--audit');
const apply = process.argv.includes('--apply');

if (!audit && !apply) {
  console.log('Not applied. Run --audit first, then --apply after duplicates are resolved.');
  console.log(JSON.stringify(INDEX));
  process.exit(0);
}

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
const collection = mongoose.connection.collection('mergeconnections');
const duplicates = await collection
  .aggregate([
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
  ])
  .toArray();

if (audit) {
  console.log(JSON.stringify({ duplicates }, null, 2));
  await mongoose.disconnect();
  process.exit(duplicates.length ? 1 : 0);
}

if (duplicates.length) {
  console.log(JSON.stringify({ duplicates, indexCreated: false }));
  await mongoose.disconnect();
  process.exit(1);
}

await collection.createIndex(INDEX.key, INDEX.options);
console.log('Index created', INDEX.options.name);
await mongoose.disconnect();
