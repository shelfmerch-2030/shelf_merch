import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { accessVerifyOptions } from '../config/jwt.js';
import { setRequestContext } from '../config/requestContext.js';
import { RoleAssignment } from '../modules/roles/roleAssignment.model.js';
import { User } from '../modules/users/user.model.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * Verifies the access JWT and attaches req.user with the roleAssignment
 * snapshot baked into the token (§6.2). Reloads role data from the DB so
 * new department assignments work without forcing a re-login.
 */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new UnauthorizedError('Missing access token'));

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, accessVerifyOptions());

    // Reject tokens for users that were deleted or no longer exist.
    const existing = await User.findById(payload.sub).select('_id status').lean();
    if (!existing) {
      return next(new UnauthorizedError('Account no longer exists. Please sign in again.'));
    }
    if (existing.status === 'suspended') {
      return next(new UnauthorizedError('Account is suspended'));
    }

    const user = {
      userId: payload.sub,
      tenantId: payload.tenantId ?? null,
      role: payload.role,
      scopeType: payload.scopeType,
      scopeId: payload.scopeId ?? null,
      assignedEntityIds: payload.assignedEntityIds ?? [],
    };

    if (user.tenantId) {
      const assignment = await RoleAssignment.findOne({
        userId: user.userId,
        tenantId: user.tenantId,
      }).lean();
      if (assignment) {
        user.role = assignment.role;
        user.scopeType = assignment.scopeType;
        user.scopeId = assignment.scopeId ? String(assignment.scopeId) : null;
        user.assignedEntityIds = (assignment.assignedEntityIds ?? []).map(String);
      }
    }

    req.user = user;
    req.impersonation = payload.impersonation ?? { isImpersonating: false, originalUserId: null };
    setRequestContext({ userId: user.userId });
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid or expired access token'));
  }
}
