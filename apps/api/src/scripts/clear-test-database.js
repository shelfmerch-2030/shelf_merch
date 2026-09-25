/**
 * Delete every document in the local/staging test database.
 *
 * Keeps collections and indexes. Never drops the database, collections, or indexes.
 * Refuses to run unless the connected database is exactly shelfmerch_test.
 *
 * Usage (from apps/api):
 *   node src/scripts/clear-test-database.js
 *
 * You must type the database name when prompted.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const ALLOWED_DB = 'shelfmerch_test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function databaseNameFromUri(uri) {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const slash = withoutProtocol.indexOf('/');
  if (slash === -1) return '';
  return withoutProtocol.slice(slash + 1).split('?')[0];
}

function redact(message) {
  return String(message).replace(/\/\/[^@\s/]+@/g, '//***@');
}

async function confirm(dbName) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (
      await rl.question(
        `Type "${dbName}" to delete every document. Collections and indexes are kept: `,
      )
    ).trim();
    return answer === dbName;
  } finally {
    rl.close();
  }
}

async function main() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGO_URL (or MONGODB_URI) in .env');
    process.exitCode = 1;
    return;
  }

  const uriDb = databaseNameFromUri(uri);
  console.log(`Database name from MONGO_URL: ${uriDb || '(none)'}`);
  if (uriDb !== ALLOWED_DB) {
    console.error(`Refusing to run. This script only clears "${ALLOWED_DB}".`);
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;
  const connectedName = mongoose.connection.name;
  console.log(`Connected database: ${connectedName}`);
  if (!db || connectedName !== ALLOWED_DB) {
    console.error(`Refusing to run. Connected database is "${connectedName}", expected "${ALLOWED_DB}".`);
    process.exitCode = 1;
    return;
  }

  const listed = await db.listCollections({}, { nameOnly: false }).toArray();
  const skipped = listed
    .filter((entry) => entry.type === 'view' || entry.name.startsWith('system.'))
    .map((entry) => entry.name)
    .sort();
  const names = listed
    .filter((entry) => entry.type !== 'view' && !entry.name.startsWith('system.'))
    .map((entry) => entry.name)
    .sort();

  console.log(`Collections before deletion (${names.length}):`);
  const indexesBefore = new Map();
  for (const name of names) {
    const count = await db.collection(name).countDocuments();
    const indexes = await db.collection(name).indexes();
    indexesBefore.set(name, indexes.map((index) => index.name).sort());
    console.log(`  ${name}: ${count} documents, ${indexes.length} indexes`);
  }
  if (!names.length) console.log('  (none)');
  if (skipped.length) {
    console.log(`Skipped (views and system collections, left untouched): ${skipped.join(', ')}`);
  }

  const confirmed = await confirm(connectedName);
  if (!confirmed) {
    console.log('Aborted. No documents were deleted.');
    process.exitCode = 1;
    return;
  }

  for (const name of names) {
    const result = await db.collection(name).deleteMany({});
    console.log(`deleteMany ${name}: deleted ${result.deletedCount}`);
  }

  const stillPresent = (await db.listCollections().toArray())
    .map((entry) => entry.name)
    .filter((name) => names.includes(name))
    .sort();

  console.log('Verification:');
  let remainingDocuments = 0;
  let indexMismatches = 0;
  let missingCollections = 0;
  for (const name of names) {
    if (!stillPresent.includes(name)) {
      missingCollections += 1;
      console.log(`  ${name}: MISSING (collection was dropped)`);
      continue;
    }
    const count = await db.collection(name).countDocuments();
    const indexes = (await db.collection(name).indexes()).map((index) => index.name).sort();
    const before = indexesBefore.get(name) ?? [];
    const indexesMatch = indexes.length === before.length && indexes.every((index, i) => index === before[i]);
    remainingDocuments += count;
    if (!indexesMatch) indexMismatches += 1;
    console.log(
      `  ${name}: ${count} documents, ${indexes.length} indexes${indexesMatch ? '' : ' (INDEX MISMATCH)'}`,
    );
  }

  if (missingCollections || indexMismatches || remainingDocuments !== 0) {
    console.error(
      `Verification failed. remaining=${remainingDocuments} missingCollections=${missingCollections} indexMismatches=${indexMismatches}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Every collection has 0 documents. ${names.length} collections and their indexes are still present.`);
}

main()
  .catch((error) => {
    console.error(redact(error instanceof Error ? error.stack || error.message : error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
