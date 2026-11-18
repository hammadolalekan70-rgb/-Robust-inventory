import express from 'express';
import { Purchase } from '../models/Purchase.js';
import { PurchaseRevision } from '../models/PurchaseRevision.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { ROLES } from '../lib/constants.js';
import { config } from '../config/env.js';
import {
  createPurchase,
  listPurchases,
  permanentlyDeletePurchase,
  restorePurchase,
  serializePurchase,
  softDeletePurchase,
  updatePurchase
} from '../services/purchaseService.js';
import { recordAudit } from '../services/auditService.js';
import { serializeAttachment, storeAttachment } from '../services/attachmentService.js';
import { requireAuth, requireBoss } from '../middleware/auth.js';
import { validate, parseJsonField } from '../middleware/validate.js';
import { uploadAttachments } from '../middleware/upload.js';
import {
  idParam,
  listPurchasesQuery,
  purchasePayloadSchema
} from '../validation/schemas.js';

const router = express.Router();

router.use(requireAuth);

function unwrapPayload(req, _res, next) {
  if (req.body?.payload && typeof req.body.payload === 'object') {
    req.body = req.body.payload;
  }
  next();
}

async function loadPurchasesForUser(id, user, { allowDeleted = false } = {}) {
  const purchase = await Purchase.findById(id)
    .populate('attachments')
    .populate('supplier', 'name phone address isActive');
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (purchase.deletedAt && !allowDeleted && user.role !== ROLES.BOSS) {
    throw ApiError.notFound('Purchase not found');
  }
  return purchase;
}

router.get(
  '/',
  validate({ query: listPurchasesQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, sort, order, ...filters } = req.query;
    const result = await listPurchases({ filters, user: req.user, page, limit, sort, order });
    res.json(result);
  })
);

router.post(
  '/',
  uploadAttachments,
  parseJsonField('payload'),
  unwrapPayload,
  validate({ body: purchasePayloadSchema }),
  asyncHandler(async (req, res) => {
    const purchase = await createPurchase({
      payload: req.body,
      files: req.files || [],
      user: req.user,
      req
    });
    res.status(201).json({ purchase: serializePurchase(purchase) });
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const purchase = await loadPurchasesForUser(req.params.id, req.user);
    res.json({ purchase: serializePurchase(purchase) });
  })
);

router.patch(
  '/:id',
  validate({ params: idParam }),
  uploadAttachments,
  parseJsonField('payload'),
  unwrapPayload,
  validate({ body: purchasePayloadSchema }),
  asyncHandler(async (req, res) => {
    const purchase = await updatePurchase({
      purchaseId: req.params.id,
      payload: req.body,
      files: req.files || [],
      user: req.user,
      req
    });
    res.json({ purchase: serializePurchase(purchase) });
  })
);

router.delete(
  '/:id',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const purchase = await softDeletePurchase({ id: req.params.id, user: req.user, req });
    res.json({ ok: true, purchase: serializePurchase(purchase) });
  })
);

router.post(
  '/:id/restore',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const purchase = await restorePurchase({ id: req.params.id, user: req.user, req });
    const full = await loadPurchasesForUser(purchase._id.toString(), req.user, { allowDeleted: true });
    res.json({ ok: true, purchase: serializePurchase(full) });
  })
);

router.delete(
  '/:id/permanent',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const result = await permanentlyDeletePurchase({ id: req.params.id, user: req.user, req });
    res.json({ ok: true, ...result });
  })
);

router.get(
  '/:id/revisions',
  requireBoss,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const purchase = await Purchase.findById(req.params.id).lean();
    if (!purchase) throw ApiError.notFound('Purchase not found');

    const revisions = await PurchaseRevision.find({ purchase: purchase._id })
      .sort({ revisionNumber: -1 })
      .lean();

    res.json({
      purchaseId: String(purchase._id),
      transactionNumber: purchase.transactionNumber,
      revisionCount: purchase.revisionCount || 0,
      revisions: revisions.map((r) => ({
        id: r._id.toString(),
        revisionNumber: r.revisionNumber,
        actorName: r.actorName,
        reason: r.reason || '',
        changes: r.changes,
        createdAt: r.createdAt
      }))
    });
  })
);

router.post(
  '/:id/attachments',
  uploadAttachments,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const purchase = await loadPurchasesForUser(req.params.id, req.user);
    if (purchase.deletedAt) {
      throw ApiError.conflict('Restore this purchase before adding attachments', 'PURCHASE_DELETED');
    }
    if (req.user.role !== ROLES.BOSS && purchase.recordedBy.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('You can only attach files to purchases you recorded');
    }
    const files = req.files || [];
    if (!files.length) throw ApiError.badRequest('No files were uploaded', null, 'NO_FILES');

    if (purchase.attachments.length + files.length > config.maxFilesPerPurchase) {
      throw ApiError.badRequest(
        `A purchase can have at most ${config.maxFilesPerPurchase} attachments`,
        null,
        'TOO_MANY_FILES'
      );
    }

    const stored = [];
    try {
      for (const file of files) {
        stored.push(await storeAttachment({ file, purchaseId: purchase._id, user: req.user }));
      }
      purchase.attachments.push(...stored.map((a) => a._id));
      await purchase.save();
    } catch (err) {
      const { removeAttachmentFiles } = await import('../services/attachmentService.js');
      await removeAttachmentFiles(stored);
      const { Attachment } = await import('../models/Attachment.js');
      await Attachment.deleteMany({ _id: { $in: stored.map((a) => a._id) } });
      throw err;
    }

    await recordAudit({
      req,
      actor: req.user,
      action: 'purchase.attachment_add',
      entityType: 'Purchase',
      entityId: purchase._id,
      transactionNumber: purchase.transactionNumber,
      newValue: { count: stored.length, files: stored.map((s) => s.originalName) }
    });

    res.status(201).json({
      attachments: stored.map(serializeAttachment)
    });
  })
);

export default router;
