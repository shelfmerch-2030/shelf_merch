/**
 * Copy catalogproducts from staging (shelfmerch_test) to production (shelfmerch).
 *
 * Staging is read-only. This script never drops a collection, never deletes
 * documents, and never writes to the staging database. The only write is
 * replaceOne upserts into shelfmerch.catalogproducts, and only after
 * --confirm-staging-to-production.
 *
 * Usage (from the repo root):
 *   node apps/api/src/scripts/migrateStagingToProductionCatalogProducts.js --dry-run
 *   node apps/api/src/scripts/migrateStagingToProductionCatalogProducts.js --confirm-staging-to-production
 *
 * Connection: MONGO_URL, or MONGODB_URI when MONGO_URL is unset.
 * The database name in that URI is not used as the write target. The script
 * always reads shelfmerch_test and writes shelfmerch on that same cluster.
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DB = 'shelfmerch_test';
const TARGET_DB = 'shelfmerch';
const COLLECTION = 'catalogproducts';
const BATCH_SIZE = 25;
const CONFIRM_FLAG = '--confirm-staging-to-production';
const DRY_RUN_FLAG = '--dry-run';

const WRITE_COMMANDS = new Set([
  'insert',
  'update',
  'delete',
  'findAndModify',
  'bulkWrite',
  'drop',
  'dropDatabase',
  'create',
  'createIndexes',
  'dropIndexes',
  'collMod',
  'renameCollection',
  'compact',
  'reIndex',
  'mapReduce',
]);

const DESTRUCTIVE_COMMANDS = new Set([
  'delete',
  'findAndModify',
  'drop',
  'dropDatabase',
  'dropIndexes',
  'collMod',
  'renameCollection',
  'compact',
  'reIndex',
  'mapReduce',
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function redact(value) {
  return String(value)
    .replace(/mongodb(\+srv)?:\/\/[^\s'")]+/gi, 'mongodb://[redacted]')
    .replace(/\/\/[^@\s/]+@/g, '//[redacted]@');
}

function formatError(error) {
  const name = error?.name || 'Error';
  const code = error?.code != null ? ` code=${error.code}` : '';
  const message = redact(error?.message || error);
  const clipped = message.length > 500 ? `${message.slice(0, 500)}…` : message;
  return `${name}${code}: ${clipped}`;
}

function connectionUri() {
  if (process.env.MONGO_URL) return { uri: process.env.MONGO_URL, source: 'MONGO_URL' };
  if (process.env.MONGODB_URI) return { uri: process.env.MONGODB_URI, source: 'MONGODB_URI' };
  return { uri: '', source: '' };
}

function databaseNameFromUri(uri) {
  const match = String(uri).match(/^(mongodb(?:\+srv)?:\/\/)([\s\S]+)$/i);
  if (!match) return '';
  const rest = match[2];
  const at = rest.lastIndexOf('@');
  const afterAuth = at === -1 ? rest : rest.slice(at + 1);
  const queryAt = afterAuth.indexOf('?');
  const slashAt = afterAuth.indexOf('/');
  if (slashAt === -1 || (queryAt !== -1 && queryAt < slashAt)) return '';
  const end = queryAt === -1 ? afterAuth.length : queryAt;
  return afterAuth.slice(slashAt + 1, end);
}

function replaceDatabaseName(uri, databaseName) {
  const match = String(uri).match(/^(mongodb(?:\+srv)?:\/\/)([\s\S]+)$/i);
  if (!match) throw new Error('MongoDB URI must start with mongodb:// or mongodb+srv://');
  const rest = match[2];
  const at = rest.lastIndexOf('@');
  const prefix = match[1] + (at === -1 ? '' : rest.slice(0, at + 1));
  const afterAuth = at === -1 ? rest : rest.slice(at + 1);
  const queryAt = afterAuth.indexOf('?');
  const slashAt = afterAuth.indexOf('/');
  const hasPath = slashAt !== -1 && (queryAt === -1 || slashAt < queryAt);
  const host = hasPath ? afterAuth.slice(0, slashAt) : afterAuth.slice(0, queryAt === -1 ? afterAuth.length : queryAt);
  const query = queryAt === -1 ? '' : afterAuth.slice(queryAt);
  if (!host) throw new Error('MongoDB URI is missing a host');
  return `${prefix}${host}/${databaseName}${query}`;
}

function clusterHost(uri) {
  const match = String(uri).match(/^(mongodb(?:\+srv)?:\/\/)([\s\S]+)$/i);
  if (!match) return '';
  const rest = match[2];
  const at = rest.lastIndexOf('@');
  const afterAuth = at === -1 ? rest : rest.slice(at + 1);
  const queryAt = afterAuth.indexOf('?');
  const slashAt = afterAuth.indexOf('/');
  const cuts = [queryAt, slashAt].filter((index) => index >= 0);
  const end = cuts.length ? Math.min(...cuts) : afterAuth.length;
  return afterAuth.slice(0, end);
}

function idKey(id) {
  if (id && typeof id.toHexString === 'function') return id.toHexString();
  return String(id);
}

function commandCollections(event) {
  const command = event.command || {};
  const direct = command[event.commandName];
  if (typeof direct === 'string' && direct) return [direct];
  if (Array.isArray(command.nsInfo)) {
    return command.nsInfo
      .map((info) => String(info.ns || '').split('.').slice(1).join('.'))
      .filter(Boolean);
  }
  return [];
}

function attachStagingWriteGuard(client) {
  client.on('commandStarted', (event) => {
    if (!WRITE_COMMANDS.has(event.commandName)) return;
    console.error(
      `Blocked ${event.commandName} on the staging connection (database ${event.databaseName}).`,
    );
    process.exit(1);
  });
}

function attachProductionWriteScope(client) {
  client.on('commandStarted', (event) => {
    if (!WRITE_COMMANDS.has(event.commandName)) return;
    if (event.databaseName !== TARGET_DB) {
      console.error(
        `Blocked ${event.commandName} on database ${event.databaseName}. Writes are limited to ${TARGET_DB}.${COLLECTION}.`,
      );
      process.exit(1);
    }
    if (DESTRUCTIVE_COMMANDS.has(event.commandName)) {
      console.error(`Blocked ${event.commandName}. This script never deletes or drops.`);
      process.exit(1);
    }
    const names = commandCollections(event);
    if (!names.length || names.some((name) => name !== COLLECTION)) {
      console.error(`Blocked ${event.commandName} outside ${TARGET_DB}.${COLLECTION}.`);
      process.exit(1);
    }
  });
}

function readOnlyStagingCatalog(client) {
  const db = client.db(SOURCE_DB);
  if (db.databaseName !== SOURCE_DB) {
    throw new Error(`Refusing to read database "${db.databaseName}". Expected "${SOURCE_DB}".`);
  }
  const collection = db.collection(COLLECTION);
  if (collection.collectionName !== COLLECTION || collection.dbName !== SOURCE_DB) {
    throw new Error('Refusing to read a collection other than shelfmerch_test.catalogproducts.');
  }
  return {
    databaseName: db.databaseName,
    countDocuments(filter = {}) {
      return collection.countDocuments(filter, { maxTimeMS: 30_000 });
    },
    find(filter = {}, options = {}) {
      return collection.find(filter, options);
    },
  };
}

function writableProductionCatalog(client) {
  const db = client.db(TARGET_DB);
  if (db.databaseName !== TARGET_DB) {
    throw new Error(`Refusing to write. Target database is "${db.databaseName}", expected "${TARGET_DB}".`);
  }
  if (db.databaseName === SOURCE_DB) {
    throw new Error('Refusing to write. Target database resolved to staging.');
  }
  const collection = db.collection(COLLECTION);
  return {
    databaseName: db.databaseName,
    countDocuments(filter = {}) {
      return collection.countDocuments(filter, { maxTimeMS: 30_000 });
    },
    find(filter = {}, options = {}) {
      return collection.find(filter, options);
    },
    bulkWrite(ops) {
      if (collection.dbName !== TARGET_DB || collection.collectionName !== COLLECTION) {
        throw new Error('Refusing to write outside shelfmerch.catalogproducts.');
      }
      return collection.bulkWrite(ops, { ordered: true });
    },
  };
}

async function collectIds(source) {
  const ids = [];
  const cursor = source.find({}, { projection: { _id: 1 }, batchSize: 200 });
  for await (const doc of cursor) {
    if (doc?._id == null) {
      throw new Error('Encountered a catalog product without _id. Stopping.');
    }
    ids.push(doc._id);
  }
  return ids;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const unknown = args.filter((arg) => arg !== DRY_RUN_FLAG && arg !== CONFIRM_FLAG);
  if (unknown.length > 0) {
    throw new Error(`Unknown argument. Allowed flags: ${DRY_RUN_FLAG}, ${CONFIRM_FLAG}`);
  }
  return {
    dryRun: args.includes(DRY_RUN_FLAG),
    confirmed: args.includes(CONFIRM_FLAG),
  };
}

async function closeQuietly(client) {
  if (!client) return;
  try {
    await client.close();
  } catch (error) {
    console.error(`Failed to close a MongoDB connection: ${formatError(error)}`);
  }
}

async function main() {
  const { dryRun, confirmed } = parseArgs(process.argv);
  const { uri, source } = connectionUri();
  if (!uri) {
    throw new Error('Missing MONGO_URL (or MONGODB_URI). No connection was attempted.');
  }

  const stagingUri = replaceDatabaseName(uri, SOURCE_DB);
  const productionUri = replaceDatabaseName(uri, TARGET_DB);
  const sameCluster = clusterHost(stagingUri) === clusterHost(productionUri);
  const uriDatabase = databaseNameFromUri(uri) || '(none)';

  console.log('Staging to production catalog product migration');
  console.log(`Mode: ${dryRun ? 'dry-run' : confirmed ? 'copy' : 'blocked (confirmation missing)'}`);
  console.log(`Connection env: ${source}`);
  console.log(`Database name embedded in ${source}: ${uriDatabase}`);
  console.log(`Source: ${SOURCE_DB}.${COLLECTION} (read-only)`);
  console.log(`Target: ${TARGET_DB}.${COLLECTION}`);
  console.log(`Same cluster: ${sameCluster ? 'yes' : 'no'}`);
  if (dryRun && confirmed) {
    console.log(`Dry-run is set, so ${CONFIRM_FLAG} will not write.`);
  }

  if (!sameCluster) {
    throw new Error('Staging and production URIs resolved to different clusters. Stopping before any write.');
  }
  if (databaseNameFromUri(stagingUri) !== SOURCE_DB || databaseNameFromUri(productionUri) !== TARGET_DB) {
    throw new Error('Database name rewrite failed. Stopping before any connection write.');
  }

  const stagingClient = new MongoClient(stagingUri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    monitorCommands: true,
  });
  const productionClient = new MongoClient(productionUri, {
    serverSelectionTimeoutMS: 15_000,
    monitorCommands: true,
  });
  attachStagingWriteGuard(stagingClient);
  attachProductionWriteScope(productionClient);

  let staging;
  let production;
  try {
    await Promise.all([stagingClient.connect(), productionClient.connect()]);
    await stagingClient.db(SOURCE_DB).command({ ping: 1 });
    await productionClient.db(TARGET_DB).command({ ping: 1 });

    staging = readOnlyStagingCatalog(stagingClient);
    production = writableProductionCatalog(productionClient);

    const stagingCount = await staging.countDocuments();
    const productionCount = await production.countDocuments();
    console.log(`Staging catalogproducts count: ${stagingCount}`);
    console.log(`Production catalogproducts count: ${productionCount}`);

    if (stagingCount === 0) {
      throw new Error('Staging catalogproducts has 0 documents. Refusing to insert anything.');
    }

    const stagingIds = await collectIds(staging);
    const productionIds = await collectIds(production);
    if (stagingIds.length !== stagingCount) {
      throw new Error(
        `Staging count ${stagingCount} does not match the _id scan (${stagingIds.length}). Stopping.`,
      );
    }
    if (productionIds.length !== productionCount) {
      throw new Error(
        `Production count ${productionCount} does not match the _id scan (${productionIds.length}). Stopping.`,
      );
    }

    const productionIdSet = new Set(productionIds.map(idKey));
    const stagingIdSet = new Set(stagingIds.map(idKey));
    let wouldInsert = 0;
    let wouldUpdate = 0;
    for (const id of stagingIds) {
      if (productionIdSet.has(idKey(id))) wouldUpdate += 1;
      else wouldInsert += 1;
    }
    const productionOnlyIds = productionIds.filter((id) => !stagingIdSet.has(idKey(id)));
    const productionOnly = productionOnlyIds.length;

    console.log(`Would insert: ${wouldInsert}`);
    console.log(`Would update: ${wouldUpdate}`);
    console.log(`Production-only documents left untouched: ${productionOnly}`);

    if (dryRun) {
      console.log('Dry run complete. No database changes were made.');
      return;
    }
    if (!confirmed) {
      console.error(`Refusing to write. Re-run with ${CONFIRM_FLAG} to copy staging catalog products into production.`);
      console.error('No database changes were made.');
      process.exitCode = 1;
      return;
    }

    console.log('Confirmation accepted. Copying catalogproducts into shelfmerch only.');
    let upsertedCount = 0;
    let matchedCount = 0;
    for (let offset = 0; offset < stagingIds.length; offset += BATCH_SIZE) {
      const chunkIds = stagingIds.slice(offset, offset + BATCH_SIZE);
      const docs = await staging.find({ _id: { $in: chunkIds } }).toArray();
      if (docs.length !== chunkIds.length) {
        throw new Error(
          `Staging read returned ${docs.length} of ${chunkIds.length} documents. Stopping. ` +
            'Already copied batches can be re-run safely.',
        );
      }
      const ops = docs.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      }));
      const result = await production.bulkWrite(ops);
      upsertedCount += result.upsertedCount;
      matchedCount += result.matchedCount;
      console.log(
        `Wrote batch ${Math.floor(offset / BATCH_SIZE) + 1}: ${docs.length} documents ` +
          `(inserted ${result.upsertedCount}, matched ${result.matchedCount})`,
      );
    }

    if (upsertedCount !== wouldInsert || matchedCount !== wouldUpdate) {
      throw new Error(
        `Write result did not match the plan (inserted ${upsertedCount}, expected ${wouldInsert}; ` +
          `matched ${matchedCount}, expected ${wouldUpdate}). Stopping.`,
      );
    }

    const stagingCountAfter = await staging.countDocuments();
    const productionCountAfter = await production.countDocuments();
    console.log(`Staging catalogproducts count after copy: ${stagingCountAfter}`);
    console.log(`Production catalogproducts count after copy: ${productionCountAfter}`);

    if (stagingCountAfter !== stagingCount) {
      throw new Error(
        `Staging count changed from ${stagingCount} to ${stagingCountAfter}. ` +
          'This script has no staging writes. Stopping for investigation.',
      );
    }
    if (productionCountAfter !== productionCount + wouldInsert) {
      throw new Error(
        `Production count is ${productionCountAfter}, expected ${productionCount + wouldInsert}. Stopping.`,
      );
    }

    const stagingIdsAfter = await collectIds(staging);
    const productionIdsAfter = await collectIds(production);
    const productionIdSetAfter = new Set(productionIdsAfter.map(idKey));
    const missing = stagingIdsAfter.filter((id) => !productionIdSetAfter.has(idKey(id)));
    if (missing.length > 0) {
      const sample = missing.slice(0, 10).map(idKey).join(', ');
      throw new Error(
        `${missing.length} staging _id values are missing from ${TARGET_DB}.${COLLECTION}. Example: ${sample}`,
      );
    }

    const removedProductionOnly = productionOnlyIds.filter((id) => !productionIdSetAfter.has(idKey(id)));
    if (removedProductionOnly.length > 0) {
      const sample = removedProductionOnly.slice(0, 10).map(idKey).join(', ');
      throw new Error(
        `${removedProductionOnly.length} production-only _id values are missing after the copy. Example: ${sample}`,
      );
    }

    console.log(`Verified ${stagingIdsAfter.length} staging _id values exist in production.`);
    console.log(`Verified ${productionOnly} production-only documents were not deleted.`);
    console.log('Migration finished. Staging was not modified.');
  } finally {
    await closeQuietly(stagingClient);
    await closeQuietly(productionClient);
  }
}

main().catch((error) => {
  console.error(`Migration failed. ${formatError(error)}`);
  console.error('Staging is never written by this script. A failed copy can be re-run; documents are matched by _id.');
  process.exitCode = 1;
});