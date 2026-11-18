import express from 'express';
import { Product } from '../models/Product.js';
import { Purchase } from '../models/Purchase.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { escapeRegex, normalizeName } from '../lib/normalize.js';
import { findSimilarProducts } from '../services/duplicateService.js';
import { recordAudit } from '../services/auditService.js';
import { getPriceHistoryForProduct } from '../services/reportService.js';
import { requireAuth, requireBoss } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  duplicateQuery,
  idParam,
  listProductsQuery,
  priceHistoryQuery,
  productCreateSchema,
  productUpdateSchema
} from '../validation/schemas.js';

const router = express.Router();

router.use(requireAuth);

async function usageFor(ids) {
  if (!ids.length) return new Map();
  const rows = await Purchase.aggregate([
    { $match: { deletedAt: null, 'items.product': { $in: ids } } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: ids } } },
    {
      $group: {
        _id: '$items.product',
        purchaseCount: { $sum: 1 },
        totalKobo: { $sum: '$items.lineTotalKobo' },
        lastPurchaseAt: { $max: '$purchaseDate' }
      }
    }
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r]));
}

function serializeProduct(product, usage) {
  return {
    id: product._id.toString(),
    name: product.name,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    usage: usage
      ? {
          purchaseCount: usage.purchaseCount || 0,
          totalKobo: usage.totalKobo || 0,
          lastPurchaseAt: usage.lastPurchaseAt || null
        }
      : undefined
  };
}

router.get(
  '/duplicates',
  validate({ query: duplicateQuery }),
  asyncHandler(async (req, res) => {
    const matches = await findSimilarProducts(req.query.name);
    res.json({ matches });
  })
);

router.get(
  '/',
  validate({ query: listProductsQuery }),
  asyncHandler(async (req, res) => {
    const { q, status, withUsage, page, limit } = req.query;
    const filter = {};
    if (status !== 'all') filter.isActive = status === 'active';
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { normalizedName: rx }];
    }

    const [docs, total] = await Promise.all([
      Product.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter)
    ]);

    const usage = withUsage === 'true' ? await usageFor(docs.map((d) => d._id)) : null;

    res.json({
      items: docs.map((d) => serializeProduct(d, usage?.get(d._id.toString()))),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  })
);

router.post(
  '/',
  validate({ body: productCreateSchema }),
  asyncHandler(async (req, res) => {
    const { name, confirmNew } = req.body;
    const exact = await Product.findOne({ normalizedName: normalizeName(name) });
    if (exact) {
      throw ApiError.conflict(
        exact.isActive
          ? `"${exact.name}" already exists in the product directory`
          : `"${exact.name}" exists but is deactivated. Reactivate it instead.`,
        'PRODUCT_EXISTS',
        { productId: exact._id.toString(), isActive: exact.isActive }
      );
    }

    if (!confirmNew) {
      const matches = await findSimilarProducts(name);
      if (matches.length) {
        throw ApiError.conflict(
          'Similar products already exist. Select one of them or confirm this is a different product.',
          'PRODUCT_DUPLICATE',
          { matches }
        );
      }
    }

    const product = await Product.create({ name, createdBy: req.user._id });

    await recordAudit({
      req,
      actor: req.user,
      action: 'product.create',
      entityType: 'Product',
      entityId: product._id,
      newValue: { name: product.name }
    });

    res.status(201).json({ product: serializeProduct(product) });
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw ApiError.notFound('Product not found');
    const usage = await usageFor([product._id]);
    res.json({ product: serializeProduct(product, usage.get(product._id.toString())) });
  })
);

router.patch(
  '/:id',
  requireBoss,
  validate({ params: idParam, body: productUpdateSchema }),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw ApiError.notFound('Product not found');

    const { name } = req.body;
    if (name === product.name) return res.json({ product: serializeProduct(product) });

    const clash = await Product.findOne({
      normalizedName: normalizeName(name),
      _id: { $ne: product._id }
    });
    if (clash) {
      throw ApiError.conflict(`"${clash.name}" already exists in the product directory`, 'PRODUCT_EXISTS', {
        productId: clash._id.toString()
      });
    }

    const oldName = product.name;
    product.name = name;
    await product.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'product.update',
      entityType: 'Product',
      entityId: product._id,
      field: 'name',
      oldValue: oldName,
      newValue: product.name
    });

    res.json({ product: serializeProduct(product) });
  })
);

router.post(
  '/:id/deactivate',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw ApiError.notFound('Product not found');
    if (!product.isActive) throw ApiError.conflict('Product is already deactivated', 'ALREADY_INACTIVE');

    product.isActive = false;
    await product.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'product.deactivate',
      entityType: 'Product',
      entityId: product._id,
      newValue: { name: product.name }
    });

    res.json({ product: serializeProduct(product) });
  })
);

router.post(
  '/:id/reactivate',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw ApiError.notFound('Product not found');
    if (product.isActive) throw ApiError.conflict('Product is already active', 'ALREADY_ACTIVE');

    product.isActive = true;
    await product.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'product.reactivate',
      entityType: 'Product',
      entityId: product._id,
      newValue: { name: product.name }
    });

    res.json({ product: serializeProduct(product) });
  })
);

router.get(
  '/:id/price-history',
  validate({ params: idParam, query: priceHistoryQuery }),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw ApiError.notFound('Product not found');

    const { from, to, supplierId, page, limit } = req.query;
    const history = await getPriceHistoryForProduct({
      productId: product._id,
      from,
      to,
      supplierId,
      page,
      limit
    });

    res.json({
      product: serializeProduct(product),
      ...history
    });
  })
);

export default router;
