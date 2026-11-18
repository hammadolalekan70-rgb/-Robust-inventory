import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

export const CSRF_COOKIE = 'rwi.csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(req, res) {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/'
  });
  return token;
}

export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
    return next(ApiError.forbidden('Invalid or missing CSRF token', 'CSRF_FAILED'));
  }
  try {
    const a = Buffer.from(cookieToken, 'utf8');
    const b = Buffer.from(headerToken, 'utf8');
    if (!crypto.timingSafeEqual(a, b)) {
      return next(ApiError.forbidden('Invalid or missing CSRF token', 'CSRF_FAILED'));
    }
  } catch {
    return next(ApiError.forbidden('Invalid or missing CSRF token', 'CSRF_FAILED'));
  }
  return next();
}

export function ensureCsrfCookie(req, res, next) {
  if (!req.cookies?.[CSRF_COOKIE]) issueCsrfToken(req, res);
  next();
}
