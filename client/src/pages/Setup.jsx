import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { Alert, Button, Field, Input } from '../components/ui.jsx';

function SetupShell({ title, description, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/">
          <img src="/logo-horizontal.svg" alt="Robust Warehouse Inventory" className="h-10 w-auto" />
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          <ShieldCheck className="h-3.5 w-3.5" />
          One-time admin setup
        </span>
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

export default function Setup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/setup-status')
      .then((data) => {
        if (!cancelled) setStatus(data.needsSetup ? 'ready' : 'complete');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/setup', {
        name: name.trim(),
        email: email.trim(),
        password
      });
      setStatus('done');
    } catch (err) {
      setError(err.message || 'Unable to create the admin account. Please try again.');
      setFieldErrors(err.fieldErrors?.() || {});
      if (err.code === 'SETUP_COMPLETE') setStatus('complete');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <SetupShell title="Checking setup status" description="One moment while we check this workspace.">
        <p className="text-sm text-slate-500">Loading…</p>
      </SetupShell>
    );
  }

  if (status === 'complete') {
    return (
      <SetupShell
        title="Setup already completed"
        description="An admin account already exists for this workspace. This setup page is no longer available."
        footer={
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Go to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <p>Sign in with your admin account. Additional staff or boss accounts can be created from the Users page.</p>
        </div>
      </SetupShell>
    );
  }

  if (status === 'error') {
    return (
      <SetupShell
        title="Unable to check setup"
        description="We could not reach the server. Check your connection and try again."
        footer={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-semibold text-brand hover:underline"
          >
            Retry
          </button>
        }
      >
        <Alert tone="danger">The setup status could not be loaded.</Alert>
      </SetupShell>
    );
  }

  if (status === 'done') {
    return (
      <SetupShell
        title="Admin account created"
        description="Your boss account is ready. Sign in with the email and password you just set."
        footer={
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Go to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>For security, the next sign-in will ask for a 6-digit code sent to your email address.</p>
        </div>
        <Button
          type="button"
          size="lg"
          className="mt-5 w-full"
          onClick={() => navigate('/login', { replace: true })}
        >
          Continue to sign in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </SetupShell>
    );
  }

  return (
    <SetupShell
      title="Create the admin account"
      description="This one-time setup is only available before the first admin exists. Enter your details to create the boss account for this workspace."
      footer={
        <p className="text-slate-500">
          Already set up?{' '}
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
        <Field label="Full name" htmlFor="setup-name" required error={fieldErrors.name}>
          <Input
            id="setup-name"
            type="text"
            autoComplete="name"
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Hammad Olalekan"
          />
        </Field>

        <Field label="Email address" htmlFor="setup-email" required error={fieldErrors.email}>
          <Input
            id="setup-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="setup-password"
          required
          error={fieldErrors.password}
          hint="At least 10 characters, including a letter and a number."
        >
          <div className="relative">
            <Input
              id="setup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a strong password"
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

        <Field
          label="Confirm password"
          htmlFor="setup-confirm"
          required
          error={fieldErrors.confirmPassword}
        >
          <Input
            id="setup-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat the password"
          />
        </Field>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Create admin account
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-6 text-xs text-slate-400">
        Once this account is created, this page is permanently disabled. You can add staff or more boss
        accounts from the Users page after signing in.
      </p>
    </SetupShell>
  );
}
