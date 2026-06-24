import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Navigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import { login, selectAuth } from '../features/auth/authSlice.js';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { status, error } = useSelector(selectAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const emailError = touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'Enter a valid email' : '';
  const pwError = touched.password && !form.password ? 'Password is required' : '';

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!form.email || !form.password) return;
    setSubmitting(true);
    const res = await dispatch(login(form));
    setSubmitting(false);
    if (login.fulfilled.match(res)) navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel (desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-xl font-extrabold">X</div>
          <span className="text-lg font-bold">XYZ HRMS</span>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight">Manage your<br />workforce, end&#8209;to&#8209;end.</h1>
          <p className="mt-4 max-w-md text-primary-100/80">
            Onboarding, dynamic offer letters with e&#8209;signatures, a secure document vault and automated payslips — all in one place.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-primary-100/70">
          <ShieldCheck size={18} /> Enterprise-grade security · JWT protected
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-surface px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-xl font-extrabold text-white">X</div>
            <span className="text-lg font-bold text-ink">XYZ HRMS</span>
          </div>

          <h2 className="text-2xl font-bold text-ink">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Sign in to your HRMS portal.</p>

          {error && (
            <div className="mt-5 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              id="email" type="email" label="Work email" placeholder="you@xyz.com" icon={Mail}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              error={emailError} autoComplete="email" autoFocus
            />
            <div>
              <Input
                id="password" type={showPw ? 'text' : 'password'} label="Password" placeholder="••••••••" icon={Lock}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={pwError} autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPw((s) => !s)}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary-600">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />} {showPw ? 'Hide' : 'Show'} password
              </button>
            </div>

            <Button type="submit" className="w-full" loading={submitting}>Sign in</Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted">© 2026 XYZ Software Solutions Pvt Ltd</p>
        </div>
      </div>
    </div>
  );
}
