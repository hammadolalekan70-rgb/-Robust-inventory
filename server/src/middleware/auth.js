import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { ROLES } from '../lib/constants.js';

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const userId = req.session?.userId;
  if (!userId) throw ApiError.unauthorized();

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    await destroySession(req);
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.', 'SESSION_INVALID');
  }
  if (Number(req.session.sessionVersion) !== Number(user.sessionVersion)) {
    await destroySession(req);
    throw ApiError.unauthorized('Your session has expired. Please sign in again.', 'SESSION_INVALID');
  }

  req.user = user;
  next();
});

export function requireBoss(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== ROLES.BOSS) {
    return next(ApiError.forbidden('Only the boss/admin can perform this action'));
  }
  next();
}

export function isBoss(user) {
  return user?.role === ROLES.BOSS;
}

export function canViewSpend(req) {
  return isBoss(req.user) || req.session?.spendUnlocked === true;
}
