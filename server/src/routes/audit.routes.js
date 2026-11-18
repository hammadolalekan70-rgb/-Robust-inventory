import express from 'express';
import { AuditEvent } from '../models/AuditEvent.js';
import { asyncHandler } from '../lib/errors.js';
import { escapeRegex } from '../lib/normalize.js';
import { startOfBusinessDay, endOfBusinessDayExclusive } from '../lib/dates.js';
import { requireAuth, requireBoss } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { auditQuery } from '../validation/schemas.js';

const router = express.Router();

router.use(requireAuth, requireBoss);

router.get(
  '/',
  validate({ query: auditQuery }),
  asyncHandler(async (req, res) => {
    const { action, entityType, actorId, from, to, page, limit } = req.query;
    const filter = {};
    if (action) filter.action = new RegExp(`^${escapeRegex(action)}`, 'i');
    if (entityType) filter.entityType = entityType;
    if (actorId) filter.actor = actorId;
    if (from || to) {
      filter.createdAt = {
        $gte: startOfBusinessDay(from || to),
        $lt: endOfBusinessDayExclusive(to || from)
      };
    }

    const [items, total] = await Promise.all([
      AuditEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditEvent.countDocuments(filter)
    ]);

    res.json({
      items: items.map((e) => ({
        id: e._id.toString(),
        actorName: e.actorName,
        actorRole: e.actorRole,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ? e.entityId.toString() : null,
        transactionNumber: e.transactionNumber || '',
        field: e.field || '',
        oldValue: e.oldValue,
        newValue: e.newValue,
        ip: e.ip,
        userAgent: e.userAgent,
        createdAt: e.createdAt
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  })
);

export default router;
