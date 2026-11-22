import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

let transporter = null;

const RESEND_TIMEOUT_MS = 15000;

function getTransporter() {
  if (!config.smtp.configured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return transporter;
}

export function isMailConfigured() {
  return config.resend.configured || config.smtp.configured;
}

async function sendViaResend({ to, subject, text, html }) {
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: config.resend.from,
        to: [to],
        subject,
        text,
        html
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS)
    });
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      throw new Error(`Resend request timed out after ${RESEND_TIMEOUT_MS / 1000} seconds`);
    }
    throw new Error(`Resend request failed: ${err.message}`);
  }

  if (!response.ok) {
    let message = `Resend request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.message) message = `Resend: ${data.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = await response.json().catch(() => ({}));
  return { delivered: true, provider: 'resend', messageId: data.id };
}

export async function sendMail({ to, subject, text, html }) {
  if (config.resend.configured) {
    return sendViaResend({ to, subject, text, html });
  }

  const transport = getTransporter();
  if (!transport) {
    if (config.mailDevConsoleFallback && !config.isProduction) {
      if (!config.isTest) {
        logger.warn(
          `[email:dev] Email is not configured. Message not sent.\n  To: ${to}\n  Subject: ${subject}\n  Body:\n${text}`
        );
      }
      return { delivered: false, dev: true };
    }
    throw new Error(
      'Email service is not configured. Set RESEND_API_KEY or SMTP_* environment variables.'
    );
  }
  const info = await transport.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html
  });
  return { delivered: true, provider: 'smtp', messageId: info.messageId };
}

export async function sendLoginCodeEmail({ user, code, expiresMinutes, ip }) {
  const subject = 'Your Robust Warehouse Inventory sign-in code';
  const text = [
    `Hello ${user.name},`,
    '',
    `Your sign-in verification code is: ${code}`,
    '',
    `It expires in ${expiresMinutes} minutes and can only be used once.`,
    'If you did not try to sign in, someone may have your password. Change it immediately and tell your administrator.',
    '',
    ip ? `Request made from IP address ${ip}.` : '',
    'Robust Warehouse Inventory'
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0E2E4A">
    <div style="background:#0E2E4A;padding:20px 24px;border-radius:10px 10px 0 0">
      <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.5px">ROBUST</span>
      <span style="color:#F2A007;font-size:11px;font-weight:700;letter-spacing:3px;margin-left:8px">WAREHOUSE</span>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 10px 10px">
      <p style="margin:0 0 12px">Hello ${user.name},</p>
      <p style="margin:0 0 16px;line-height:1.5">Use this code to finish signing in. It expires in ${expiresMinutes} minutes and can only be used once.</p>
      <p style="margin:0 0 20px;font-size:32px;font-weight:800;letter-spacing:8px;color:#0E2E4A">${code}</p>
      <p style="margin:0 0 16px;font-size:12px;color:#6b7280">If you did not try to sign in, someone may have your password. Change it immediately and tell your administrator.</p>
      ${ip ? `<p style="margin:0;font-size:12px;color:#6b7280">Request made from IP address ${ip}.</p>` : ''}
    </div>
  </div>`;

  return sendMail({ to: user.email, subject, text, html });
}

export async function sendPasswordResetEmail({ user, link, expiresMinutes }) {
  const subject = 'Reset your Robust Warehouse Inventory password';
  const text = [
    `Hello ${user.name},`,
    '',
    'A password reset was requested for your Robust Warehouse Inventory account.',
    `Open this link to set a new password (valid for ${expiresMinutes} minutes, single use):`,
    '',
    link,
    '',
    'If you did not request this, you can safely ignore this email — your password will not change.',
    '',
    'Robust Warehouse Inventory'
  ].join('\n');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0E2E4A">
    <div style="background:#0E2E4A;padding:20px 24px;border-radius:10px 10px 0 0">
      <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.5px">ROBUST</span>
      <span style="color:#F2A007;font-size:11px;font-weight:700;letter-spacing:3px;margin-left:8px">WAREHOUSE</span>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 10px 10px">
      <p style="margin:0 0 12px">Hello ${user.name},</p>
      <p style="margin:0 0 16px;line-height:1.5">A password reset was requested for your account. This link is valid for ${expiresMinutes} minutes and can only be used once.</p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="background:#0E2E4A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:700">Reset password</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280">If the button does not work, copy this link:</p>
      <p style="margin:0 0 16px;font-size:12px;word-break:break-all;color:#0E2E4A">${link}</p>
      <p style="margin:0;font-size:12px;color:#6b7280">If you did not request this, ignore this email — your password will not change.</p>
    </div>
  </div>`;

  return sendMail({ to: user.email, subject, text, html });
}
