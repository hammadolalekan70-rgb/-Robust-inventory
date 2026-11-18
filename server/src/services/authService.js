import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';

const BCRYPT_ROUNDS = 12;

export const LOGIN_CODE_TTL_MINUTES = 10;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
export const LOGIN_CODE_RESEND_SECONDS = 60;
export const LOGIN_TEST_CODE = '123456';

export function createLoginCode() {
  if (config.isTest) return LOGIN_TEST_CODE;
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createResetToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export const PASSWORD_POLICY = {
  minLength: 10,
  maxLength: 128
};

export function passwordIssues(password) {
  const issues = [];
  if (typeof password !== 'string' || password.length < PASSWORD_POLICY.minLength) {
    issues.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
  }
  if (typeof password === 'string' && password.length > PASSWORD_POLICY.maxLength) {
    issues.push(`Password must be at most ${PASSWORD_POLICY.maxLength} characters`);
  }
  if (typeof password === 'string' && !/[A-Za-z]/.test(password)) {
    issues.push('Password must contain at least one letter');
  }
  if (typeof password === 'string' && !/\d/.test(password)) {
    issues.push('Password must contain at least one number');
  }
  return issues;
}
