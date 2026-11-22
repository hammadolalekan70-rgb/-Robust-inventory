# Email, sign-in codes and password reset

The application sends two kinds of mail: a **6-digit sign-in code** after a correct password, and a
**password reset** link. Sign-in codes expire after 10 minutes, are single use and allow at most five
attempts. User creation and password changes done by a boss do not send email. If no email provider is
configured, both flows still work in development by printing the message to the server console.

Two providers are supported: **Resend** (HTTPS API) and **SMTP**. Resend takes priority when configured.

---

## Resend (recommended when SMTP ports are blocked)

Some hosts block outbound SMTP. In particular, **Render free web services block ports 25, 465 and 587**,
so Gmail SMTP hangs and sign-in never completes. Resend uses HTTPS on port 443, which is not blocked.

1. Create a free account at <https://resend.com>.
2. Verify a sending domain in Resend (or use `onboarding@resend.dev` for testing; it can only send to
   the email address that owns the Resend account).
3. Create an API key at <https://resend.com/api-keys>.
4. Configure:

```dotenv
RESEND_API_KEY=re_your_api_key
RESEND_FROM="Robust Warehouse Inventory <no-reply@yourdomain.com>"
```

`RESEND_FROM` must be an address on a domain verified in Resend. If it is empty, `MAIL_FROM` is used.
Restart the API after changing the variables.

When `RESEND_API_KEY` is set, Resend is used for every email and the `SMTP_*` settings are ignored.

---

## Gmail setup (for a VPS or paid host)

Gmail requires an **App Password**; normal account passwords cannot be used by SMTP clients.

1. Enable 2-Step Verification on the Google account:
   <https://myaccount.google.com/security>
2. Open **App passwords**: <https://myaccount.google.com/apppasswords>
3. Create an app password (name it e.g. `Robust Warehouse Inventory`).
4. Copy the 16-character password (spaces are optional; the app strips none — paste it without spaces).
5. Configure `.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=warehouse@gmail.com
SMTP_PASS=abcdefghijklmnop
MAIL_FROM="Robust Warehouse Inventory <warehouse@gmail.com>"
```

6. Restart the API.
7. Sign in as boss → sign out → **Forgot password** → enter the boss email → check the inbox.

> Gmail App Passwords are unavailable if 2-Step Verification is off, or for some Google Workspace
> accounts where the admin has disabled them. Ask the workspace administrator or use another SMTP
> provider.

### Gmail notes

- Use port `587` with `SMTP_SECURE=false` (STARTTLS), or port `465` with `SMTP_SECURE=true`.
- Set `MAIL_FROM` to the same Gmail address as `SMTP_USER`; Gmail rejects most other From addresses.
- Gmail has daily sending limits (roughly 500 recipients/day for free accounts). A warehouse reset flow
  is far below this.
- For better deliverability to external recipients, use a domain mailbox with SPF/DKIM configured.

---

## Other SMTP providers

Any standard SMTP server works. Examples:

| Provider | Host | Port | Secure |
| --- | --- | --- | --- |
| Gmail | `smtp.gmail.com` | 587 | false |
| Microsoft 365 | `smtp.office365.com` | 587 | false |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 | false |
| Mailgun | `smtp.mailgun.org` | 587 | false |
| SendGrid | `smtp.sendgrid.net` | 587 | false |

For SendGrid, `SMTP_USER` is literally `apikey` and `SMTP_PASS` is the API key. For SES, use SMTP
credentials (not IAM access keys).

---

## Configuration reference

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | Usually `587` (STARTTLS) or `465` (implicit TLS) |
| `SMTP_SECURE` | `true` for implicit TLS (465), `false` for STARTTLS (587) |
| `SMTP_USER` | SMTP username / account email |
| `SMTP_PASS` | App password / API key |
| `MAIL_FROM` | From header; use `"Name <address>"` |
| `RESEND_API_KEY` | Resend API key; enables the HTTPS email API |
| `RESEND_FROM` | Verified Resend sender; defaults to `MAIL_FROM` |
| `MAIL_DEV_CONSOLE_FALLBACK` | When no provider is configured, log the message instead of failing (development only) |
| `APP_BASE_URL` | Origin used to build the reset link; must be the public URL in production |
| `RESET_TOKEN_TTL_MINUTES` | Link lifetime (default 30) |

Email is considered configured when `RESEND_API_KEY` is set, or when `SMTP_HOST`, `SMTP_USER` and
`SMTP_PASS` are all set. Resend wins when both are configured.

### Reset link

```
{APP_BASE_URL}/reset-password?token=<single-use-token>
```

Set `APP_BASE_URL` correctly. In production with Nginx this must be `https://inventory.example.com`
(no trailing slash). A wrong value produces links that point at the wrong host even though email works.

---

## Password-reset flow

1. Anyone can request a reset at `/forgot-password`.
2. The API always answers: *“If an account exists for that email address, a password reset link has been
   sent.”* This prevents account enumeration.
3. For an **active** account, a random token is generated. Only its SHA-256 hash is stored, with an
   expiry; the raw token goes into the email.
4. The link opens the React page `/reset-password?token=…`.
5. Submitting a new password validates policy (10+ chars, letter + number), updates the hash, clears the
   token (single use), and increments `sessionVersion`, which signs out all existing sessions.
6. Success redirects to login. The action is written to the audit log.

Requesting a new reset invalidates the previous link for that user.

### Development fallback

With no email provider configured and `MAIL_DEV_CONSOLE_FALLBACK=true` (non-production), the API logs:

```
[email:dev] Email is not configured. Message not sent.
  To: boss@example.com
  Subject: Reset your Robust Warehouse Inventory password
  Body:
  … https://localhost:5173/reset-password?token=…
```

Copy the link into a browser. The fallback is disabled in production, where a missing configuration logs
an error and no email is sent (the API still returns the generic success message).

---

## Security notes

- Reset tokens are 32 random bytes, stored only as SHA-256 hashes, expire after 30 minutes and are
  single-use.
- Forgot/reset endpoints are rate limited per IP. Login is rate limited separately.
- Password change and reset bump `sessionVersion`, invalidating all sessions for that user.
- Emails are sent after the user lookup but the HTTP response is identical for unknown addresses, so
  timing is the only theoretical signal; the lookup is cheap and followed by mail I/O.
- Never log `SMTP_PASS`. Keep `.env` at mode `600`, outside version control.
- Boss-created accounts receive their initial password out-of-band (in person / password manager). The
  boss can force a reset from **Users → Reset password**, which generates a temporary password rather
  than sending mail.

---

## Testing email

### Quick check from the app

1. Sign in as boss and note the account email.
2. Sign out, choose **Forgot password**, submit that email.
3. Confirm the message arrives (also check spam/promotions).
4. Open the link, set a new password, sign in.

### SMTP connectivity check

If reset mail fails, exercise SMTP directly:

```bash
node -e "
const nodemailer=require('nodemailer');
const t=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
t.verify().then(()=>console.log('SMTP OK')).catch(e=>{console.error(e.message);process.exit(1)});
"
```

Run it with `SMTP_USER` / `SMTP_PASS` exported in the shell, from the repo root where `nodemailer` is
installed.

---

## Troubleshooting

| Error / symptom | Fix |
| --- | --- |
| `535-5.7.8 Username and Password not accepted` | Use a Gmail **App Password**, not the account password. Regenerate it and remove spaces. |
| `Invalid login: 534-5.7.9 Application-specific password required` | 2-Step Verification is off or an app password is required. |
| `ETIMEDOUT` / `ECONNREFUSED` | Host/port blocked by the network or firewall. On Render free, use `RESEND_API_KEY`; elsewhere try 465 with `SMTP_SECURE=true`. |
| Sign-in button spins for minutes | SMTP connection is hanging. Check logs for `Failed to send sign-in code`; on Render free, SMTP ports are blocked. |
| `self-signed certificate` | Corporate SMTP proxy; use a trusted endpoint or ask IT. |
| `Resend: ...` error | Check `RESEND_API_KEY` and that `RESEND_FROM` uses a domain verified in Resend. |
| Email lands in spam | Use a domain sender with SPF/DKIM, keep `MAIL_FROM` aligned with the sending account, avoid spammy subjects. |
| Link points to localhost in production | Fix `APP_BASE_URL` and restart the API. |
| Link says invalid/expired | Tokens last 30 minutes and are single-use; request a new one. |
| No email, generic success shown | Check server logs for email errors and whether the account exists and is active. |
| Reset link logged in production | `MAIL_DEV_CONSOLE_FALLBACK` should be `false`; configure Resend or SMTP instead. |
