import express from 'express';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { Attachment } from '../models/Attachment.js';
import { Purchase } from '../models/Purchase.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { ROLES } from '../lib/constants.js';
import { attachmentAbsolutePath, removeAttachmentFiles } from '../services/attachmentService.js';
import { recordAudit } from '../services/auditService.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validation/schemas.js';

const router = express.Router();

router.use(requireAuth);

async function loadAttachment(id) {
  const attachment = await Attachment.findById(id).populate('purchase');
  if (!attachment) throw ApiError.notFound('Attachment not found');
  if (!attachment.purchase) throw ApiError.notFound('Attachment not found');
  return attachment;
}

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const attachment = await loadAttachment(req.params.id);
    const purchase = attachment.purchase;

    if (purchase.deletedAt && req.user.role !== ROLES.BOSS) {
      throw ApiError.notFound('Attachment not found');
    }

    const abs = attachmentAbsolutePath(attachment);
    let stat;
    try {
      stat = await fsPromises.stat(abs);
    } catch {
      throw ApiError.notFound('Attachment file is missing from storage');
    }

    const encoded = encodeURIComponent(attachment.originalName);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; object-src 'none'; sandbox"
    );
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    const stream = fs.createReadStream(abs);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  })
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const attachment = await loadAttachment(req.params.id);
    const purchase = attachment.purchase;

    if (purchase.deletedAt) {
      throw ApiError.conflict('Restore this purchase before removing attachments', 'PURCHASE_DELETED');
    }
    if (req.user.role !== ROLES.BOSS && purchase.recordedBy.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('You can only remove attachments from purchases you recorded');
    }

    await Purchase.updateOne({ _id: purchase._id }, { $pull: { attachments: attachment._id } });
    await Attachment.deleteOne({ _id: attachment._id });
    await removeAttachmentFiles([attachment]);

    await recordAudit({
      req,
      actor: req.user,
      action: 'purchase.attachment_remove',
      entityType: 'Purchase',
      entityId: purchase._id,
      transactionNumber: purchase.transactionNumber,
      oldValue: { originalName: attachment.originalName, mimeType: attachment.mimeType }
    });

    res.json({ ok: true });
  })
);

export default router;
