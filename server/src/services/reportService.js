import { Purchase } from '../models/Purchase.js';
import { Product } from '../models/Product.js';
import { Supplier } from '../models/Supplier.js';
import { User } from '../models/User.js';
import { ROLES } from '../lib/constants.js';
import {
  endOfBusinessDayExclusive,
  enumerateDays,
  monthKey,
  startOfBusinessDay,
  weekKey
} from '../lib/dates.js';
import { milliToQuantityString } from '../lib/money.js';
import { serializePurchase } from './purchaseService.js';

export const MAX_RANGE_DAYS = 366;

export function resolveReportRange(from, to) {
  const start = startOfBusinessDay(from);
  const end = endOfBusinessDayExclusive(to);
  if (start >= end) {
    const err = new Error('"from" must be on or before "to"');
    err.code = 'INVALID_RANGE';
    throw err;
  }
  const days = enumerateDays(from, to);
  if (days.length > MAX_RANGE_DAYS) {
    const err = new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    err.code = 'INVALID_RANGE';
    throw err;
  }
  return { start, end, days };
}

export async function getDashboard({ from, to }) {
  const { start, end, days } = resolveReportRange(from, to);
  const match = { deletedAt: null, purchaseDate: { $gte: start, $lt: end } };

  const [facets] = await Purchase.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [{ $group: { _id: null, totalKobo: { $sum: '$totalKobo' }, count: { $sum: 1 } } }],
        daily: [
          { $group: { _id: '$purchaseDay', totalKobo: { $sum: '$totalKobo' }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ],
        bySupplier: [
          { $group: { _id: '$supplierSnapshot.name', totalKobo: { $sum: '$totalKobo' }, count: { $sum: 1 } } },
          { $sort: { totalKobo: -1 } },
          { $limit: 8 }
        ],
        byProduct: [
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productNameSnapshot',
              totalKobo: { $sum: '$items.lineTotalKobo' },
              quantityMilli: { $sum: '$items.quantityMilli' },
              count: { $sum: 1 }
            }
          },
          { $sort: { totalKobo: -1 } },
          { $limit: 8 }
        ]
      }
    }
  ]);

  const totals = facets.totals[0] || { totalKobo: 0, count: 0 };
  const dailyMap = new Map(facets.daily.map((d) => [d._id, d]));
  const daily = days.map((date) => ({
    date,
    totalKobo: dailyMap.get(date)?.totalKobo || 0,
    count: dailyMap.get(date)?.count || 0
  }));

  const [recentDocs, productCount, supplierCount, staffCount] = await Promise.all([
    Purchase.find(match).sort({ purchaseDate: -1, createdAt: -1 }).limit(5),
    Product.countDocuments({ isActive: true }),
    Supplier.countDocuments({ isActive: true }),
    User.countDocuments({ role: ROLES.STAFF, isActive: true })
  ]);

  return {
    range: { from, to },
    totalKobo: totals.totalKobo,
    transactionCount: totals.count,
    averageKobo: totals.count ? Math.round(totals.totalKobo / totals.count) : 0,
    daily,
    bySupplier: facets.bySupplier.map((s) => ({
      name: s._id || 'Unknown supplier',
      totalKobo: s.totalKobo,
      count: s.count
    })),
    byProduct: facets.byProduct.map((p) => ({
      name: p._id || 'Unknown product',
      totalKobo: p.totalKobo,
      quantity: milliToQuantityString(p.quantityMilli),
      count: p.count
    })),
    recent: recentDocs.map(serializePurchase),
    counts: {
      products: productCount,
      suppliers: supplierCount,
      staff: staffCount,
      transactions: totals.count
    }
  };
}

export async function getDayTransactions(date) {
  const { start, end } = resolveReportRange(date, date);
  const purchases = await Purchase.find({ deletedAt: null, purchaseDate: { $gte: start, $lt: end } })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate('attachments');
  return {
    date,
    items: purchases.map(serializePurchase),
    totalKobo: purchases.reduce((sum, p) => sum + p.totalKobo, 0)
  };
}

export async function getSummaryReport({ from, to }) {
  const { start, end } = resolveReportRange(from, to);
  const match = { deletedAt: null, purchaseDate: { $gte: start, $lt: end } };

  const [facets] = await Purchase.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [{ $group: { _id: null, totalKobo: { $sum: '$totalKobo' }, count: { $sum: 1 } } }],
        byDay: [
          { $group: { _id: '$purchaseDay', totalKobo: { $sum: '$totalKobo' }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ],
        bySupplier: [
          { $group: { _id: '$supplierSnapshot.name', totalKobo: { $sum: '$totalKobo' }, count: { $sum: 1 } } },
          { $sort: { totalKobo: -1 } }
        ],
        byProduct: [
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productNameSnapshot',
              totalKobo: { $sum: '$items.lineTotalKobo' },
              quantityMilli: { $sum: '$items.quantityMilli' },
              count: { $sum: 1 }
            }
          },
          { $sort: { totalKobo: -1 } }
        ],
        byStaff: [
          { $group: { _id: '$recordedByName', totalKobo: { $sum: '$totalKobo' }, count: { $sum: 1 } } },
          { $sort: { totalKobo: -1 } }
        ]
      }
    }
  ]);

  const totals = facets.totals[0] || { totalKobo: 0, count: 0 };

  const weeks = new Map();
  const months = new Map();
  for (const day of facets.byDay) {
    const wk = weekKey(day._id);
    const mk = monthKey(day._id);
    const w = weeks.get(wk) || { key: wk, totalKobo: 0, count: 0 };
    w.totalKobo += day.totalKobo;
    w.count += day.count;
    weeks.set(wk, w);
    const m = months.get(mk) || { key: mk, totalKobo: 0, count: 0 };
    m.totalKobo += day.totalKobo;
    m.count += day.count;
    months.set(mk, m);
  }

  return {
    range: { from, to },
    totals: {
      totalKobo: totals.totalKobo,
      transactionCount: totals.count,
      averageKobo: totals.count ? Math.round(totals.totalKobo / totals.count) : 0
    },
    daily: facets.byDay.map((d) => ({ date: d._id, totalKobo: d.totalKobo, count: d.count })),
    weekly: [...weeks.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    monthly: [...months.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    bySupplier: facets.bySupplier.map((s) => ({
      name: s._id || 'Unknown supplier',
      totalKobo: s.totalKobo,
      count: s.count
    })),
    byProduct: facets.byProduct.map((p) => ({
      name: p._id || 'Unknown product',
      totalKobo: p.totalKobo,
      quantity: milliToQuantityString(p.quantityMilli),
      quantityMilli: p.quantityMilli,
      count: p.count
    })),
    byStaff: facets.byStaff.map((s) => ({
      name: s._id || 'Unknown staff',
      totalKobo: s.totalKobo,
      count: s.count
    }))
  };
}

export async function getDetailedReport({ from, to, limit = 2000 }) {
  const { start, end } = resolveReportRange(from, to);
  const purchases = await Purchase.find({ deletedAt: null, purchaseDate: { $gte: start, $lt: end } })
    .sort({ purchaseDate: 1, createdAt: 1 })
    .limit(limit)
    .populate('attachments');

  const items = purchases.map(serializePurchase);
  return {
    range: { from, to },
    transactionCount: items.length,
    totalKobo: items.reduce((sum, p) => sum + p.totalKobo, 0),
    transactions: items
  };
}

export async function getPriceHistoryForProduct({ productId, from, to, supplierId, page = 1, limit = 20 }) {
  const match = { deletedAt: null, 'items.product': productId };
  if (from || to) {
    const f = from || to;
    const t = to || from;
    match.purchaseDate = { $gte: startOfBusinessDay(f), $lt: endOfBusinessDayExclusive(t) };
  }

  const pipeline = [
    { $match: match },
    { $unwind: '$items' },
    { $match: { 'items.product': productId } }
  ];
  if (supplierId) pipeline.push({ $match: { supplier: supplierId } });
  pipeline.push({
    $project: {
      _id: 0,
      purchaseId: '$_id',
      transactionNumber: 1,
      purchaseDate: 1,
      purchaseDay: 1,
      supplierName: '$supplierSnapshot.name',
      supplier: 1,
      staffName: '$recordedByName',
      quantityMilli: '$items.quantityMilli',
      unitPriceKobo: '$items.unitPriceKobo',
      lineTotalKobo: '$items.lineTotalKobo'
    }
  });
  pipeline.push({ $sort: { purchaseDate: -1, transactionNumber: -1 } });
  pipeline.push({
    $facet: {
      entries: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: 'count' }],
      stats: [
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            minKobo: { $min: '$unitPriceKobo' },
            maxKobo: { $max: '$unitPriceKobo' },
            avgKobo: { $avg: '$unitPriceKobo' },
            lastKobo: { $first: '$unitPriceKobo' },
            lastDate: { $first: '$purchaseDay' }
          }
        }
      ],
      bySupplier: [
        {
          $group: {
            _id: '$supplierName',
            count: { $sum: 1 },
            minKobo: { $min: '$unitPriceKobo' },
            maxKobo: { $max: '$unitPriceKobo' },
            avgKobo: { $avg: '$unitPriceKobo' },
            lastKobo: { $first: '$unitPriceKobo' }
          }
        },
        { $sort: { avgKobo: 1 } }
      ]
    }
  });

  const [result] = await Purchase.aggregate(pipeline);
  const total = result.total[0]?.count || 0;
  const stats = result.stats[0] || { count: 0, minKobo: null, maxKobo: null, avgKobo: null };

  return {
    productId,
    entries: result.entries.map((e) => ({
      purchaseId: String(e.purchaseId),
      transactionNumber: e.transactionNumber,
      date: e.purchaseDay,
      supplierId: String(e.supplier),
      supplierName: e.supplierName,
      staffName: e.staffName,
      quantity: milliToQuantityString(e.quantityMilli),
      quantityMilli: e.quantityMilli,
      unitPriceKobo: e.unitPriceKobo,
      lineTotalKobo: e.lineTotalKobo
    })),
    stats: {
      count: stats.count || 0,
      minKobo: stats.minKobo ?? null,
      maxKobo: stats.maxKobo ?? null,
      avgKobo: stats.avgKobo ? Math.round(stats.avgKobo) : null,
      lastKobo: stats.lastKobo ?? null,
      lastDate: stats.lastDate || null
    },
    bySupplier: result.bySupplier.map((s) => ({
      supplierName: s._id || 'Unknown supplier',
      count: s.count,
      minKobo: s.minKobo,
      maxKobo: s.maxKobo,
      avgKobo: Math.round(s.avgKobo),
      lastKobo: s.lastKobo
    })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}
