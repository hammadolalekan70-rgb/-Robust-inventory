import express from 'express';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  createLoginCode,
  createResetToken,
  hashPassword,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_RESEND_SECONDS,
  LOGIN_CODE_TTL_MINUTES,
  PASSWORD_POLICY,
  passwordIssues,
  sha256,
  verifyPassword
} from '../services/authService.js';
import { recordAudit } from '../services/auditService.js';
import { sendLoginCodeEmail, sendPasswordResetEmail } from '../services/emailService.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import { ROLES } from '../lib/constants.js';
import {
  loginCodeLimiter,
  loginLimiter,
  passwordResetLimiter,
  setupLimiter
} from '../middleware/rateLimits.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginCodeSchema,
  loginSchema,
  resetPasswordSchema,
  setupAdminSchema
} from '../validation/schemas.js';

const router = express.Router();

let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('timing-protection-placeholder');
  }
  return dummyHashPromise;
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

async function discardLoginChallenge(req) {
  delete req.session.pendingLogin;
  await saveSession(req);
}

router.get(
  '/csrf',
  asyncHandler(async (req, res) => {
    res.json({ csrfToken: issueCsrfToken(req, res) });
  })
);

router.get(
  '/setup-status',
  asyncHandler(async (_req, res) => {
    const adminExists = await User.exists({ role: ROLES.BOSS });
    res.json({ needsSetup: !adminExists });
  })
);

router.post(
  '/setup',
  setupLimiter,
  validate({ body: setupAdminSchema }),
  asyncHandler(async (req, res) => {
    const adminExists = await User.exists({ role: ROLES.BOSS });
    if (adminExists) {
      throw ApiError.conflict(
        'Setup has already been completed. Please sign in instead.',
        'SETUP_COMPLETE'
      );
    }

    const { name, email, password } = req.body;

    const issues = passwordIssues(password);
    if (issues.length) throw ApiError.badRequest(issues[0], { password: issues }, 'WEAK_PASSWORD');

    const existing = await User.findOne({ email });
    if (existing) {
      throw ApiError.conflict('An account with this email address already exists', 'EMAIL_TAKEN');
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: ROLES.BOSS,
      isActive: true
    });

    await recordAudit({
      req,
      actor: user,
      action: 'auth.setup_admin',
      entityType: 'User',
      entityId: user._id,
      newValue: { name: user.name, email: user.email, role: user.role }
    });

    res.status(201).json({ user: user.toSafeJSON() });
  })
);

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    const passwordHash = user?.passwordHash || (await dummyHash());
    const valid = await verifyPassword(password, passwordHash);

    if (!user || !valid || !user.isActive) {
      await recordAudit({
        req,
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user?._id || null,
        newValue: { email, reason: !user ? 'unknown_email' : !valid ? 'bad_password' : 'inactive' }
      });
      throw ApiError.unauthorized('Invalid email or password.');
    }

    await regenerateSession(req);

    const code = createLoginCode();
    const codeHash = await hashPassword(code);
    try {
      await sendLoginCodeEmail({
        user,
        code,
        expiresMinutes: LOGIN_CODE_TTL_MINUTES,
        ip: req.ip
      });
    } catch (err) {
      logger.error('Failed to send sign-in code:', err.message);
      throw new ApiError(
        503,
        'EMAIL_UNAVAILABLE',
        'Could not send the verification code. Please contact your administrator.'
      );
    }

    req.session.pendingLogin = {
      userId: user._id.toString(),
      sessionVersion: user.sessionVersion,
      email: user.email,
      codeHash,
      expiresAt: Date.now() + LOGIN_CODE_TTL_MINUTES * 60 * 1000,
      attempts: 0,
      lastSentAt: Date.now()
    };
    await saveSession(req);

    await recordAudit({
      req,
      actor: user,
      action: 'auth.login_code_sent',
      entityType: 'User',
      entityId: user._id
    });

    res.status(202).json({
      requiresCode: true,
      email: maskEmail(user.email),
      expiresInMinutes: LOGIN_CODE_TTL_MINUTES,
      resendInSeconds: LOGIN_CODE_RESEND_SECONDS
    });
  })
);

router.post(
  '/login/verify',
  loginCodeLimiter,
  validate({ body: loginCodeSchema }),
  asyncHandler(async (req, res) => {
    const pending = req.session.pendingLogin;
    if (!pending?.userId || !pending.codeHash) {
      throw ApiError.badRequest(
        'Sign in again to request a new verification code.',
        null,
        'LOGIN_CODE_MISSING'
      );
    }

    if (Date.now() > Number(pending.expiresAt)) {
      await discardLoginChallenge(req);
      throw ApiError.badRequest(
        'That verification code has expired. Sign in again to request a new one.',
        null,
        'LOGIN_CODE_EXPIRED'
      );
    }

    if (Number(pending.attempts || 0) >= LOGIN_CODE_MAX_ATTEMPTS) {
      await discardLoginChallenge(req);
      throw ApiError.tooMany(
        'Too many incorrect attempts. Sign in again to request a new code.',
        'LOGIN_CODE_LOCKED'
      );
    }

    const user = await User.findById(pending.userId);
    if (
      !user ||
      !user.isActive ||
      Number(user.sessionVersion) !== Number(pending.sessionVersion)
    ) {
      await discardLoginChallenge(req);
      throw ApiError.unauthorized(
        'Your sign-in attempt is no longer valid. Please sign in again.',
        'SESSION_INVALID'
      );
    }

    const valid = await verifyPassword(req.body.code, pending.codeHash);
    if (!valid) {
      pending.attempts = Number(pending.attempts || 0) + 1;
      const locked = pending.attempts >= LOGIN_CODE_MAX_ATTEMPTS;
      if (locked) {
        delete req.session.pendingLogin;
      }
      await saveSession(req);

      await recordAudit({
        req,
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user._id,
        newValue: {
          email: user.email,
          reason: locked ? 'invalid_code_attempts' : 'invalid_code'
        }
      });

      if (locked) {
        throw ApiError.tooMany(
          'Too many incorrect attempts. Sign in again to request a new code.',
          'LOGIN_CODE_LOCKED'
        );
      }
      throw ApiError.unauthorized('That verification code is not correct.', 'LOGIN_CODE_INVALID');
    }

    await regenerateSession(req);
    req.session.userId = user._id.toString();
    req.session.sessionVersion = user.sessionVersion;
    req.session.loginAt = new Date().toISOString();
    await saveSession(req);

    user.lastLoginAt = new Date();
    await user.save();

    await recordAudit({
      req,
      actor: user,
      action: 'auth.login',
      entityType: 'User',
      entityId: user._id,
      newValue: { method: 'password+email_code' }
    });

    res.json({ user: user.toSafeJSON(), csrfToken: issueCsrfToken(req, res) });
  })
);

router.post(
  '/login/resend',
  loginCodeLimiter,
  asyncHandler(async (req, res) => {
    const pending = req.session.pendingLogin;
    if (!pending?.userId) {
      throw ApiError.badRequest(
        'Sign in again to request a new verification code.',
        null,
        'LOGIN_CODE_MISSING'
      );
    }

    const elapsed = Date.now() - Number(pending.lastSentAt || 0);
    if (!config.rateLimitDisabled && elapsed < LOGIN_CODE_RESEND_SECONDS * 1000) {
      throw ApiError.tooMany(
        `Please wait ${Math.ceil(
          (LOGIN_CODE_RESEND_SECONDS * 1000 - elapsed) / 1000
        )} seconds before requesting another code.`,
        'LOGIN_CODE_COOLDOWN'
      );
    }

    const user = await User.findById(pending.userId);
    if (
      !user ||
      !user.isActive ||
      Number(user.sessionVersion) !== Number(pending.sessionVersion)
    ) {
      await discardLoginChallenge(req);
      throw ApiError.unauthorized(
        'Your sign-in attempt is no longer valid. Please sign in again.',
        'SESSION_INVALID'
      );
    }

    const code = createLoginCode();
    const codeHash = await hashPassword(code);
    try {
      await sendLoginCodeEmail({
        user,
        code,
        expiresMinutes: LOGIN_CODE_TTL_MINUTES,
        ip: req.ip
      });
    } catch (err) {
      logger.error('Failed to resend sign-in code:', err.message);
      throw new ApiError(
        503,
        'EMAIL_UNAVAILABLE',
        'Could not send the verification code. Please contact your administrator.'
      );
    }

    pending.codeHash = codeHash;
    pending.expiresAt = Date.now() + LOGIN_CODE_TTL_MINUTES * 60 * 1000;
    pending.attempts = 0;
    pending.lastSentAt = Date.now();
    await saveSession(req);

    await recordAudit({
      req,
      actor: user,
      action: 'auth.login_code_sent',
      entityType: 'User',
      entityId: user._id,
      newValue: { resent: true }
    });

    res.json({
      sent: true,
      email: maskEmail(user.email),
      expiresInMinutes: LOGIN_CODE_TTL_MINUTES,
      resendInSeconds: LOGIN_CODE_RESEND_SECONDS
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const user = req.session?.userId ? await User.findById(req.session.userId) : null;
    if (user) {
      await recordAudit({
        req,
        actor: user,
        action: 'auth.logout',
        entityType: 'User',
        entityId: user._id
      });
    }
    await new Promise((resolve) => {
      if (!req.session) return resolve();
      req.session.destroy(() => resolve());
    });
    res.clearCookie('rwi.sid', { path: '/' });
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toSafeJSON(), csrfToken: issueCsrfToken(req, res) });
  })
);

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email, isActive: true });

    if (user) {
      const { raw, hash } = createResetToken();
      user.resetTokenHash = hash;
      user.resetTokenExpiresAt = new Date(Date.now() + config.resetTokenTtlMinutes * 60 * 1000);
      await user.save();

      const link = `${config.appBaseUrl}/reset-password?token=${encodeURIComponent(raw)}`;
      try {
        await sendPasswordResetEmail({
          user,
          link,
          expiresMinutes: config.resetTokenTtlMinutes
        });
      } catch (err) {
        logger.error('Failed to send password reset email:', err.message);
      }

      await recordAudit({
        req,
        action: 'auth.password_reset_requested',
        entityType: 'User',
        entityId: user._id,
        newValue: { email }
      });
    }

    res.json({
      ok: true,
      message: 'If an account exists for that email address, a password reset link has been sent.'
    });
  })
);

router.post(
  '/reset-password',
  passwordResetLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const issues = passwordIssues(password);
    if (issues.length) throw ApiError.badRequest(issues[0], { password: issues }, 'WEAK_PASSWORD');

    const user = await User.findOne({
      resetTokenHash: sha256(token),
      resetTokenExpiresAt: { $gt: new Date() }
    }).select('+resetTokenHash +resetTokenExpiresAt');

    if (!user || !user.isActive) {
      throw ApiError.badRequest(
        'This password reset link is invalid or has expired. Request a new one.',
        null,
        'INVALID_RESET_TOKEN'
      );
    }

    user.passwordHash = await hashPassword(password);
    user.passwordChangedAt = new Date();
    user.sessionVersion += 1;
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();

    await recordAudit({
      req,
      actor: user,
      action: 'auth.password_reset_completed',
      entityType: 'User',
      entityId: user._id
    });

    res.json({ ok: true, message: 'Your password has been updated. You can now sign in.' });
  })
);

router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+passwordHash');

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw ApiError.badRequest('Current password is incorrect', null, 'INVALID_PASSWORD');

    if (currentPassword === newPassword) {
      throw ApiError.badRequest('New password must be different from the current password');
    }
    const issues = passwordIssues(newPassword);
    if (issues.length) throw ApiError.badRequest(issues[0], { password: issues }, 'WEAK_PASSWORD');

    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    user.sessionVersion += 1;
    await user.save();

    req.session.sessionVersion = user.sessionVersion;
    await saveSession(req);

    await recordAudit({
      req,
      actor: user,
      action: 'auth.password_changed',
      entityType: 'User',
      entityId: user._id
    });

    res.json({ ok: true, message: 'Password updated successfully.' });
  })
);

router.get('/policy', (_req, res) => {
  res.json({ passwordPolicy: PASSWORD_POLICY });
});

export default router;
