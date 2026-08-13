/**
 * Start one in-memory Mongo replica set for the whole Vitest run.
 * Individual test files connect via MONGODB_TEST_URI (see setup.js).
 */
export default async function globalSetup() {
  if (process.env.MONGODB_TEST_URI) {
    return undefined;
  }

  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_TEST_URI = server.getUri('shelfmerch_test');

  return async () => {
    await server.stop();
  };
}