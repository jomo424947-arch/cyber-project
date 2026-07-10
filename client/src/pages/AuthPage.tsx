import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import type { User } from '../types';

// ─── View Types ──────────────────────────────────────────────────────────────
type View = 'login' | 'signup' | 'forgot' | 'reset' | 'verify';

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AuthPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Determine initial view from URL search params (e.g. ?view=reset&token=…)
  const initialView = (searchParams.get('view') as View | null) ?? 'login';
  const urlToken = searchParams.get('token') ?? '';
  const oauthError = searchParams.get('error');

  const [view, setView] = useState<View>(initialView);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [resetToken, setResetToken] = useState(urlToken);
  const [newPassword, setNewPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(oauthError ? 'Google sign-in failed. Please try again.' : null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const switchView = useCallback((next: View) => {
    resetForm();
    setView(next);
  }, [resetForm]);

  // Auto-detect reset password token from URL hash (Supabase email links)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.slice(1));
      const type = params.get('type');
      const tokenHash = params.get('token_hash') ?? params.get('access_token') ?? '';

      if (type === 'recovery' && tokenHash) {
        setResetToken(tokenHash);
        setView('reset');
        // Clean up the URL hash
        window.history.replaceState(null, '', window.location.pathname);
      } else if (type === 'email' && tokenHash) {
        setView('verify');
        handleVerifyToken(tokenHash);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuccess = (u: User) => {
    setUser(u);
    navigate('/dashboard', { replace: true });
  };

  // ─── Login ────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }

    setLoading(true);
    try {
      const { user } = await dataService.login(email.trim(), password, rememberMe);
      handleSuccess(user);
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid email or password.'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Signup ───────────────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    if (!email.trim()) { setError('Email is required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const result = await dataService.signup(email.trim(), password, fullName.trim() || undefined);
      if (result.user) {
        handleSuccess(result.user);
      } else {
        setSuccess(result.message || 'Check your email to confirm your account, then sign in.');
        switchView('login');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot Password ──────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    if (!email.trim()) { setError('Please enter your email address.'); return; }

    setLoading(true);
    try {
      const { message } = await dataService.forgotPassword(email.trim());
      setSuccess(message);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to send reset email. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Reset Password ───────────────────────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    if (!resetToken) { setError('Reset token is missing. Please use the link from your email.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setLoading(true);
    try {
      const { message } = await dataService.resetPassword(resetToken, newPassword);
      setSuccess(message);
      setTimeout(() => switchView('login'), 2000);
    } catch (err) {
      setError(apiErrorMessage(err, 'Reset failed. The link may have expired. Please request a new one.'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Verify Email ─────────────────────────────────────────────────────────
  const handleVerifyToken = async (token: string) => {
    setLoading(true);
    try {
      const { user, message } = await dataService.verifyEmail(token);
      setSuccess(message);
      setTimeout(() => handleSuccess(user), 1500);
    } catch (err) {
      setError(apiErrorMessage(err, 'Verification failed. The link may have expired.'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Google OAuth ─────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    resetForm();
    setLoading(true);
    try {
      const { url } = await dataService.getGoogleOAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not start Google sign-in.'));
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* ─── Left Panel ──────────────────────────────────────── */}
        <aside className="auth-left">
          <div className="auth-brand">
            <span className="auth-logo-mark">⬡</span>
            <span className="auth-logo-text">CCMS</span>
          </div>
          <p className="auth-eyebrow">CYBER CAFÉ MANAGEMENT</p>

          <div className="auth-left-content">
            {view === 'signup' ? (
              <>
                <h1 className="auth-headline">Join the network.</h1>
                <p className="auth-subline">Create your account and manage sessions, billing, and reservations.</p>
              </>
            ) : view === 'forgot' || view === 'reset' ? (
              <>
                <h1 className="auth-headline">Recover access.</h1>
                <p className="auth-subline">We'll send you a secure link to reset your password.</p>
              </>
            ) : view === 'verify' ? (
              <>
                <h1 className="auth-headline">Verify your email.</h1>
                <p className="auth-subline">One quick step to activate your account.</p>
              </>
            ) : (
              <>
                <h1 className="auth-headline">Welcome back.</h1>
                <p className="auth-subline">Sign in to run your café operations in real time.</p>
              </>
            )}
          </div>

          <div className="auth-left-switch">
            {(view === 'login' || view === 'forgot' || view === 'reset') && (
              <>
                <span>Don't have an account?</span>
                <button className="auth-link-btn" onClick={() => switchView('signup')}>Sign up</button>
              </>
            )}
            {view === 'signup' && (
              <>
                <span>Already have an account?</span>
                <button className="auth-link-btn" onClick={() => switchView('login')}>Sign in</button>
              </>
            )}
          </div>
        </aside>

        {/* ─── Right Panel ─────────────────────────────────────── */}
        <section className="auth-right">
          <div className="auth-form-wrapper">

            {/* ── Login ── */}
            {view === 'login' && (
              <>
                <h2 className="auth-form-title">Sign in to CCMS</h2>
                <p className="auth-form-subtitle">Enter your credentials to access the dashboard.</p>

                <form onSubmit={handleLogin} className="auth-form" noValidate>
                  <Field label="Email">
                    <input
                      id="auth-email"
                      type="email"
                      className="ccms-input"
                      placeholder="you@cafe.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoFocus
                    />
                  </Field>

                  <Field label="Password">
                    <div className="password-wrapper">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        className="ccms-input"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      <button type="button" className="pw-toggle" onClick={() => setShowPassword(v => !v)} tabIndex={-1} aria-label="Toggle password visibility">
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </Field>

                  <div className="auth-row">
                    <label className="remember-label">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="remember-checkbox"
                      />
                      <span>Remember me</span>
                    </label>
                    <button type="button" className="auth-link-btn forgot-link" onClick={() => switchView('forgot')}>
                      Forgot password?
                    </button>
                  </div>

                  {error && <AlertBox type="error" message={error} />}
                  {success && <AlertBox type="success" message={success} />}

                  <button type="submit" className="ccms-btn ccms-btn-primary auth-submit" disabled={loading}>
                    {loading ? <Spinner /> : null}
                    Sign In
                  </button>
                </form>

                <Divider />

                <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
                  <GoogleIcon />
                  Sign in with Google
                </button>

                <p className="auth-foot">
                  Don't have an account?{' '}
                  <button className="auth-link-btn" onClick={() => switchView('signup')}>Sign up</button>
                </p>
              </>
            )}

            {/* ── Sign Up ── */}
            {view === 'signup' && (
              <>
                <h2 className="auth-form-title">Create your account</h2>
                <p className="auth-form-subtitle">Enter your details to get started.</p>

                <form onSubmit={handleSignup} className="auth-form" noValidate>
                  <Field label="Full Name">
                    <input
                      id="auth-fullname"
                      type="text"
                      className="ccms-input"
                      placeholder="Alex Chen"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      autoFocus
                    />
                  </Field>

                  <Field label="Email">
                    <input
                      id="auth-signup-email"
                      type="email"
                      className="ccms-input"
                      placeholder="you@cafe.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </Field>

                  <Field label="Password" hint="At least 8 characters.">
                    <div className="password-wrapper">
                      <input
                        id="auth-signup-password"
                        type={showPassword ? 'text' : 'password'}
                        className="ccms-input"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button type="button" className="pw-toggle" onClick={() => setShowPassword(v => !v)} tabIndex={-1} aria-label="Toggle password visibility">
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                    {password.length > 0 && <PasswordStrength password={password} />}
                  </Field>

                  <Field label="Confirm Password">
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      className="ccms-input"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </Field>

                  {error && <AlertBox type="error" message={error} />}
                  {success && <AlertBox type="success" message={success} />}

                  <button type="submit" className="ccms-btn ccms-btn-primary auth-submit" disabled={loading}>
                    {loading ? <Spinner /> : null}
                    Create Account
                  </button>
                </form>

                <Divider />

                <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
                  <GoogleIcon />
                  Sign up with Google
                </button>

                <p className="auth-foot">
                  Already have an account?{' '}
                  <button className="auth-link-btn" onClick={() => switchView('login')}>Sign in</button>
                </p>
              </>
            )}

            {/* ── Forgot Password ── */}
            {view === 'forgot' && (
              <>
                <button className="auth-back-btn" onClick={() => switchView('login')}>
                  ← Back to sign in
                </button>
                <h2 className="auth-form-title">Forgot your password?</h2>
                <p className="auth-form-subtitle">
                  Enter your email and we'll send you a secure link to reset your password.
                </p>

                <form onSubmit={handleForgot} className="auth-form" noValidate>
                  <Field label="Email">
                    <input
                      id="auth-forgot-email"
                      type="email"
                      className="ccms-input"
                      placeholder="you@cafe.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoFocus
                    />
                  </Field>

                  {error && <AlertBox type="error" message={error} />}
                  {success && <AlertBox type="success" message={success} />}

                  <button type="submit" className="ccms-btn ccms-btn-primary auth-submit" disabled={loading || !!success}>
                    {loading ? <Spinner /> : null}
                    Send Reset Link
                  </button>
                </form>
              </>
            )}

            {/* ── Reset Password ── */}
            {view === 'reset' && (
              <>
                <h2 className="auth-form-title">Set a new password</h2>
                <p className="auth-form-subtitle">Enter your new password below.</p>

                <form onSubmit={handleReset} className="auth-form" noValidate>
                  <Field label="New Password" hint="At least 8 characters.">
                    <div className="password-wrapper">
                      <input
                        id="auth-new-password"
                        type={showPassword ? 'text' : 'password'}
                        className="ccms-input"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        autoFocus
                      />
                      <button type="button" className="pw-toggle" onClick={() => setShowPassword(v => !v)} tabIndex={-1} aria-label="Toggle password visibility">
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                    {newPassword.length > 0 && <PasswordStrength password={newPassword} />}
                  </Field>

                  {error && <AlertBox type="error" message={error} />}
                  {success && <AlertBox type="success" message={success} />}

                  <button type="submit" className="ccms-btn ccms-btn-primary auth-submit" disabled={loading || !!success}>
                    {loading ? <Spinner /> : null}
                    Update Password
                  </button>
                </form>
              </>
            )}

            {/* ── Email Verification ── */}
            {view === 'verify' && (
              <div className="auth-verify-box">
                {loading ? (
                  <>
                    <div className="auth-verify-icon pulse">✉</div>
                    <h2 className="auth-form-title">Verifying your email…</h2>
                    <Spinner />
                  </>
                ) : success ? (
                  <>
                    <div className="auth-verify-icon success-icon">✓</div>
                    <h2 className="auth-form-title">Email Verified!</h2>
                    <p className="auth-form-subtitle">{success}</p>
                    <p className="auth-form-subtitle" style={{ opacity: 0.6 }}>Redirecting you…</p>
                  </>
                ) : (
                  <>
                    <div className="auth-verify-icon error-icon">✕</div>
                    <h2 className="auth-form-title">Verification Failed</h2>
                    {error && <AlertBox type="error" message={error} />}
                    <button className="ccms-btn ccms-btn-primary auth-submit" onClick={() => switchView('login')}>
                      Back to sign in
                    </button>
                  </>
                )}
              </div>
            )}

          </div>
        </section>
      </div>

      <style>{authStyles}</style>
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="auth-field">
      <label className="auth-label ccms-eyebrow">{label}</label>
      {children}
      {hint && <span className="auth-hint">{hint}</span>}
    </div>
  );
}

function AlertBox({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div className={`auth-alert auth-alert-${type}`} role="alert">
      <span className="auth-alert-icon">{type === 'error' ? '⚠' : '✓'}</span>
      {message}
    </div>
  );
}

function Divider() {
  return (
    <div className="auth-divider">
      <span className="auth-divider-line" />
      <span className="auth-divider-text">OR</span>
      <span className="auth-divider-line" />
    </div>
  );
}

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

function PasswordStrength({ password }: { password: string }) {
  const score = getPasswordScore(password);
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
  return (
    <div className="pw-strength">
      <div className="pw-strength-bars">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="pw-strength-bar"
            style={{ background: i <= score ? colors[score] : 'rgba(255,255,255,0.1)' }}
          />
        ))}
      </div>
      <span className="pw-strength-label" style={{ color: colors[score] }}>{labels[score]}</span>
    </div>
  );
}

function getPasswordScore(pwd: string): number {
  let s = 0;
  if (pwd.length >= 8) s++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
  if (/\d/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return Math.min(s, 3) as 0 | 1 | 2 | 3;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const authStyles = `
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  padding: 24px 16px;
}

.auth-card {
  display: flex;
  width: 100%;
  max-width: 900px;
  min-height: 560px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(0,212,255,0.08),
    0 32px 80px rgba(0,0,0,0.5),
    0 0 80px rgba(0,212,255,0.04);
}

/* ─── Left Panel ─────────────────────── */
.auth-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 48px 40px;
  background: linear-gradient(145deg, #0a0e1a 0%, #0d1a2b 60%, #091520 100%);
  border-right: 1px solid rgba(0,212,255,0.08);
  position: relative;
  overflow: hidden;
}

.auth-left::before {
  content: '';
  position: absolute;
  top: -100px;
  left: -100px;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%);
  pointer-events: none;
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.auth-logo-mark {
  font-size: 28px;
  color: var(--accent-primary);
  filter: drop-shadow(0 0 12px rgba(0,212,255,0.6));
}

.auth-logo-text {
  font-family: 'Audiowide', sans-serif;
  font-size: 20px;
  color: var(--text-primary);
  letter-spacing: 0.1em;
}

.auth-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--accent-primary);
  text-transform: uppercase;
  margin-top: 6px;
  opacity: 0.7;
}

.auth-left-content {
  margin-top: auto;
  padding: 32px 0;
}

.auth-headline {
  font-size: 36px;
  font-weight: 800;
  line-height: 1.15;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.auth-subline {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 260px;
}

.auth-left-switch {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ─── Right Panel ────────────────────── */
.auth-right {
  flex: 1.1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
  background: var(--bg-surface);
}

.auth-form-wrapper {
  width: 100%;
  max-width: 360px;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.auth-form-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.auth-form-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 28px;
  line-height: 1.6;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Fields ─────────────────────────── */
.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.auth-hint {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.password-wrapper {
  position: relative;
}

.password-wrapper .ccms-input {
  padding-right: 40px;
}

.pw-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.pw-toggle:hover { color: var(--text-primary); }

/* ─── Remember Me / Row ──────────────── */
.auth-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.remember-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.remember-checkbox {
  width: 15px;
  height: 15px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.forgot-link {
  font-size: 13px;
}

/* ─── Alerts ─────────────────────────── */
.auth-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.auth-alert-error {
  background: rgba(239,68,68,0.12);
  border: 1px solid rgba(239,68,68,0.3);
  color: #fca5a5;
}

.auth-alert-success {
  background: rgba(34,197,94,0.12);
  border: 1px solid rgba(34,197,94,0.3);
  color: #86efac;
}

.auth-alert-icon {
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 1px;
}

/* ─── Submit Button ──────────────────── */
.auth-submit {
  width: 100%;
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* ─── Spinner ────────────────────────── */
.auth-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Divider ────────────────────────── */
.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
}

.auth-divider-line {
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.auth-divider-text {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  opacity: 0.6;
}

/* ─── Google Button ──────────────────── */
.auth-google-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.1s;
}

.auth-google-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.07);
  border-color: rgba(255,255,255,0.2);
  transform: translateY(-1px);
}

.auth-google-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ─── Footer / Link ──────────────────── */
.auth-foot {
  text-align: center;
  margin-top: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.auth-link-btn {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: opacity 0.2s;
}

.auth-link-btn:hover { opacity: 0.75; }

/* ─── Back button ────────────────────── */
.auth-back-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: color 0.2s;
}

.auth-back-btn:hover { color: var(--text-primary); }

/* ─── Password Strength ──────────────── */
.pw-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.pw-strength-bars {
  display: flex;
  gap: 4px;
  flex: 1;
}

.pw-strength-bar {
  flex: 1;
  height: 3px;
  border-radius: 99px;
  transition: background 0.3s;
}

.pw-strength-label {
  font-size: 11px;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
}

/* ─── Verify Email Box ───────────────── */
.auth-verify-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  padding: 24px 0;
}

.auth-verify-icon {
  font-size: 48px;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0,212,255,0.1);
  border: 1px solid rgba(0,212,255,0.2);
}

.auth-verify-icon.pulse { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }

.auth-verify-icon.success-icon {
  background: rgba(34,197,94,0.1);
  border-color: rgba(34,197,94,0.3);
  color: #22c55e;
  font-size: 32px;
}

.auth-verify-icon.error-icon {
  background: rgba(239,68,68,0.1);
  border-color: rgba(239,68,68,0.3);
  color: #ef4444;
  font-size: 32px;
}

/* ─── Responsive ─────────────────────── */
@media (max-width: 700px) {
  .auth-card { flex-direction: column; border-radius: 18px; }
  .auth-left {
    padding: 28px 24px;
    flex-direction: row;
    align-items: center;
    gap: 16px;
    min-height: auto;
  }
  .auth-left-content, .auth-left-switch { display: none; }
  .auth-left::before { display: none; }
  .auth-right { padding: 32px 24px; }
  .auth-headline { font-size: 26px; }
}
`;
