import multer from 'multer';
import { config } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof ApiError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      code = 'FILE_TOO_LARGE';
      message = `Each file must be ${config.maxUploadMb} MB or smaller`;
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      status = 400;
      code = 'TOO_MANY_FILES';
      message = `You can attach at most ${config.maxFilesPerPurchase} files`;
    } else {
      status = 400;
      code = 'UPLOAD_ERROR';
      message = err.message;
    }
  } else if (err?.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err?.name === 'CastError') {
    status = 400;
    code = 'INVALID_ID';
    message = 'Invalid identifier';
  } else if (err?.code === 11000) {
    status = 409;
    code = 'DUPLICATE_KEY';
    message = 'A record with these details already exists';
    details = err.keyValue;
  } else if (['INVALID_MONEY', 'INVALID_DATE', 'INVALID_RANGE', 'INVALID_FILE_TYPE', 'INVALID_FILE_CONTENT'].includes(err?.code)) {
    status = 400;
    code = err.code;
    message = err.message;
  }

  if (status >= 500) {
    logger.error('Unhandled error:', err);
  }

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
