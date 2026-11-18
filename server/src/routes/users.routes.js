import express from 'express';
import { User } from '../models/User.js';
import { Purchase } from '../models/Purchase.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { ROLES } from '../lib/constants.js';
import { hashPassword } from '../services/authService.js';
import { recordAudit } from '../services/auditService.js';
import { serializePurchase } from '../services/purchaseService.js';
import { requireAuth, requireBoss } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { escapeRegex } from '../lib/normalize.js';
import {
  activityQuery,
  createUserSchema,
  idParam,
  listUsersQuery,
  resetUserPasswordSchema,
  updateUserSchema
} from '../validation/schemas.js';
import { startOfBusinessDay, endOfBusinessDayExclusive } from '../lib/dates.js';

const router = express.Router();

router.use(requireAuth, requireBoss);

async function assertNotLastActiveBoss(user) {
  if (user.role !== ROLES.BOSS) return;
  const others = await User.countDocuments({
    role: ROLES.BOSS,
    isActive: true,
    _id: { $ne: user._id }
  });
  if (others === 0) {
    throw ApiError.badRequest(
      'At least one active boss account must remain',
      null,
      'LAST_BOSS_PROTECTED'
    );
  }
}

router.get(
  '/',
  validate({ query: listUsersQuery }),
  asyncHandler(async (req, res) => {
    const { q, role, status, page, limit } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (status !== 'all') filter.isActive = status === 'active';
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [docs, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter)
    ]);

    const ids = docs.map((d) => d._id);
    const usage = await Purchase.aggregate([
      { $match: { recordedBy: { $in: ids }, deletedAt: null } },
      {
        $group: {
          _id: '$recordedBy',
          count: { $sum: 1 },
          totalKobo: { $sum: '$totalKobo' },
          lastPurchaseAt: { $max: '$purchaseDate' }
        }
      }
    ]);
    const usageMap = new Map(usage.map((u) => [u._id.toString(), u]));

    res.json({
      items: docs.map((d) => ({
        ...d.toSafeJSON(),
        purchaseCount: usageMap.get(d._id.toString())?.count || 0,
        purchaseTotalKobo: usageMap.get(d._id.toString())?.totalKobo || 0,
        lastPurchaseAt: usageMap.get(d._id.toString())?.lastPurchaseAt || null
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  })
);

router.post(
  '/',
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      throw ApiError.conflict('An account with this email address already exists', 'EMAIL_TAKEN');
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      isActive: true,
      createdBy: req.user._id
    });

    await recordAudit({
      req,
      actor: req.user,
      action: 'user.create',
      entityType: 'User',
      entityId: user._id,
      newValue: { name: user.name, email: user.email, role: user.role }
    });

    res.status(201).json({ user: user.toSafeJSON() });
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');
    res.json({ user: user.toSafeJSON() });
  })
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');

    const changes = [];
    const { name, email, role } = req.body;

    if (name !== undefined && name !== user.name) {
      changes.push({ field: 'name', oldValue: user.name, newValue: name });
      user.name = name;
    }
    if (email !== undefined && email !== user.email) {
      const taken = await User.findOne({ email, _id: { $ne: user._id } });
      if (taken) throw ApiError.conflict('An account with this email address already exists', 'EMAIL_TAKEN');
      changes.push({ field: 'email', oldValue: user.email, newValue: email });
      user.email = email;
      user.sessionVersion += 1;
    }
    if (role !== undefined && role !== user.role) {
      if (user.role === ROLES.BOSS && role !== ROLES.BOSS) {
        await assertNotLastActiveBoss(user);
      }
      changes.push({ field: 'role', oldValue: user.role, newValue: role });
      user.role = role;
      user.sessionVersion += 1;
    }

    if (!changes.length) return res.json({ user: user.toSafeJSON() });

    await user.save();

    for (const change of changes) {
      await recordAudit({
        req,
        actor: req.user,
        action: 'user.update',
        entityType: 'User',
        entityId: user._id,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue
      });
    }

    res.json({ user: user.toSafeJSON() });
  })
);

router.post(
  '/:id/password',
  validate({ params: idParam, body: resetUserPasswordSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');

    user.passwordHash = await hashPassword(req.body.password);
    user.passwordChangedAt = new Date();
    user.sessionVersion += 1;
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'user.password_reset',
      entityType: 'User',
      entityId: user._id,
      newValue: { email: user.email }
    });

    res.json({ ok: true, message: 'Password has been reset. The user will need to sign in again.' });
  })
);

router.post(
  '/:id/deactivate',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');
    if (user._id.equals(req.user._id)) {
      throw ApiError.badRequest('You cannot deactivate your own account', null, 'SELF_DEACTIVATION');
    }
    if (!user.isActive) throw ApiError.conflict('User is already deactivated', 'ALREADY_INACTIVE');

    await assertNotLastActiveBoss(user);

    user.isActive = false;
    user.sessionVersion += 1;
    await user.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'user.deactivate',
      entityType: 'User',
      entityId: user._id,
      newValue: { email: user.email }
    });

    res.json({ user: user.toSafeJSON() });
  })
);

router.post(
  '/:id/reactivate',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');
    if (user.isActive) throw ApiError.conflict('User is already active', 'ALREADY_ACTIVE');

    user.isActive = true;
    user.sessionVersion += 1;
    await user.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'user.reactivate',
      entityType: 'User',
      entityId: user._id,
      newValue: { email: user.email }
    });

    res.json({ user: user.toSafeJSON() });
  })
);

router.get(
  '/:id/activity',
  validate({ params: idParam, query: activityQuery }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');

    const { from, to } = req.query;
    const match = { recordedBy: user._id, deletedAt: null };
    if (from || to) {
      match.purchaseDate = {
        $gte: startOfBusinessDay(from || to),
        $lt: endOfBusinessDayExclusive(to || from)
      };
    }

    const [stats] = await Purchase.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalKobo: { $sum: '$totalKobo' },
          lastPurchaseAt: { $max: '$purchaseDate' }
        }
      }
    ]);

    const [recent, audits, totalAll] = await Promise.all([
      Purchase.find(match).sort({ purchaseDate: -1, createdAt: -1 }).limit(10),
      AuditEvent.find({ actor: user._id }).sort({ createdAt: -1 }).limit(20),
      Purchase.countDocuments({ recordedBy: user._id, deletedAt: null })
    ]);

    res.json({
      user: user.toSafeJSON(),
      range: { from: from || null, to: to || null },
      stats: {
        count: stats?.count || 0,
        totalKobo: stats?.totalKobo || 0,
        lastPurchaseAt: stats?.lastPurchaseAt || null,
        totalPurchasesAllTime: totalAll
      },
      recentPurchases: recent.map(serializePurchase),
      auditTrail: audits
    });
  })
);

export default router;
