/**
 * Copy platformkits from production (shelfmerch) to staging (shelfmerch_test).
 *
 * Production is read-only. This script never drops a collection, never deletes
 * documents, and never writes to the production database. Only the platformkits
 * collection is read or written.
 *
 * Usage (from the repo root):
 *   node apps/api/src/scripts/migratePlatformKits.js --dry-run
 *   node apps/api/src/scripts/migratePlatformKits.js --confirm-copy-production-platform-kits
 *
 * Connection: MONGO_URL, or MONGODB_URI when MONGO_URL is unset.
 * The database name in that URI is not used as the write target. The script
 * always reads shelfmerch and writes shelfmerch_test on that same cluster.
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DB = 'shelfmerch';
const TARGET_DB = 'shelfmerch_test';
const COLLECTION = 'platformkits';
const BATCH_SIZE = 25;
const CONFIRM_FLAG = '--confirm-copy-production-platform-kits';
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

function attachProductionWriteGuard(client) {
  client.on('commandStarted', (event) => {
    if (!WRITE_COMMANDS.has(event.commandName)) return;
    console.error(
      `Blocked ${event.commandName} on the production connection (database ${event.databaseName}).`,
    );
    process.exit(1);
  });
}

function readOnlyPlatformKits(client) {
  const db = client.db(SOURCE_DB);
  if (db.databaseName !== SOURCE_DB) {
    throw new Error(`Refusing to read database "${db.databaseName}". Expected "${SOURCE_DB}".`);
  }
  const collection = db.collection(COLLECTION);
  if (collection.collectionName !== COLLECTION || collection.dbName !== SOURCE_DB) {
    throw new Error('Refusing to read a collection other than shelfmerch.platformkits.');
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

function writableTargetPlatformKits(client) {
  const db = client.db(TARGET_DB);
  if (db.databaseName !== TARGET_DB) {
    throw new Error(`Refusing to write. Target database is "${db.databaseName}", expected "${TARGET_DB}".`);
  }
  if (db.databaseName === SOURCE_DB) {
    throw new Error('Refusing to write. Target database resolved to production.');
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
        throw new Error('Refusing to write outside shelfmerch_test.platformkits.');
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
      throw new Error('Encountered a platform kit without _id. Stopping.');
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

  const productionUri = replaceDatabaseName(uri, SOURCE_DB);
  const targetUri = replaceDatabaseName(uri, TARGET_DB);
  const sameCluster = clusterHost(productionUri) === clusterHost(targetUri);
  const uriDatabase = databaseNameFromUri(uri) || '(none)';

  console.log('Platform kits migration');
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
    throw new Error('Production and target URIs resolved to different clusters. Stopping before any write.');
  }
  if (databaseNameFromUri(productionUri) !== SOURCE_DB || databaseNameFromUri(targetUri) !== TARGET_DB) {
    throw new Error('Database name rewrite failed. Stopping before any connection write.');
  }

  const productionClient = new MongoClient(productionUri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    monitorCommands: true,
  });
  const targetClient = new MongoClient(targetUri, {
    serverSelectionTimeoutMS: 15_000,
  });
  attachProductionWriteGuard(productionClient);

  let production;
  let target;
  try {
    await Promise.all([productionClient.connect(), targetClient.connect()]);
    await productionClient.db(SOURCE_DB).command({ ping: 1 });
    await targetClient.db(TARGET_DB).command({ ping: 1 });

    production = readOnlyPlatformKits(productionClient);
    target = writableTargetPlatformKits(targetClient);

    const productionCount = await production.countDocuments();
    const targetCount = await target.countDocuments();
    console.log(`Production platformkits count: ${productionCount}`);
    console.log(`Target platformkits count: ${targetCount}`);

    if (productionCount === 0) {
      throw new Error('Production platformkits has 0 documents. Refusing to insert anything.');
    }

    const productionIds = await collectIds(production);
    const targetIds = await collectIds(target);
    if (productionIds.length !== productionCount) {
      throw new Error(
        `Production count ${productionCount} does not match the _id scan (${productionIds.length}). Stopping.`,
      );
    }
    if (targetIds.length !== targetCount) {
      throw new Error(
        `Target count ${targetCount} does not match the _id scan (${targetIds.length}). Stopping.`,
      );
    }

    const targetIdSet = new Set(targetIds.map(idKey));
    let wouldInsert = 0;
    let wouldUpdate = 0;
    for (const id of productionIds) {
      if (targetIdSet.has(idKey(id))) wouldUpdate += 1;
      else wouldInsert += 1;
    }
    const targetOnly = targetIds.length - wouldUpdate;

    console.log(`Would insert: ${wouldInsert}`);
    console.log(`Would update: ${wouldUpdate}`);
    console.log(`Target-only platformkits left untouched: ${targetOnly}`);

    if (dryRun) {
      console.log('Dry run complete. No database changes were made.');
      return;
    }
    if (!confirmed) {
      console.error(`Refusing to write. Re-run with ${CONFIRM_FLAG} to copy production platform kits.`);
      console.error('No database changes were made.');
      process.exitCode = 1;
      return;
    }

    console.log('Confirmation accepted. Copying platformkits into shelfmerch_test only.');
    let upsertedCount = 0;
    let matchedCount = 0;
    for (let offset = 0; offset < productionIds.length; offset += BATCH_SIZE) {
      const chunkIds = productionIds.slice(offset, offset + BATCH_SIZE);
      const docs = await production.find({ _id: { $in: chunkIds } }).toArray();
      if (docs.length !== chunkIds.length) {
        throw new Error(
          `Production read returned ${docs.length} of ${chunkIds.length} documents. Stopping. ` +
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
      const result = await target.bulkWrite(ops);
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

    const productionCountAfter = await production.countDocuments();
    const targetCountAfter = await target.countDocuments();
    console.log(`Production platformkits count after copy: ${productionCountAfter}`);
    console.log(`Target platformkits count after copy: ${targetCountAfter}`);

    if (productionCountAfter !== productionCount) {
      throw new Error(
        `Production count changed from ${productionCount} to ${productionCountAfter}. ` +
          'This script has no production writes. Stopping for investigation.',
      );
    }

    const productionIdsAfter = await collectIds(production);
    const targetIdsAfter = new Set((await collectIds(target)).map(idKey));
    const missing = productionIdsAfter.filter((id) => !targetIdsAfter.has(idKey(id)));
    if (missing.length > 0) {
      const sample = missing.slice(0, 10).map(idKey).join(', ');
      throw new Error(
        `${missing.length} production _id values are missing from ${TARGET_DB}.${COLLECTION}. Example: ${sample}`,
      );
    }

    console.log(`Verified ${productionIdsAfter.length} production _id values exist in the target.`);
    console.log('Migration finished. Production was not modified.');
  } finally {
    await closeQuietly(productionClient);
    await closeQuietly(targetClient);
  }
}

main().catch((error) => {
  console.error(`Migration failed. ${formatError(error)}`);
  console.error('Production is never written by this script. A failed copy can be re-run; documents are matched by _id.');
  process.exitCode = 1;
});
