import { Purchase } from '../models/Purchase.js';
import { Product } from '../models/Product.js';
import { Supplier } from '../models/Supplier.js';
import { Attachment } from '../models/Attachment.js';
import { PurchaseRevision } from '../models/PurchaseRevision.js';
import { nextSequence } from '../models/Counter.js';
import { ApiError } from '../lib/errors.js';
import { ROLES } from '../lib/constants.js';
import {
  lineTotalKobo,
  milliToQuantityString,
  parseNairaToKobo,
  parseQuantityToMilli,
  sumKobo
} from '../lib/money.js';
import {
  businessDayKey,
  endOfBusinessDayExclusive,
  isValidDateOnly,
  startOfBusinessDay,
  todayBusinessDate
} from '../lib/dates.js';
import { escapeRegex, normalizeName } from '../lib/normalize.js';
import { findSimilarProducts, findSimilarSuppliers } from './duplicateService.js';
import { recordAudit } from './auditService.js';
import {
  removeAttachmentFiles,
  serializeAttachment,
  storeAttachment
} from './attachmentService.js';
import { config } from '../config/env.js';

function badMoney(field, err) {
  return ApiError.badRequest(err.message, { field }, 'VALIDATION_ERROR');
}

function parseQuantitySafe(value, index) {
  try {
    return parseQuantityToMilli(value);
  } catch (err) {
    throw badMoney(`items[${index}].quantity`, err);
  }
}

function parsePriceSafe(value, index) {
  try {
    return parseNairaToKobo(value);
  } catch (err) {
    throw badMoney(`items[${index}].unitPrice`, err);
  }
}

async function assertNoDuplicateWarnings(payload) {
  const productWarnings = [];
  for (const item of payload.items) {
    if (item.productId || !item.newProduct) continue;
    const name = item.newProduct.name.trim();
    const exact = await Product.findOne({ normalizedName: normalizeName(name) }).lean();
    if (exact) continue;
    if (item.newProduct.confirmNew) continue;
    const matches = await findSimilarProducts(name);
    if (matches.length) productWarnings.push({ name, matches });
  }

  const supplierWarnings = [];
  if (!payload.supplierId && payload.newSupplier) {
    const name = payload.newSupplier.name.trim();
    const exact = await Supplier.findOne({ normalizedName: normalizeName(name) }).lean();
    if (!exact && !payload.newSupplier.confirmNew) {
      const matches = await findSimilarSuppliers(name);
      if (matches.length) supplierWarnings.push({ name, matches });
    }
  }

  if (productWarnings.length || supplierWarnings.length) {
    throw ApiError.conflict(
      'Possible duplicate records found. Select an existing record or confirm the new entry.',
      'DUPLICATE_WARNING',
      { products: productWarnings, suppliers: supplierWarnings }
    );
  }
}

async function resolveSupplier(payload, user) {
  if (payload.supplierId) {
    const supplier = await Supplier.findById(payload.supplierId);
    if (!supplier) throw ApiError.badRequest('Selected supplier no longer exists');
    if (!supplier.isActive) {
      throw ApiError.conflict(
        `Supplier "${supplier.name}" is deactivated and cannot be used for new purchases`,
        'SUPPLIER_INACTIVE',
        { supplierId: supplier._id.toString() }
      );
    }
    return supplier;
  }

  const name = payload.newSupplier.name.trim();
  const normalizedName = normalizeName(name);
  if (!normalizedName) throw ApiError.badRequest('Supplier name is required');

  const exact = await Supplier.findOne({ normalizedName });
  if (exact) {
    if (!exact.isActive) {
      throw ApiError.conflict(
        `Supplier "${exact.name}" is deactivated. Ask the boss to reactivate it or use a different name.`,
        'SUPPLIER_INACTIVE',
        { supplierId: exact._id.toString() }
      );
    }
    return exact;
  }

  return Supplier.create({
    name,
    phone: payload.newSupplier.phone || '',
    address: payload.newSupplier.address || '',
    createdBy: user._id
  });
}

async function resolveProduct(item, user) {
  if (item.productId) {
    const product = await Product.findById(item.productId);
    if (!product) throw ApiError.badRequest('Selected product no longer exists');
    if (!product.isActive) {
      throw ApiError.conflict(
        `Product "${product.name}" is deactivated and cannot be used for new purchases`,
        'PRODUCT_INACTIVE',
        { productId: product._id.toString() }
      );
    }
    return product;
  }

  const name = item.newProduct.name.trim();
  const normalizedName = normalizeName(name);
  if (!normalizedName) throw ApiError.badRequest('Product name is required');

  const exact = await Product.findOne({ normalizedName });
  if (exact) {
    if (!exact.isActive) {
      throw ApiError.conflict(
        `Product "${exact.name}" is deactivated. Ask the boss to reactivate it or use a different name.`,
        'PRODUCT_INACTIVE',
        { productId: exact._id.toString() }
      );
    }
    return exact;
  }

  return Product.create({ name, createdBy: user._id });
}

export function resolvePurchaseDate(input, user, previousDay = null) {
  const today = todayBusinessDate();

  if (!input) {
    if (previousDay) return { day: previousDay, date: startOfBusinessDay(previousDay) };
    return { day: today, date: startOfBusinessDay(today) };
  }
  if (!isValidDateOnly(input)) {
    throw ApiError.badRequest('purchaseDate must be a valid YYYY-MM-DD date', { field: 'purchaseDate' });
  }
  if (input > today) {
    throw ApiError.badRequest('Purchase date cannot be in the future', { field: 'purchaseDate' });
  }
  if (user.role !== ROLES.BOSS) {
    if (previousDay && input !== previousDay) {
      throw ApiError.forbidden('Only the boss can change the purchase date');
    }
    if (!previousDay && input !== today) {
      throw ApiError.forbidden('Only the boss can record a purchase with a different date');
    }
  }
  return { day: input, date: startOfBusinessDay(input) };
}

async function nextTransactionNumber(day) {
  const seq = await nextSequence(`purchase:${day}`);
  return `RWI-${day.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
}

async function buildItems(items, user) {
  const resolved = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const quantityMilli = parseQuantitySafe(item.quantity, index);
    const unitPriceKobo = parsePriceSafe(item.unitPrice, index);

    if (quantityMilli <= 0) {
      throw ApiError.badRequest(`Item ${index + 1}: quantity must be greater than zero`, {
        field: `items[${index}].quantity`
      });
    }
    if (unitPriceKobo <= 0) {
      throw ApiError.badRequest(`Item ${index + 1}: unit price must be greater than zero`, {
        field: `items[${index}].unitPrice`
      });
    }

    const product = await resolveProduct(item, user);
    resolved.push({
      product: product._id,
      productNameSnapshot: product.name,
      unitLabel: (item.unitLabel || '').trim(),
      quantityMilli,
      unitPriceKobo,
      lineTotalKobo: lineTotalKobo(quantityMilli, unitPriceKobo)
    });
  }
  return { items: resolved, totalKobo: sumKobo(resolved.map((i) => i.lineTotalKobo)) };
}

export async function createPurchase({ payload, files = [], user, req }) {
  await assertNoDuplicateWarnings(payload);

  const { day, date } = resolvePurchaseDate(payload.purchaseDate, user);
  const supplier = await resolveSupplier(payload, user);
  const { items, totalKobo } = await buildItems(payload.items, user);

  const purchase = await Purchase.create({
    transactionNumber: await nextTransactionNumber(day),
    purchaseDate: date,
    purchaseDay: day,
    recordedBy: user._id,
    recordedByName: user.name,
    supplier: supplier._id,
    supplierSnapshot: {
      name: supplier.name,
      phone: supplier.phone || '',
      address: supplier.address || ''
    },
    items,
    totalKobo,
    notes: payload.notes || '',
    attachments: []
  });

  const stored = [];
  try {
    for (const file of files) {
      stored.push(await storeAttachment({ file, purchaseId: purchase._id, user }));
    }
    if (stored.length) {
      purchase.attachments = stored.map((a) => a._id);
      await purchase.save();
    }
  } catch (err) {
    await removeAttachmentFiles(stored);
    await Attachment.deleteMany({ _id: { $in: stored.map((a) => a._id) } });
    await Purchase.deleteOne({ _id: purchase._id });
    throw err;
  }

  await recordAudit({
    req,
    actor: user,
    action: 'purchase.create',
    entityType: 'Purchase',
    entityId: purchase._id,
    transactionNumber: purchase.transactionNumber,
    newValue: {
      transactionNumber: purchase.transactionNumber,
      purchaseDate: day,
      supplier: supplier.name,
      totalKobo,
      itemCount: items.length,
      attachmentCount: stored.length
    }
  });

  return getPurchaseById(purchase._id.toString());
}

function itemComparable(item) {
  return {
    productId: String(item.product?._id || item.product),
    name: item.productNameSnapshot,
    unitLabel: item.unitLabel || '',
    quantity: milliToQuantityString(item.quantityMilli),
    unitPriceKobo: item.unitPriceKobo,
    lineTotalKobo: item.lineTotalKobo
  };
}

function diffItems(oldItems, newItems) {
  const changes = [];
  const max = Math.max(oldItems.length, newItems.length);
  for (let i = 0; i < max; i += 1) {
    const before = oldItems[i];
    const after = newItems[i];
    if (!before && after) {
      changes.push({
        field: `items[${i}]`,
        label: after.productNameSnapshot,
        oldValue: null,
        newValue: itemComparable(after)
      });
    } else if (before && !after) {
      changes.push({
        field: `items[${i}]`,
        label: before.productNameSnapshot,
        oldValue: itemComparable(before),
        newValue: null
      });
    } else if (JSON.stringify(itemComparable(before)) !== JSON.stringify(itemComparable(after))) {
      changes.push({
        field: `items[${i}]`,
        label: after.productNameSnapshot,
        oldValue: itemComparable(before),
        newValue: itemComparable(after)
      });
    }
  }
  return changes;
}

export async function updatePurchase({ purchaseId, payload, files = [], user, req }) {
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (purchase.deletedAt) {
    throw ApiError.conflict('Restore this purchase from Trash before editing it', 'PURCHASE_DELETED');
  }
  if (user.role !== ROLES.BOSS && purchase.recordedBy.toString() !== user._id.toString()) {
    throw ApiError.forbidden('You can only edit purchases you recorded');
  }

  const oldDay = purchase.purchaseDay;
  const oldSupplier = { ...purchase.supplierSnapshot.toObject() };
  const oldNotes = purchase.notes || '';
  const oldItems = purchase.items.map((it) => it.toObject());
  const oldTotal = purchase.totalKobo;

  const { day, date } = resolvePurchaseDate(payload.purchaseDate, user, previousBusinessDayOf(purchase));

  await assertNoDuplicateWarnings(payload);
  const supplier = await resolveSupplier(payload, user);
  const { items, totalKobo } = await buildItems(payload.items, user);

  const changes = [];
  if (oldDay !== day) {
    changes.push({ field: 'purchaseDate', label: 'Purchase date', oldValue: oldDay, newValue: day });
  }
  if (
    oldSupplier.name !== supplier.name ||
    oldSupplier.phone !== (supplier.phone || '') ||
    oldSupplier.address !== (supplier.address || '')
  ) {
    changes.push({
      field: 'supplier',
      label: 'Supplier',
      oldValue: oldSupplier,
      newValue: { name: supplier.name, phone: supplier.phone || '', address: supplier.address || '' }
    });
  }
  if (oldNotes !== (payload.notes || '')) {
    changes.push({ field: 'notes', label: 'Notes', oldValue: oldNotes, newValue: payload.notes || '' });
  }
  changes.push(...diffItems(oldItems, items));
  if (oldTotal !== totalKobo) {
    changes.push({ field: 'totalKobo', label: 'Transaction total', oldValue: oldTotal, newValue: totalKobo });
  }

  purchase.purchaseDate = date;
  purchase.purchaseDay = day;
  purchase.supplier = supplier._id;
  purchase.supplierSnapshot = {
    name: supplier.name,
    phone: supplier.phone || '',
    address: supplier.address || ''
  };
  purchase.items = items;
  purchase.totalKobo = totalKobo;
  purchase.notes = payload.notes || '';
  purchase.lastEditedBy = user._id;

  const removeIds = payload.removeAttachmentIds || [];
  let removedAttachments = [];
  if (removeIds.length) {
    removedAttachments = await Attachment.find({
      _id: { $in: removeIds },
      purchase: purchase._id
    });
    purchase.attachments = purchase.attachments.filter(
      (id) => !removeIds.includes(id.toString())
    );
  }

  const stored = [];
  try {
    const existingCount = purchase.attachments.length;
    if (existingCount + files.length > config.maxFilesPerPurchase) {
      throw ApiError.badRequest(
        `A purchase can have at most ${config.maxFilesPerPurchase} attachments`,
        null,
        'TOO_MANY_FILES'
      );
    }
    for (const file of files) {
      stored.push(await storeAttachment({ file, purchaseId: purchase._id, user }));
    }
    purchase.attachments.push(...stored.map((a) => a._id));

    if (changes.length) {
      purchase.revisionCount = (purchase.revisionCount || 0) + 1;
    }
    await purchase.save();

    if (removedAttachments.length) {
      await Attachment.deleteMany({ _id: { $in: removedAttachments.map((a) => a._id) } });
      await removeAttachmentFiles(removedAttachments);
    }
  } catch (err) {
    await removeAttachmentFiles(stored);
    await Attachment.deleteMany({ _id: { $in: stored.map((a) => a._id) } });
    throw err;
  }

  if (changes.length) {
    await PurchaseRevision.create({
      purchase: purchase._id,
      revisionNumber: purchase.revisionCount,
      changes,
      actor: user._id,
      actorName: user.name,
      reason: payload.reason || ''
    });

    await recordAudit({
      req,
      actor: user,
      action: 'purchase.update',
      entityType: 'Purchase',
      entityId: purchase._id,
      transactionNumber: purchase.transactionNumber,
      oldValue: { totalKobo: oldTotal, purchaseDate: oldDay },
      newValue: {
        totalKobo,
        purchaseDate: day,
        changedFields: changes.map((c) => c.field),
        revisionNumber: purchase.revisionCount
      }
    });
  }

  return getPurchaseById(purchase._id.toString());
}

function previousBusinessDayOf(purchase) {
  return purchase.purchaseDay || businessDayKey(purchase.purchaseDate);
}

export async function getPurchaseById(id, { includeDeleted = true } = {}) {
  const purchase = await Purchase.findById(id)
    .populate('attachments')
    .populate('supplier', 'name phone address isActive');
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (purchase.deletedAt && !includeDeleted) throw ApiError.notFound('Purchase not found');
  return purchase;
}

export function serializePurchase(purchase) {
  const p = purchase.toObject ? purchase.toObject() : purchase;
  return {
    id: String(p._id),
    transactionNumber: p.transactionNumber,
    purchaseDate: p.purchaseDay || businessDayKey(p.purchaseDate),
    recordedBy: {
      id: String(p.recordedBy?._id || p.recordedBy),
      name: p.recordedByName || p.recordedBy?.name || ''
    },
    supplier: {
      id: String(p.supplier?._id || p.supplier),
      name: p.supplierSnapshot?.name || p.supplier?.name || '',
      phone: p.supplierSnapshot?.phone || '',
      address: p.supplierSnapshot?.address || ''
    },
    items: (p.items || []).map((it) => ({
      id: String(it._id),
      productId: String(it.product?._id || it.product),
      name: it.productNameSnapshot,
      unitLabel: it.unitLabel || '',
      quantity: milliToQuantityString(it.quantityMilli),
      quantityMilli: it.quantityMilli,
      unitPriceKobo: it.unitPriceKobo,
      lineTotalKobo: it.lineTotalKobo
    })),
    totalKobo: p.totalKobo,
    notes: p.notes || '',
    attachments: (p.attachments || []).map((a) =>
      a && a.originalName ? serializeAttachment(a) : { id: String(a), url: `/api/attachments/${a}` }
    ),
    revisionCount: p.revisionCount || 0,
    isDeleted: Boolean(p.deletedAt),
    deletedAt: p.deletedAt || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

export function buildPurchaseFilter(filters, user) {
  const and = [];
  const status = filters.status || 'active';

  if (status === 'deleted') {
    if (user.role !== ROLES.BOSS) throw ApiError.forbidden('Only the boss can view deleted purchases');
    and.push({ deletedAt: { $ne: null } });
  } else if (status === 'all' && user.role === ROLES.BOSS) {
    // include deleted
  } else {
    and.push({ deletedAt: null });
  }

  if (filters.from || filters.to) {
    const from = filters.from || filters.to;
    const to = filters.to || filters.from;
    and.push({
      purchaseDate: {
        $gte: startOfBusinessDay(from),
        $lt: endOfBusinessDayExclusive(to)
      }
    });
  }
  if (filters.supplierId) and.push({ supplier: filters.supplierId });
  if (filters.staffId) and.push({ recordedBy: filters.staffId });
  if (filters.productId) and.push({ 'items.product': filters.productId });
  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q.trim()), 'i');
    and.push({
      $or: [
        { transactionNumber: rx },
        { 'supplierSnapshot.name': rx },
        { recordedByName: rx },
        { 'items.productNameSnapshot': rx }
      ]
    });
  }

  return and.length ? { $and: and } : {};
}

export async function listPurchases({ filters, user, page = 1, limit = 20, sort = 'purchaseDate', order = 'desc' }) {
  const filter = buildPurchaseFilter(filters, user);
  const sortSpec = { [sort === 'transactionNumber' ? 'transactionNumber' : sort]: order === 'asc' ? 1 : -1 };
  if (sort === 'purchaseDate') sortSpec.createdAt = order === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Purchase.find(filter)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('attachments'),
    Purchase.countDocuments(filter)
  ]);

  return {
    items: items.map(serializePurchase),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function softDeletePurchase({ id, user, req }) {
  const purchase = await Purchase.findById(id);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (purchase.deletedAt) throw ApiError.conflict('Purchase is already deleted', 'ALREADY_DELETED');

  purchase.deletedAt = new Date();
  purchase.deletedBy = user._id;
  await purchase.save();

  await recordAudit({
    req,
    actor: user,
    action: 'purchase.delete',
    entityType: 'Purchase',
    entityId: purchase._id,
    transactionNumber: purchase.transactionNumber,
    oldValue: {
      transactionNumber: purchase.transactionNumber,
      purchaseDate: purchase.purchaseDay,
      totalKobo: purchase.totalKobo
    }
  });

  return purchase;
}

export async function restorePurchase({ id, user, req }) {
  const purchase = await Purchase.findById(id);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (!purchase.deletedAt) throw ApiError.conflict('Purchase is not in Trash', 'NOT_DELETED');

  const deletedAt = purchase.deletedAt;
  purchase.deletedAt = null;
  purchase.deletedBy = null;
  await purchase.save();

  await recordAudit({
    req,
    actor: user,
    action: 'purchase.restore',
    entityType: 'Purchase',
    entityId: purchase._id,
    transactionNumber: purchase.transactionNumber,
    oldValue: { deletedAt },
    newValue: { transactionNumber: purchase.transactionNumber, totalKobo: purchase.totalKobo }
  });

  return purchase;
}

export async function permanentlyDeletePurchase({ id, user, req }) {
  const purchase = await Purchase.findById(id).populate('attachments');
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (!purchase.deletedAt) {
    throw ApiError.conflict('Move the purchase to Trash before deleting it permanently', 'NOT_DELETED');
  }

  const attachments = purchase.attachments || [];
  await removeAttachmentFiles(attachments);
  await Attachment.deleteMany({ purchase: purchase._id });
  await PurchaseRevision.deleteMany({ purchase: purchase._id });

  await recordAudit({
    req,
    actor: user,
    action: 'purchase.purge',
    entityType: 'Purchase',
    entityId: purchase._id,
    transactionNumber: purchase.transactionNumber,
    oldValue: {
      transactionNumber: purchase.transactionNumber,
      purchaseDate: purchase.purchaseDay,
      totalKobo: purchase.totalKobo,
      supplier: purchase.supplierSnapshot?.name,
      attachmentCount: attachments.length,
      itemCount: purchase.items.length
    }
  });

  await Purchase.deleteOne({ _id: purchase._id });
  return { id: String(purchase._id), transactionNumber: purchase.transactionNumber };
}
