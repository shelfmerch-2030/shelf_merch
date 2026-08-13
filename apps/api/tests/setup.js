import mongoose from 'mongoose';

/**
 * Tests NEVER use MONGO_URL / Atlas — always an isolated in-memory replica set
 * (required for ledger transaction tests). Override with MONGODB_TEST_URI only
 * in CI if you provision a dedicated test cluster.
 *
 * Prefer the suite-wide URI from globalSetup.js so we do not spawn/stop a
 * mongod process for every test file (that OOMs the Vitest worker mid-suite).
 */
export async function connectTestDb() {
  if (mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_TEST_URI is not set — ensure vitest globalSetup started MongoMemoryReplSet',
    );
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
}

export async function clearTestDb() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}