import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  // Drop the old tenantId+email unique index (no deletedAt filter) and apply the
  // partial unique index so soft-deleted contacts do not block re-add/import.
  try {
    const { Contact } = await import('../modules/contacts/contact.model.js');
    await Contact.syncIndexes();
  } catch (err) {
    logger.warn({ err }, 'Contact index sync failed');
  }
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
