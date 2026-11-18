import { ApiError } from '../lib/errors.js';

function formatIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code
  }));
}

/**
 * Validate req.body / req.query / req.params against zod schemas.
 * Validated values replace the originals (unknown keys are stripped by zod).
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      for (const key of ['params', 'query', 'body']) {
        if (!schemas[key]) continue;
        const result = schemas[key].parse(req[key] ?? {});
        if (key === 'query') {
          for (const existing of Object.keys(req.query)) delete req.query[existing];
          Object.assign(req.query, result);
        } else {
          req[key] = result;
        }
      }
      next();
    } catch (err) {
      if (err?.issues) {
        return next(
          ApiError.badRequest('Validation failed', formatIssues(err.issues), 'VALIDATION_ERROR')
        );
      }
      return next(err);
    }
  };
}

export function parseJsonField(field) {
  return (req, _res, next) => {
    if (typeof req.body?.[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch {
        return next(ApiError.badRequest(`"${field}" must be valid JSON`, null, 'INVALID_JSON'));
      }
    }
    next();
  };
}
