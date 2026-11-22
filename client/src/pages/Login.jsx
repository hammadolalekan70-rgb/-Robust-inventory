import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Button, Field, Input } from '../components/ui.jsx';

const RESTART_CODES = new Set(['LOGIN_CODE_EXPIRED', 'LOGIN_CODE_LOCKED', 'LOGIN_CODE_MISSING']);

export default function Login() {
  const { login, verifyLogin, resendLoginCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState('credentials');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const finishLogin = () => {
    const destination = location.state?.from || '/dashboard';
    navigate(destination, { replace: true });
  };

  const resetToCredentials = () => {
    setStep('credentials');
    setChallenge(null);
    setCode('');
    setNotice('');
    setResendIn(0);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      if (result?.requiresCode) {
        setChallenge(result);
        setStep('code');
        setCode('');
        setResendIn(result.resendInSeconds ?? 60);
        return;
      }
      finishLogin();
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await verifyLogin(code.trim());
      finishLogin();
    } catch (err) {
      setError(err.message || 'Unable to verify that code. Please try again.');
      if (RESTART_CODES.has(err.code)) resetToCredentials();
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setError('');
    setNotice('');
    setResending(true);
    try {
      const result = await resendLoginCode();
      setCode('');
      setNotice('A new verification code has been sent.');
      setResendIn(result.resendInSeconds ?? 60);
    } catch (err) {
      setError(err.message || 'Unable to resend the code. Please try again.');
      if (RESTART_CODES.has(err.code)) resetToCredentials();
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="inline-block">
            <img src="/logo-horizontal.svg" alt="Robust Warehouse Inventory" className="h-11 w-auto" />
          </Link>
          <h1 className="mt-10 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {step === 'code' ? 'Check your email' : 'Sign in to your account'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {step === 'code' && challenge ? (
              <>
                We sent a 6-digit code to{' '}
                <span className="font-semibold text-slate-700">{challenge.email}</span>. It expires
                in {challenge.expiresInMinutes} minutes.
              </>
            ) : (
              'Use the account provided by your boss. Access is limited by role and verified by email.'
            )}
          </p>

          {error ? (
            <Alert tone="danger" className="mt-6">
              {error}
            </Alert>
          ) : null}

          {notice ? (
            <Alert tone="info" className="mt-6">
              {notice}
            </Alert>
          ) : null}

          {step === 'code' && challenge ? (
            <form onSubmit={onVerify} className="mt-6 space-y-4">
              <Field
                label="Verification code"
                htmlFor="code"
                required
                hint="Check your inbox and spam folder."
              >
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="000000"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="text-center text-lg font-semibold tracking-[0.35em]"
                  required
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={onResend}
                  disabled={resending || resendIn > 0}
                  className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                >
                  {resending ? 'Sending…' : resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetToCredentials();
                    setError('');
                  }}
                  className="font-semibold text-slate-500 hover:text-brand"
                >
                  Use a different account
                </button>
              </div>

              <Button
                type="submit"
                loading={submitting}
                disabled={code.length !== 6}
                className="w-full"
                size="lg"
              >
                Verify and sign in
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field label="Email address" htmlFor="email" required>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </Field>

              <Field label="Password" htmlFor="password" required>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Your password"
                    className="pr-11"
                    required
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

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">A verification code is emailed after your password.</span>
                <Link to="/forgot-password" className="font-semibold text-brand hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" loading={submitting} className="w-full" size="lg">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          <p className="mt-8 text-xs text-slate-400">
            Protected by rate limiting, CSRF protection, role-based access control and email
            verification.
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-brand lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.22),_transparent_50%)]" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <img src="/icon.svg" alt="" className="h-8 w-8" />
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">Robust</p>
              <p className="text-sm font-semibold text-white">Warehouse Inventory</p>
            </div>
          </div>
          <h2 className="mt-14 max-w-md text-3xl font-bold leading-snug text-white">
            Purchasing records you can trust, from the loading bay to the boardroom.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-slate-100">
            {[
              'Record purchases with receipts attached',
              'Track product price changes over time',
              'Export summary and detailed PDF reports',
              'Full audit history of every change'
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-100">
          <p className="flex items-center gap-2 font-semibold text-white">
            <LockKeyhole className="h-4 w-4 text-accent" />
            Secure by default
          </p>
          <p className="mt-1.5 leading-relaxed">
            Every session is authenticated, every write is validated, and every sensitive action is
            written to the audit log.
          </p>
        </div>
      </div>
    </div>
  );
}
