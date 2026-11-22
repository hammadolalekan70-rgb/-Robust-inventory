# Installation

This guide takes a clean machine to a working development installation. For production, continue with
[DEPLOYMENT.md](DEPLOYMENT.md).

## 1. Prerequisites

| Requirement | Version / notes |
| --- | --- |
| Node.js | 20.11 or newer (tested with 24.11) |
| npm | Bundled with Node |
| MongoDB | 7.x; local service or a connection string |
| OS | Windows, macOS or Linux |

Optional: an email provider for sign-in codes and password-reset emails — Resend (HTTPS API) or SMTP
(e.g. Gmail App Password). Without one, messages are printed to the server console in development.

### Confirm your tools

```bash
node -v
npm -v
mongod --version
```

If MongoDB is not installed, use MongoDB Community Server 7.x. On Windows, install it as a service and
confirm it is running:

```powershell
Get-Service MongoDB
```

## 2. Install dependencies

From the repository root (`ROBUST_f`):

```bash
npm install
```

This installs both workspaces and hoists dependencies into the root `node_modules`.

## 3. Create the environment file

```bash
cp .env.example .env
```

Windows (cmd/PowerShell):

```powershell
copy .env.example .env
```

Generate secrets (run twice, use one value for each variable):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open `.env` and set:

```dotenv
SESSION_SECRET=<64 hex value>
```

`SESSION_SECRET` must be exactly 64 hex characters. Keep a copy in a password manager.

### Environment reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `PORT` | `4000` | API port |
| `APP_BASE_URL` | `http://localhost:5173` | Public URL used in password-reset links |
| `CLIENT_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/robust_warehouse_inventory` | Main database |
| `MONGODB_TEST_URI` | `…/robust_warehouse_inventory_test` | Test database (never reused) |
| `TZ` | `Africa/Lagos` | Business timezone for dates and cron |
| `CURRENCY` | `NGN` | Display currency code |
| `SESSION_SECRET` | — | 64 hex chars; required |
| `SESSION_TTL_HOURS` | `8` | Session lifetime / rolling expiry |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of Express |
| `RATE_LIMIT_DISABLED` | `false` | Only for tests |
| `UPLOAD_DIR` | `./uploads` | Receipt storage (relative to repo root) |
| `MAX_UPLOAD_MB` | `5` | Per-file size limit |
| `MAX_FILES_PER_PURCHASE` | `5` | Attachments per purchase |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | `smtp.gmail.com` / `587` / `false` | Mail transport |
| `SMTP_USER` / `SMTP_PASS` | — | SMTP credentials |
| `MAIL_FROM` | `Robust Warehouse Inventory <no-reply@example.com>` | From header |
| `RESEND_API_KEY` | — | Resend API key; enables HTTPS email |
| `RESEND_FROM` | `MAIL_FROM` | Verified Resend sender address |
| `MAIL_DEV_CONSOLE_FALLBACK` | `true` | Log messages when no email provider is configured |
| `RESET_TOKEN_TTL_MINUTES` | `30` | Password-reset token lifetime |

Directories are resolved relative to the repository root, regardless of the shell's working directory.

## 4. Create the first boss account

```bash
npm run create-admin -- --name "Boss Admin" --email boss@example.com --password "ChangeMe12345"
```

- Password policy: 10–128 characters, at least one letter and one number.
- The command refuses to create a second active boss unless you pass `--force`.
- For automation, you can also set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## 5. Start the app

```bash
npm run dev
```

| URL | What |
| --- | --- |
| http://localhost:5173 | React app (Vite dev server) |
| http://localhost:4000/api/health | API/database health |
| http://localhost:4000 | API only in development |

The first load redirects to `/login`. Sign in with the boss account you created.

## 6. Run the tests

Ensure MongoDB is running, then:

```bash
npm test
```

Expected: all tests passing across authentication, first-run setup, purchases/revisions, reports/PDFs
and admin features (users, trash, audit).

The suite:

- sets `NODE_ENV=test`, so it uses `MONGODB_TEST_URI`;
- stores uploads in `.test-uploads` (git-ignored);
- disables rate limiting;
- truncates collections between tests and is safe to run repeatedly.

It creates its own boss (`boss@test.local`) and staff accounts — it does not read your development data.

## 7. Verify manually (optional)

1. Sign in as boss.
2. Create a product and supplier (or enter new ones while recording a purchase).
3. Record a purchase such as `2.5 × ₦1,250.50`; confirm the line total is `₦3,126.25`.
4. Open the dashboard and Reports; download a summary PDF.
5. Create a staff account, sign in as staff in a private window, and confirm management pages are hidden.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running. Start the service (`net start MongoDB`, `brew services start mongodb-community`, or `sudo systemctl start mongod`). Check `MONGODB_URI`. |
| `Invalid environment configuration: SESSION_SECRET` | `.env` is missing or the secret is shorter than 32 characters. Use 64 hex characters. |
| Port 4000 or 5173 already in use | Stop the other process or change `PORT` (and the Vite proxy target if needed). |
| `Invalid or missing CSRF token` | Access the app through the same origin (Vite proxy or production server) and clear stale cookies. |
| Login returns “Invalid email or password” | Confirm the account exists and is active. Boss can reset the password from **Users**. |
| Reset email never arrives | Check `RESEND_*` or `SMTP_*`; see [EMAIL.md](EMAIL.md). In development the message is printed in the server console when no provider is configured. |
| Attachment rejected | Only JPEG/PNG/WebP/PDF up to 5 MB, max 5 per purchase. The content must match its declared type. |
| Tests fail to connect | MongoDB must be reachable and `MONGODB_TEST_URI` must point to a disposable database. |

## Next steps

- [Deploy to production](DEPLOYMENT.md)
- [Configure email](EMAIL.md)
- [Review the security model](SECURITY.md)
