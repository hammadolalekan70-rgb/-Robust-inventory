import express from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { todayBusinessDate } from '../lib/dates.js';
import { ROLES } from '../lib/constants.js';
import { getDashboard, getDayTransactions } from '../services/reportService.js';
import { canViewSpend, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dateParam, optionalRangeQuery } from '../validation/schemas.js';

const router = express.Router();

const unlockSchema = z.object({
  code: z.string().trim().min(1).max(32)
});

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

router.use(requireAuth);

router.get(
  '/',
  validate({ query: optionalRangeQuery }),
  asyncHandler(async (req, res) => {
    const today = todayBusinessDate();
    const monthStart = `${today.slice(0, 7)}-01`;
    const from = req.query.from || (req.query.to ? req.query.to : monthStart);
    const to = req.query.to || (req.query.from ? req.query.from : today);
    const dashboard = await getDashboard({ from, to });
    const spendUnlocked = canViewSpend(req);
    if (spendUnlocked) {
      return res.json({ ...dashboard, spendUnlocked });
    }
    return res.json({
      ...dashboard,
      totalKobo: null,
      averageKobo: null,
      daily: dashboard.daily.map((day) => ({ ...day, totalKobo: null })),
      bySupplier: dashboard.bySupplier.map((supplier) => ({ ...supplier, totalKobo: null })),
      byProduct: dashboard.byProduct.map((product) => ({ ...product, totalKobo: null })),
      recent: dashboard.recent.map((purchase) => ({ ...purchase, totalKobo: null, items: [] })),
      spendUnlocked
    });
  })
);

router.post(
  '/unlock',
  validate({ body: unlockSchema }),
  asyncHandler(async (req, res) => {
    const isBoss = req.user.role === ROLES.BOSS;
    if (!isBoss && req.body.code !== config.dashboardUnlockCode) {
      throw ApiError.forbidden('That access code is not correct.');
    }
    req.session.spendUnlocked = true;
    await saveSession(req);
    res.json({ spendUnlocked: true });
  })
);

router.get(
  '/day/:date',
  validate({ params: dateParam }),
  asyncHandler(async (req, res) => {
    const data = await getDayTransactions(req.params.date);
    res.json(data);
  })
);

export default router;
