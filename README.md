# Robust Warehouse Inventory

A production-minded web application for **warehouse purchasing and spending management** — not stock
tracking. It replaces paper receipts and scattered spreadsheets with a single secure place to record
purchases, manage suppliers, monitor product price history and produce management reports.

Built as an npm workspace:

- **Server** — Node.js + Express 4, MongoDB + Mongoose, session authentication, PDF reports.
- **Client** — React 18 + Vite 6 + Tailwind CSS 4 + Recharts, responsive down to mobile.

---

## What it does

| Area | Capabilities |
| --- | --- |
| Purchases | Guided entry, fractional quantities, unit labels, receipt/invoice uploads (JPEG/PNG/WebP/PDF), server-calculated totals, per-day transaction numbers like `RWI-20261021-0001` |
| Products | De-duplicated directory, rename/deactivate, price history chart with min/max/average and supplier comparison |
| Suppliers | Contact directory, spending totals, duplicate warnings, deactivate/reactivate |
| Reports | Daily / weekly / monthly summaries, supplier/product/staff breakdowns, detailed transaction report, branded PDF exports |
| Dashboard | Date-range spend trend, top suppliers and products, recent purchases, active-record counts |
| Roles | **Boss** and **staff** accounts with enforced permissions; staff can only edit purchases they recorded and cannot backdate |
| Data safety | Soft-delete trash with restore, permanent delete, correction history per purchase, append-only audit log |
| Auth | Password + emailed 6-digit sign-in code, session cookies, CSRF double-submit protection, login/password-reset rate limiting, secure password reset email |

Money is stored in **integer kobo** and quantities in **integer milli-units**, so totals are exact. Totals
are always recalculated on the server; client-supplied totals are ignored. Historical purchases keep
snapshots of product names and supplier details so later directory edits never rewrite history.

---

## Quick start (development)

### Prerequisites

- Node.js **20.11+** (tested on 24.11)
- npm 10+
- MongoDB **7.x** running locally (no auth required for development)

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env        # Windows: copy .env.example .env
```

Generate a secret and paste it into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- `SESSION_SECRET` — 64 hex characters

The default database is `mongodb://127.0.0.1:27017/robust_warehouse_inventory`.

Sign-in requires a 6-digit code sent by email, so configure `SMTP_*` before logging in. With Gmail, use an
App Password as `SMTP_PASS`; see [docs/EMAIL.md](docs/EMAIL.md). In development, a missing SMTP setup logs
the code to the server console instead of failing.

### 3. Create the first boss account

```bash
npm run create-admin -- --name "Boss Admin" --email boss@example.com --password "ChangeMe12345"
```

Password policy: at least 10 characters, including a letter and a number. Re-running without `--force`
refuses to create a second boss while an active boss exists.

### 4. Run

```bash
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:4000
- Health check: http://localhost:4000/api/health

Vite proxies `/api` to the API server. The API also serves the built client in production.

---

## Production build

```bash
npm run build
NODE_ENV=production npm start
```

The Express server serves `client/dist` and falls back to `index.html` for client-side routes. Before
deploying, set at minimum:

```dotenv
NODE_ENV=production
APP_BASE_URL=https://inventory.example.com
CLIENT_ORIGINS=https://inventory.example.com
COOKIE_SECURE=true
TRUST_PROXY=1
SESSION_SECRET=<64 hex characters>
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Nginx, systemd and hardening guidance.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API with `--watch` + Vite dev server |
| `npm run build` | Build the React client into `client/dist` |
| `npm start` | Start the API/server (serves the built client if present) |
| `npm test` | Run the backend integration suite (Vitest + supertest) |
| `npm run create-admin -- --name … --email … --password …` | Create a boss account |

Run `npm test` from a machine with MongoDB available; tests use the separate
`robust_warehouse_inventory_test` database and never touch development data.

---

## Roles at a glance

| Capability | Boss | Staff |
| --- | :---: | :---: |
| Record purchases | ✅ | ✅ |
| Edit purchases | ✅ all | ✅ own only |
| Change/backdate purchase date | ✅ | ❌ |
| Delete / restore / purge purchases | ✅ | ❌ |
| Manage products & suppliers | ✅ | Create only |
| View price history | ✅ | ✅ |
| View spend reports | ✅ | ❌ |
| Manage users, view audit log, trash | ✅ | ❌ |

---

## Project structure

```
ROBUST_f/
├── assets/logo/              Brand SVGs (horizontal logo, icon, favicon, mono)
├── client/                   React + Vite frontend
│   ├── public/               favicon.svg, logo-horizontal.svg
│   └── src/
│       ├── components/       Layout, route guards, UI primitives
│       ├── context/          Auth and toast providers
│       ├── lib/              API client, money/date formatters
│       └── pages/            Dashboard, purchases, products, reports, admin…
├── docs/                     Installation, deployment, email, security, API
├── server/                   Express API
│   ├── src/
│   │   ├── config/  db/  lib/  middleware/
│   │   ├── models/           User, Product, Supplier, Purchase, Revision, Audit…
│   │   ├── routes/           auth, users, products, suppliers, purchases, reports…
│   │   ├── services/         purchasing, reports, PDF, email, audit
│   │   └── scripts/          admin creation CLI
│   └── tests/                Integration tests
├── .env.example
└── package.json              npm workspaces + root commands
```

---

## Documentation

- [Installation](docs/INSTALL.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Email / sign-in codes / password reset](docs/EMAIL.md)
- [Security model](docs/SECURITY.md)
- [API reference](docs/API.md)
- [Manual QA checklist](docs/QA_CHECKLIST.md)

---

## Notes and limits

- Currency is NGN and the business timezone is Africa/Lagos (both configurable).
- PDFs render `NGN` rather than the `₦` glyph because PDFKit's built-in fonts are WinAnsi-only.
- Uploaded files are validated by magic bytes, not just extension/MIME headers, and stored outside the
  public web root.
- Passwords use `bcryptjs` (cost 12) to avoid native-build issues on Windows/Node 24; the spec's bcrypt
  option is fully supported.

© Robust Warehouse Inventory
