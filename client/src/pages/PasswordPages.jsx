import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, MailCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { Alert, Button, Field, Input } from '../components/ui.jsx';

function AuthShell({ title, description, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/">
          <img src="/logo-horizontal.svg" alt="Robust Warehouse Inventory" className="h-10 w-auto" />
        </Link>
        <Link to="/login" className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:px-6 sm:pt-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 border-t border-slate-100 pt-4 text-sm">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Unable to send the reset email. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        description="If an active account exists for that email address, a password reset link has been sent."
        footer={
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Return to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>
            The link expires shortly and can be used once. If the email does not arrive, ask your boss
            to reset your password from the Users page.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email address on your account and we will send you a secure reset link."
      footer={
        <p className="text-slate-500">
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email address" htmlFor="reset-email" required>
          <Input
            id="reset-email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Button type="submit" className="w-full" loading={submitting}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Unable to reset your password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        title="Invalid reset link"
        description="This password reset link is missing its token."
        footer={
          <Link to="/forgot-password" className="font-semibold text-brand hover:underline">
            Request a new reset link
          </Link>
        }
      >
        <Alert tone="danger">
          Reset links expire after a short time and can only be used once. Request a new one to continue.
        </Alert>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        description="Your password has been changed and all existing sessions were signed out."
        footer={
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in with your new password
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          You can now sign in with your new password.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Use at least 10 characters, including a letter and a number."
      footer={
        <Link to="/login" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password" htmlFor="new-password" required>
          <div className="relative">
            <Input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password" required>
          <Input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={10}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" loading={submitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
