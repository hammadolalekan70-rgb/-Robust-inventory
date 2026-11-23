import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.resolve(__dirname, '../..');
export const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.resolve(repoRoot, '.env') });
dotenv.config({ path: path.resolve(serverRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(repoRoot, '.env.local'), override: true });

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const int = (def, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000, 1, 65535),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/robust_warehouse_inventory'),
  MONGODB_TEST_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/robust_warehouse_inventory_test'),

  TZ: z.string().min(1).default('Africa/Lagos'),
  CURRENCY: z.string().default('NGN'),
  DASHBOARD_UNLOCK_CODE: z
    .string()
    .regex(/^\d{4}$/, 'DASHBOARD_UNLOCK_CODE must be exactly 4 digits')
    .default('0017'),

  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: int(8, 1, 720),
  COOKIE_SECURE: bool(false),
  TRUST_PROXY: int(0, 0, 10),
  RATE_LIMIT_DISABLED: bool(false),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: int(5, 1, 25),
  MAX_FILES_PER_PURCHASE: int(5, 1, 20),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: int(587, 1, 65535),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Robust Warehouse Inventory <no-reply@example.com>'),
  MAIL_DEV_CONSOLE_FALLBACK: bool(true),

  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default(''),

  GMAIL_RELAY_URL: z.string().default(''),
  GMAIL_RELAY_SECRET: z.string().default(''),

  RESET_TOKEN_TTL_MINUTES: int(30, 5, 1440)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error('Invalid environment configuration:\n' + lines.join('\n'));
  process.exit(1);
}

const e = parsed.data;
const isProduction = e.NODE_ENV === 'production';
const resolveDir = (p) => (path.isAbsolute(p) ? p : path.resolve(repoRoot, p));

export const config = {
  env: e.NODE_ENV,
  isProduction,
  isTest: e.NODE_ENV === 'test',
  repoRoot,
  serverRoot,
  port: e.PORT,
  appBaseUrl: e.APP_BASE_URL.replace(/\/$/, ''),
  clientOrigins: e.CLIENT_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),

  mongoUri: e.NODE_ENV === 'test' ? e.MONGODB_TEST_URI : e.MONGODB_URI,

  tz: e.TZ,
  currency: e.CURRENCY,
  dashboardUnlockCode: e.DASHBOARD_UNLOCK_CODE,

  sessionSecret: e.SESSION_SECRET,
  sessionTtlHours: e.SESSION_TTL_HOURS,
  cookieSecure: e.COOKIE_SECURE || (isProduction && e.COOKIE_SECURE),
  trustProxy: e.TRUST_PROXY,
  rateLimitDisabled: e.RATE_LIMIT_DISABLED,

  uploadDir: resolveDir(e.UPLOAD_DIR),
  maxUploadBytes: e.MAX_UPLOAD_MB * 1024 * 1024,
  maxUploadMb: e.MAX_UPLOAD_MB,
  maxFilesPerPurchase: e.MAX_FILES_PER_PURCHASE,

  smtp: {
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    user: e.SMTP_USER,
    pass: e.SMTP_PASS,
    from: e.MAIL_FROM,
    configured: Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS)
  },
  mailDevConsoleFallback: e.MAIL_DEV_CONSOLE_FALLBACK,
  resetTokenTtlMinutes: e.RESET_TOKEN_TTL_MINUTES,

  resend: {
    apiKey: e.RESEND_API_KEY,
    from: e.RESEND_FROM || e.MAIL_FROM,
    configured: Boolean(e.RESEND_API_KEY)
  },

  gmailRelay: {
    url: e.GMAIL_RELAY_URL,
    secret: e.GMAIL_RELAY_SECRET,
    configured: Boolean(e.GMAIL_RELAY_URL && e.GMAIL_RELAY_SECRET)
  }
};

process.env.TZ = config.tz;
