# Login and 6-digit code troubleshooting

## Symptom

- Signing in does not open the dashboard.
- The 6-digit verification code is not received.
- Happens on the live (production) deployment.

## How the login flow works

1. `POST /api/auth/login` checks the email and password
   (`server/src/routes/auth.routes.js`).
2. On success it generates a 6-digit code, emails it, and returns
   `202 { requiresCode: true }`.
3. `POST /api/auth/login/verify` checks the code and creates the session.
4. Only then does the client open `/dashboard`
   (`client/src/pages/Login.jsx`, `client/src/context/AuthContext.jsx`).

If step 2 fails, the client never reaches the code screen and the dashboard
never opens.

## Root causes

### 1. Email provider not configured on the live service

- In production the development console fallback is disabled
  (`server/src/config/env.js`, `MAIL_DEV_CONSOLE_FALLBACK` only applies when
  `NODE_ENV !== production`).
- If neither `RESEND_API_KEY` nor `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` is
  set, `sendMail` throws and the API returns
  `503 EMAIL_UNAVAILABLE` (`server/src/services/emailService.js`).
- Render free web services block outbound SMTP ports **25, 465 and 587**, so
  Gmail SMTP cannot work there.

### 2. Sender cannot send to the recipient

- Resend's `onboarding@resend.dev` can only send to the email address that owns
  the Resend account.
- To email staff and other recipients, a **verified domain** is required.

### 3. Wrong account email

- The login email must exist in the live database. A wrong email returns
  `401 UNAUTHORIZED` before any code is generated.
- Check the live database, or visit `/setup` if no boss account exists.

### 4. Local development only

- With no provider configured, the code is printed in the API terminal as
  `[email:dev] ... Your sign-in verification code is: 123456`.

## Diagnosis

| What you see | Cause |
| --- | --- |
| "Invalid email or password" | Account email not in the live database |
| "Could not send the verification code" | No working email provider |
| Code screen appears but no email | Provider configured but sender/domain invalid |
| Login works locally but not live | Production fallback disabled; SMTP ports blocked |
| `Resend: ...` in Render logs | Bad API key or unverified `RESEND_FROM` |

## Option A - Resend with a paid domain (recommended)

1. Create an account at <https://resend.com>.
2. Add and verify a domain you own (DNS records from Resend).
3. Create an API key with **Sending access**, restricted to the domain.
4. Set these in Render -> Environment:

```dotenv
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=Robust Warehouse Inventory <no-reply@yourdomain.com>
```

5. Redeploy and test. Recipients can be any email address; only the sender
   domain must be verified.

## Option B - Free domain via EU.org + deSEC + Resend

This is zero cost but EU.org approval is manual and can take days or weeks.

### B1. Create free DNS at deSEC

1. Sign up at <https://desec.io> and verify the email.
2. Domains -> Create Domain, e.g. `robust-inventory.ng.eu.org`.
3. Copy the nameservers shown (for example `ns1.desec.io`,
   `ns2.desec.org`).

### B2. Request the domain from EU.org

1. Register a contact handle at <https://nic.eu.org/arf/>.
2. Request a domain under an open parent such as `NG.eu.org`,
   `US.eu.org` or `NET.eu.org`.
3. Enter the name part, e.g. `robust-inventory`.
4. Enter the deSEC nameservers.
5. Wait for the approval email.

### B3. Add Resend DNS records

1. Resend -> Domains -> Add Domain -> `robust-inventory.ng.eu.org`.
2. Choose a region (Europe is closest to Nigeria).
3. Copy every record from the Records tab into deSEC exactly
   (CNAME, or TXT + MX, depending on what Resend shows). Do not proxy CNAMEs.
4. Optional DMARC: TXT `_dmarc` -> `v=DMARC1; p=none;`
5. Click Verify DNS Records. Usually minutes, up to 72 hours.

### B4. Configure Render

```dotenv
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=Robust Warehouse Inventory <no-reply@robust-inventory.ng.eu.org>
```

If a subdomain such as `send.robust-inventory.ng.eu.org` was verified, the From
address must use that subdomain.

### B5. Test

Sign in as boss, create a staff account with a Gmail address, sign out, then
sign in as the staff account. Each account receives its own code at its own
inbox.

Caveats:

- Resend may reject free/shared domains. If that happens, use a cheap paid
  domain (about USD 1-12 per year).
- New free domains can land in spam. SPF, DKIM and DMARC help.

## Option C - Mailjet free with a Gmail sender (no domain)

Mailjet's free plan allows 6,000 emails/month (200/day) and SMTP port 2525,
which Render free does not block.

1. Create a free account at <https://www.mailjet.com>.
2. Account Settings -> Senders & Domains -> Add a sender address, then verify
   the Gmail address from the confirmation email.
3. API Key Management: copy the API key and secret key.
4. Render -> Environment:

```dotenv
SMTP_HOST=in-v3.mailjet.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=<Mailjet API key>
SMTP_PASS=<Mailjet secret key>
MAIL_FROM=Robust Warehouse Inventory <your.address@gmail.com>
```

5. Redeploy. No code changes are required because the app already supports
   SMTP.

Caveats:

- Sending from a Gmail address through a third party often lands in spam, and
  some messages may not be delivered.
- Keep `RESEND_API_KEY` empty so SMTP is used.

## SMS one-time codes

SMS OTP is possible to implement but is not free for real users:

- Nigeria OTP rates are roughly NGN 4-8 per message (Termii, Arkesel,
  Africa's Talking).
- Twilio to Nigeria is about USD 0.39 per SMS.
- Free tiers are trials or sandboxes: Twilio trial credit only sends to
  verified numbers; Africa's Talking and Termii sandboxes are simulated or
  limited to test numbers.
- Production SMS also requires a registered sender ID.

Implementation work if SMS is chosen:

- Add a phone field to the User model, setup, and user creation forms.
- Add an SMS service (for example Termii) and call it from the login route.
- Validate phone numbers and add rate limits.
- Keep codes hashed in the session, as the email flow already does.

SMS providers use HTTPS APIs, which work on Render free; the cost is the
limitation.

## Code references

| Area | File |
| --- | --- |
| Login, verify, resend routes | `server/src/routes/auth.routes.js` |
| Code generation and password hashing | `server/src/services/authService.js` |
| Email and SMS-related delivery | `server/src/services/emailService.js` |
| Email configuration | `server/src/config/env.js` |
| Login and code UI | `client/src/pages/Login.jsx` |
| Auth state | `client/src/context/AuthContext.jsx` |
| 6-digit code validation | `server/src/validation/schemas.js` |

## Checklist

- [ ] Live boss account exists in the production database.
- [ ] `RESEND_API_KEY` set (or `SMTP_*` for Mailjet port 2525).
- [ ] `RESEND_FROM` uses a verified domain (or a verified Mailjet sender).
- [ ] Render environment saved and redeployed.
- [ ] Render logs show no `Failed to send sign-in code` or `Resend:` errors.
- [ ] Boss and one staff account each receive their own code.
- [ ] Staff are told to check spam.
