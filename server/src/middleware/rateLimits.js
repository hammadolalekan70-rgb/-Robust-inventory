import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const skip = () => config.rateLimitDisabled || config.isTest;

function handler(message) {
  return (req, res) => {
    res.status(429).json({
      error: { code: 'TOO_MANY_REQUESTS', message }
    });
  };
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler: handler('Too many requests. Please slow down and try again shortly.')
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  handler: handler('Too many sign-in attempts. Please wait 15 minutes and try again.')
});

export const loginCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => req.ip,
  handler: handler('Too many verification attempts. Please wait 15 minutes and try again.')
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  handler: handler('Too many password reset requests. Please try again later.')
});

export const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => req.ip,
  handler: handler('Too many setup attempts. Please try again later.')
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler: handler('Too many write requests. Please slow down.')
});
