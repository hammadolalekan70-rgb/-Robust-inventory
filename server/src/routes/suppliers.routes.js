import express from 'express';
import { Supplier } from '../models/Supplier.js';
import { Purchase } from '../models/Purchase.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { escapeRegex, normalizeName } from '../lib/normalize.js';
import { findSimilarSuppliers } from '../services/duplicateService.js';
import { recordAudit } from '../services/auditService.js';
import { requireAuth, requireBoss } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  duplicateQuery,
  idParam,
  listSuppliersQuery,
  supplierCreateSchema,
  supplierUpdateSchema
} from '../validation/schemas.js';

const router = express.Router();

router.use(requireAuth);

async function usageFor(ids) {
  if (!ids.length) return new Map();
  const rows = await Purchase.aggregate([
    { $match: { deletedAt: null, supplier: { $in: ids } } },
    {
      $group: {
        _id: '$supplier',
        purchaseCount: { $sum: 1 },
        totalKobo: { $sum: '$totalKobo' },
        lastPurchaseAt: { $max: '$purchaseDate' }
      }
    }
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r]));
}

function serializeSupplier(supplier, usage) {
  return {
    id: supplier._id.toString(),
    name: supplier.name,
    phone: supplier.phone || '',
    address: supplier.address || '',
    isActive: supplier.isActive,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
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
    const matches = await findSimilarSuppliers(req.query.name);
    res.json({ matches });
  })
);

router.get(
  '/',
  validate({ query: listSuppliersQuery }),
  asyncHandler(async (req, res) => {
    const { q, status, withUsage, page, limit } = req.query;
    const filter = {};
    if (status !== 'all') filter.isActive = status === 'active';
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { normalizedName: rx }, { phone: rx }, { address: rx }];
    }

    const [docs, total] = await Promise.all([
      Supplier.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Supplier.countDocuments(filter)
    ]);

    const usage = withUsage === 'true' ? await usageFor(docs.map((d) => d._id)) : null;

    res.json({
      items: docs.map((d) => serializeSupplier(d, usage?.get(d._id.toString()))),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  })
);

router.post(
  '/',
  validate({ body: supplierCreateSchema }),
  asyncHandler(async (req, res) => {
    const { name, phone, address, confirmNew } = req.body;
    const exact = await Supplier.findOne({ normalizedName: normalizeName(name) });
    if (exact) {
      throw ApiError.conflict(
        exact.isActive
          ? `"${exact.name}" already exists in the supplier directory`
          : `"${exact.name}" exists but is deactivated. Reactivate it instead.`,
        'SUPPLIER_EXISTS',
        { supplierId: exact._id.toString(), isActive: exact.isActive }
      );
    }

    if (!confirmNew) {
      const matches = await findSimilarSuppliers(name);
      if (matches.length) {
        throw ApiError.conflict(
          'Similar suppliers already exist. Select one of them or confirm this is a different supplier.',
          'SUPPLIER_DUPLICATE',
          { matches }
        );
      }
    }

    const supplier = await Supplier.create({
      name,
      phone,
      address,
      createdBy: req.user._id
    });

    await recordAudit({
      req,
      actor: req.user,
      action: 'supplier.create',
      entityType: 'Supplier',
      entityId: supplier._id,
      newValue: { name: supplier.name, phone: supplier.phone, address: supplier.address }
    });

    res.status(201).json({ supplier: serializeSupplier(supplier) });
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) throw ApiError.notFound('Supplier not found');
    const usage = await usageFor([supplier._id]);
    res.json({ supplier: serializeSupplier(supplier, usage.get(supplier._id.toString())) });
  })
);

router.patch(
  '/:id',
  requireBoss,
  validate({ params: idParam, body: supplierUpdateSchema }),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw ApiError.notFound('Supplier not found');

    const changes = [];
    const { name, phone, address, isActive } = req.body;

    if (name !== undefined && name !== supplier.name) {
      const clash = await Supplier.findOne({
        normalizedName: normalizeName(name),
        _id: { $ne: supplier._id }
      });
      if (clash) {
        throw ApiError.conflict(`"${clash.name}" already exists in the supplier directory`, 'SUPPLIER_EXISTS', {
          supplierId: clash._id.toString()
        });
      }
      changes.push({ field: 'name', oldValue: supplier.name, newValue: name });
      supplier.name = name;
    }
    for (const field of ['phone', 'address']) {
      const value = req.body[field];
      if (value !== undefined && value !== supplier[field]) {
        changes.push({ field, oldValue: supplier[field], newValue: value });
        supplier[field] = value;
      }
    }
    if (isActive !== undefined && isActive !== supplier.isActive) {
      changes.push({ field: 'isActive', oldValue: supplier.isActive, newValue: isActive });
      supplier.isActive = isActive;
    }

    if (!changes.length) return res.json({ supplier: serializeSupplier(supplier) });

    await supplier.save();

    for (const change of changes) {
      await recordAudit({
        req,
        actor: req.user,
        action: 'supplier.update',
        entityType: 'Supplier',
        entityId: supplier._id,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue
      });
    }

    res.json({ supplier: serializeSupplier(supplier) });
  })
);

router.post(
  '/:id/deactivate',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw ApiError.notFound('Supplier not found');
    if (!supplier.isActive) throw ApiError.conflict('Supplier is already deactivated', 'ALREADY_INACTIVE');

    supplier.isActive = false;
    await supplier.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'supplier.deactivate',
      entityType: 'Supplier',
      entityId: supplier._id,
      newValue: { name: supplier.name }
    });

    res.json({ supplier: serializeSupplier(supplier) });
  })
);

router.post(
  '/:id/reactivate',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw ApiError.notFound('Supplier not found');
    if (supplier.isActive) throw ApiError.conflict('Supplier is already active', 'ALREADY_ACTIVE');

    supplier.isActive = true;
    await supplier.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'supplier.reactivate',
      entityType: 'Supplier',
      entityId: supplier._id,
      newValue: { name: supplier.name }
    });

    res.json({ supplier: serializeSupplier(supplier) });
  })
);

export default router;
