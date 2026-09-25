/**
 * Recreate only the platform super admin.
 *
 * Uses MONGO_URL from apps/api/.env. Refuses to run unless the connected
 * database is shelfmerch_test. Skips any user or role assignment that already exists.
 *
 * Usage (from apps/api):
 *   node src/scripts/create-platform-admin.js
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { User } from '../modules/users/user.model.js';
import { RoleAssignment } from '../modules/roles/roleAssignment.model.js';

const ALLOWED_DB = 'shelfmerch_test';
const EMAIL = 'admin@shelfmerch.io';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run when NODE_ENV is production.');
    process.exitCode = 1;
    return;
  }

  await connectDb();
  const dbName = mongoose.connection.name;
  console.log(`Connected database: ${dbName}`);
  if (dbName !== ALLOWED_DB) {
    console.error(`Refusing to run. Connected database is "${dbName}", expected "${ALLOWED_DB}".`);
    process.exitCode = 1;
    return;
  }

  let user = await User.findOne({ email: EMAIL }).setOptions({ includeDeleted: true });
  if (user) {
    console.log(`User already exists: ${user._id}`);
  } else {
    user = await User.create({
      tenantId: null,
      name: 'ShelfMerch Admin',
      email: EMAIL,
      passwordHash: await hashPassword('demo1234'),
      status: 'active',
    });
    console.log(`Created user: ${user._id}`);
  }

  let assignment = await RoleAssignment.findOne({
    userId: user._id,
    role: 'platform_super_admin',
    scopeType: 'platform',
    tenantId: null,
  });
  if (assignment) {
    console.log(`Role assignment already exists: ${assignment._id}`);
  } else {
    assignment = await RoleAssignment.create({
      tenantId: null,
      userId: user._id,
      role: 'platform_super_admin',
      scopeType: 'platform',
      scopeId: null,
      assignedEntityIds: [],
    });
    console.log(`Created role assignment: ${assignment._id}`);
  }

  console.log(`user id: ${user._id}`);
  console.log(`role assignment id: ${assignment._id}`);
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message.replace(/\/\/[^@\s/]+@/g, '//***@'));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb().catch(() => {});
  });
