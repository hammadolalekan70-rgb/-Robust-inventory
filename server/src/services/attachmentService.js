import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { Attachment } from '../models/Attachment.js';
import { ATTACHMENT_MIME_EXT } from '../lib/constants.js';
import { ApiError } from '../lib/errors.js';
import { sniffFileType } from '../middleware/upload.js';
import { businessDayKey } from '../lib/dates.js';

function safeOriginalName(name) {
  return String(name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 255) || 'file';
}

export async function storeAttachment({ file, purchaseId, user }) {
  if (!file?.buffer?.length) {
    throw ApiError.badRequest('Empty file upload', null, 'INVALID_FILE_CONTENT');
  }
  const sniffed = sniffFileType(file.buffer);
  if (!sniffed || !ATTACHMENT_MIME_EXT[sniffed.mime]) {
    throw ApiError.badRequest(
      'File content is not a supported JPEG, PNG, WebP image or PDF',
      { originalName: file.originalname },
      'INVALID_FILE_CONTENT'
    );
  }
  if (sniffed.mime !== file.mimetype) {
    throw ApiError.badRequest(
      'File type does not match its declared content type',
      { declared: file.mimetype, detected: sniffed.mime },
      'INVALID_FILE_CONTENT'
    );
  }

  const storedName = `${crypto.randomUUID()}${sniffed.ext}`;
  const [year, month] = businessDayKey(new Date()).split('-');
  const relDir = path.posix.join(year, month);
  const absDir = path.join(config.uploadDir, year, month);

  await fs.mkdir(absDir, { recursive: true });
  await fs.writeFile(path.join(absDir, storedName), file.buffer, { mode: 0o600 });

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

  return Attachment.create({
    purchase: purchaseId,
    originalName: safeOriginalName(file.originalname),
    storedName,
    relativePath: path.posix.join(relDir, storedName),
    mimeType: sniffed.mime,
    size: file.size ?? file.buffer.length,
    sha256,
    uploadedBy: user._id
  });
}

export function attachmentAbsolutePath(attachment) {
  const root = path.resolve(config.uploadDir);
  const abs = path.resolve(root, attachment.relativePath);
  if (!abs.startsWith(root + path.sep)) {
    throw ApiError.badRequest('Invalid attachment path', null, 'INVALID_FILE_PATH');
  }
  return abs;
}

export async function removeAttachmentFiles(attachments) {
  await Promise.all(
    (attachments || []).map(async (att) => {
      try {
        await fs.unlink(attachmentAbsolutePath(att));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    })
  );
}

export function serializeAttachment(att) {
  return {
    id: att._id?.toString?.() || att.id,
    originalName: att.originalName,
    mimeType: att.mimeType,
    size: att.size,
    sha256: att.sha256,
    uploadedBy: att.uploadedBy?.toString?.() || att.uploadedBy,
    createdAt: att.createdAt,
    url: `/api/attachments/${att._id?.toString?.() || att.id}`
  };
}
