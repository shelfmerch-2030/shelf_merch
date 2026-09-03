import crypto from 'node:crypto';
import { User } from './user.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { hashPassword } from '../auth/auth.service.js';
import { ApiError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { sendInviteEmail, sendManagerAssignmentEmail } from '../../services/email.service.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function clearStaleManagerBindings(userId) {
  try {
    const { Entity } = await import('../entities/entity.model.js');
    await Entity.updateMany(
      { managerUserId: userId },
      {
        $set: {
          managerUserId: null,
          managerInvitePending: false,
          managerEmail: '',
          managerName: '',
        },
      },
    ).setOptions({ skipTenantGuard: true });
  } catch {
    // Best-effort — invite should still proceed.
  }
}

/**
 * Creates an invited user + role assignment and returns the invite token.
 * Reused by /users/invite and /entities/:id/assign-manager.
 *
 * Emails are globally unique. An unused invite (`status: invited`) on another
 * workspace can be reclaimed. Active accounts on another workspace cannot.
 */
export async function inviteUser(
  {
    tenantId,
    name,
    email,
    phone = '',
    role,
    scopeType = 'tenant',
    scopeId = null,
    assignedEntityIds = [],
    sendInvite = true,
    emailContext = {},
  },
  session = null,
) {
  const normalizedEmail = email.toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail }).session(session);

  // Soft-deleted row still occupies the unique email index — revive for this tenant.
  if (!user) {
    const deleted = await User.findOne({ email: normalizedEmail })
      .setOptions({ includeDeleted: true })
      .session(session);
    if (deleted?.deletedAt) {
      user = deleted;
      user.deletedAt = null;
      user.tenantId = tenantId;
      user.status = 'invited';
      user.passwordHash = null;
      await RoleAssignment.deleteMany({ userId: user._id }).session(session);
      await clearStaleManagerBindings(user._id);
    }
  }

  if (user && String(user.tenantId ?? '') !== String(tenantId)) {
    if (user.status === 'invited') {
      // Never activated elsewhere — move the invite to this workspace.
      await RoleAssignment.deleteMany({ userId: user._id }).session(session);
      await clearStaleManagerBindings(user._id);
      user.tenantId = tenantId;
      user.passwordHash = null;
    } else if (!user.tenantId) {
      throw new ConflictError(
        `"${normalizedEmail}" is a ShelfMerch platform account and cannot be invited as a department manager. Use a different email.`,
      );
    } else {
      throw new ConflictError(
        `"${normalizedEmail}" is already registered to another workspace. Use a different email for this manager.`,
      );
    }
  }

  let inviteToken = null;

  if (!user) {
    inviteToken = crypto.randomBytes(32).toString('hex');
    [user] = await User.create(
      [
        {
          tenantId,
          name,
          email: normalizedEmail,
          phone,
          status: 'invited',
          inviteTokenHash: sha256(inviteToken),
          inviteTokenExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      ],
      session ? { session } : {},
    );
  } else if (user.status === 'invited') {
    inviteToken = crypto.randomBytes(32).toString('hex');
    user.tenantId = tenantId;
    user.inviteTokenHash = sha256(inviteToken);
    user.inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    if (name) user.name = name;
    if (phone) user.phone = phone;
    await user.save({ session });
  } else {
    // Active user in this workspace — issue a fresh accept link when sendInvite is on.
    if (sendInvite) {
      inviteToken = crypto.randomBytes(32).toString('hex');
      user.inviteTokenHash = sha256(inviteToken);
      user.inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    }
    if (name && user.name !== name) user.name = name;
    if (phone) user.phone = phone;
    if (user.isModified()) await user.save({ session });
  }

  const entityIds = assignedEntityIds.length
    ? assignedEntityIds
    : scopeId
      ? [scopeId]
      : [];

  const assignment = await RoleAssignment.findOne({ userId: user._id, tenantId }).session(session);
  if (!assignment) {
    await RoleAssignment.create(
      [{ tenantId, userId: user._id, role, scopeType, scopeId, assignedEntityIds: entityIds }],
      session ? { session } : {},
    );
  } else {
    assignment.role = role;
    assignment.scopeType = scopeType;
    assignment.scopeId = scopeId;
    for (const id of entityIds) {
      if (!assignment.assignedEntityIds.map(String).includes(String(id))) {
        assignment.assignedEntityIds.push(id);
      }
    }
    await assignment.save({ session });
  }

  const mailContext = {
    name,
    departmentName: emailContext.departmentName || '',
    organizationName: emailContext.organizationName || 'your organization',
    roleTitle: emailContext.roleTitle || 'Department Manager',
  };

  if (sendInvite && inviteToken) {
    await sendInviteEmail(normalizedEmail, inviteToken, mailContext);
  } else if (!sendInvite && user.status === 'active') {
    await sendManagerAssignmentEmail({ to: normalizedEmail, ...mailContext });
  }

  return { user, inviteToken };
}

export async function acceptInvite({ token, password }) {
  const tokenHash = sha256(token);
  const user = await User.findOne({
    inviteTokenHash: tokenHash,
    inviteTokenExpiresAt: { $gt: new Date() },
    status: { $in: ['invited', 'active'] },
  }).select('+inviteTokenHash');

  if (!user) {
    const expiredInvite = await User.findOne({
      inviteTokenHash: tokenHash,
      status: { $in: ['invited', 'active'] },
    }).select('+inviteTokenHash');
    if (expiredInvite) {
      throw new ApiError(
        400,
        'This invite link has expired. Ask your admin to resend the invitation.',
        'INVITE_EXPIRED',
      );
    }
    throw new ApiError(
      400,
      'This invite link is invalid or has already been used. Try logging in, or ask your admin for a new invite.',
      'INVALID_INVITE_TOKEN',
    );
  }

  user.passwordHash = await hashPassword(password);
  if (user.status === 'invited') {
    user.status = 'active';
  }
  user.inviteTokenHash = null;
  user.inviteTokenExpiresAt = null;
  await user.save();

  const { Entity } = await import('../entities/entity.model.js');
  await Entity.updateMany(
    { tenantId: user.tenantId, managerUserId: user._id },
    { managerInvitePending: false },
  );

  return user;
}

export async function listUsers({ tenantId }) {
  const users = await User.find({ tenantId }).sort({ createdAt: 1 }).lean();
  const assignments = await RoleAssignment.find({ tenantId }).lean();
  const byUser = new Map(assignments.map((a) => [String(a.userId), a]));
  return users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    role: byUser.get(String(u._id))?.role ?? null,
    scopeType: byUser.get(String(u._id))?.scopeType ?? null,
    assignedEntityIds: (byUser.get(String(u._id))?.assignedEntityIds ?? []).map(String),
  }));
}

export async function changeRole({ tenantId, userId, role, scopeType, scopeId = null, assignedEntityIds = [] }) {
  const user = await User.findOne({ _id: userId, tenantId });
  if (!user) throw new NotFoundError('User not found');

  const before = await RoleAssignment.findOne({ userId, tenantId }).lean();
  const after = await RoleAssignment.findOneAndUpdate(
    { userId, tenantId },
    { role, scopeType, scopeId, assignedEntityIds },
    { new: true, upsert: true },
  ).lean();

  return { before, after };
}
