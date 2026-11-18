import multer from 'multer';
import { config } from '../config/env.js';
import { ATTACHMENT_MIME_EXT } from '../lib/constants.js';
import { ApiError } from '../lib/errors.js';

export const uploadAttachments = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: config.maxFilesPerPurchase,
    fields: 10,
    fieldSize: 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!ATTACHMENT_MIME_EXT[file.mimetype]) {
      return cb(
        ApiError.badRequest(
          'Only JPEG, PNG, WebP images and PDF files are allowed',
          { mimetype: file.mimetype },
          'INVALID_FILE_TYPE'
        )
      );
    }
    return cb(null, true);
  }
}).array('files', config.maxFilesPerPurchase);

const SIGNATURES = [
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP'
  },
  {
    mime: 'application/pdf',
    ext: '.pdf',
    test: (b) => b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-'
  }
];

export function sniffFileType(buffer) {
  for (const sig of SIGNATURES) {
    if (sig.test(buffer)) return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}
