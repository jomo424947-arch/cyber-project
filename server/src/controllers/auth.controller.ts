import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, unauthorized, conflict } from '../lib/errors';

// ─── Cookie helpers ────────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === 'production';

/** Duration for access token cookie — Supabase issues 1 hour tokens by default. */
const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 1000, // 1 hour
};

/** Default refresh token cookie (session-only unless "remember me"). */
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/** Extended refresh cookie for "Remember Me". */
const REFRESH_REMEMBER_OPTS = {
  ...REFRESH_COOKIE_OPTS,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string, remember = false) {
  res.cookie('sb-access-token', accessToken, ACCESS_COOKIE_OPTS);
  res.cookie('sb-refresh-token', refreshToken, remember ? REFRESH_REMEMBER_OPTS : REFRESH_COOKIE_OPTS);
}

function clearAuthCookies(res: Response) {
  res.clearCookie('sb-access-token', { path: '/' });
  res.clearCookie('sb-refresh-token', { path: '/' });
}

/** Load the full user profile row from public.users. */
async function loadUserProfile(userId: string) {
  const { data } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

// ─── Rate-limited brute force protection ──────────────────────────────────
// express-rate-limit is applied globally in index.ts, but auth endpoints
// have a separate stricter limiter applied in auth.routes.ts.

// ─── POST /api/auth/login ─────────────────────────────────────────────────

/** Authenticate with email + password and issue HttpOnly cookies. */
export async function login(req: Request, res: Response) {
  const { email, password, rememberMe = false } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    // Always return the same generic message to prevent email enumeration.
    throw unauthorized('Invalid email or password');
  }

  const profile = await loadUserProfile(data.user.id);
  setAuthCookies(res, data.session.access_token, data.session.refresh_token, rememberMe);

  res.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      full_name: profile?.full_name ?? data.user.email?.split('@')[0] ?? '',
      role: profile?.role ?? 'staff',
    },
  });
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────

/** Create a new account in Supabase Auth.
 *  Email confirmation is handled by Supabase; the public.users row is
 *  created automatically via the on_auth_user_created trigger.
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const { email, password, fullName } = req.body;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName ?? email.split('@')[0] },
    },
  });

  if (error) {
    // Supabase returns "User already registered" — wrap as 409 Conflict.
    if (error.message.toLowerCase().includes('already registered')) {
      throw conflict('An account with this email already exists', 'EMAIL_EXISTS');
    }
    throw badRequest(error.message);
  }

  // If Supabase email confirmation is disabled, a session is returned immediately.
  if (data.session) {
    const profile = await loadUserProfile(data.user!.id);
    setAuthCookies(res, data.session.access_token, data.session.refresh_token);
    res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: data.user!.id,
        email: data.user!.email,
        full_name: profile?.full_name ?? data.user!.email?.split('@')[0] ?? '',
        role: profile?.role ?? 'staff',
      },
    });
    return;
  }

  // Email confirmation is required — advise the client.
  res.status(201).json({
    message: 'Account created. Please check your email to verify your account.',
    user: null,
    requiresEmailVerification: true,
  });
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────

/** Sign out the current user and clear auth cookies. */
export async function logout(req: Request, res: Response) {
  const accessToken = req.cookies?.['sb-access-token'];

  // Best-effort revoke the server-side Supabase session.
  if (accessToken) {
    try {
      // Use the user's own token to sign out their session only.
      const userClient = supabase; // service-role client also works here
      await userClient.auth.admin.signOut(accessToken);
    } catch {
      // Ignore — cookie will be cleared anyway.
    }
  }

  clearAuthCookies(res);
  res.json({ message: 'Logged out successfully.' });
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────

/** Silently refresh the access token using the refresh token cookie.
 *  Implements Refresh Token Rotation — a new refresh token is issued each time.
 */
export async function refresh(req: Request, res: Response) {
  const refreshToken = req.cookies?.['sb-refresh-token'];
  if (!refreshToken) {
    clearAuthCookies(res);
    throw unauthorized('No refresh token');
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    clearAuthCookies(res);
    throw unauthorized('Session expired. Please log in again.');
  }

  // Detect "remember me" from existing cookie maxAge (heuristic: refresh > 7 days).
  const remember = !!req.cookies?.['sb-refresh-token'];
  setAuthCookies(res, data.session.access_token, data.session.refresh_token, remember);

  const profile = await loadUserProfile(data.user!.id);
  res.json({
    user: {
      id: data.user!.id,
      email: data.user!.email,
      full_name: profile?.full_name ?? data.user!.email?.split('@')[0] ?? '',
      role: profile?.role ?? 'staff',
    },
  });
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────

/** Return the authenticated user's profile. req.user is set by verifyJWT. */
export async function me(req: Request, res: Response) {
  const profile = await loadUserProfile(req.user!.id);
  res.json({
    user: {
      id: req.user!.id,
      email: profile?.email ?? req.user!.email,
      full_name: profile?.full_name ?? req.user!.email.split('@')[0],
      role: profile?.role ?? req.user!.role,
    },
  });
}

// ─── POST /api/auth/forgot-password ──────────────────────────────────────

/** Send a password reset email.
 *  Always returns 200 to prevent email enumeration.
 */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  // Fire and forget — we don't reveal whether the email exists.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${clientOrigin}/reset-password`,
  });

  res.json({
    message: 'If this email exists, a password reset link has been sent.',
  });
}

// ─── POST /api/auth/reset-password ───────────────────────────────────────

/** Reset the user's password using the OTP code from the email link.
 *  The client extracts `token` and `type` from the URL hash and sends them here.
 */
export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw badRequest('Token and new password are required');
  }

  // Verify the OTP token to get a session, then update the password.
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: 'recovery',
  });

  if (verifyErr || !verifyData.session) {
    throw badRequest('Invalid or expired reset token. Please request a new one.');
  }

  // Update the password using the session obtained from the OTP.
  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) throw badRequest(updateErr.message);

  clearAuthCookies(res);
  res.json({ message: 'Password updated successfully. Please log in.' });
}

// ─── POST /api/auth/verify-email ─────────────────────────────────────────

/** Verify an email address using the OTP token from the verification link. */
export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.body;
  if (!token) throw badRequest('Verification token is required');

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: 'email',
  });

  if (error || !data.session) {
    throw badRequest('Invalid or expired verification token.');
  }

  const profile = await loadUserProfile(data.user!.id);
  setAuthCookies(res, data.session.access_token, data.session.refresh_token);
  res.json({
    message: 'Email verified successfully.',
    user: {
      id: data.user!.id,
      email: data.user!.email,
      full_name: profile?.full_name ?? '',
      role: profile?.role ?? 'staff',
    },
  });
}

// ─── GET /api/auth/oauth/google ───────────────────────────────────────────

/** Return the Supabase Google OAuth authorization URL.
 *  The client navigates to this URL; Google sends the user back to our
 *  backend callback endpoint after consent.
 */
export async function googleLogin(_req: Request, res: Response) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.SUPABASE_URL}/auth/v1/callback`,
      queryParams: {
        redirect_to: `${process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`}/api/auth/callback/google`,
      },
    },
  });

  if (error || !data.url) {
    throw badRequest('Failed to generate Google OAuth URL');
  }

  res.json({ url: data.url });
}

// ─── GET /api/auth/callback/google ───────────────────────────────────────

/**
 * Backend OAuth Callback.
 *
 * PROBLEM (root cause of the broken Google login):
 *   The old flow called `supabase.auth.signInWithOAuth` on the *client*
 *   with `redirectTo: window.location.origin + '/dashboard'`. After Google
 *   consent, Supabase/Google redirects back with tokens in the URL *hash*
 *   (fragment).  React Router's BrowserRouter never sees hash fragments —
 *   only the browser JS can read `window.location.hash`. The hash is also
 *   stripped on server-side redirects, so the tokens are lost entirely.
 *
 * FIX:
 *   The OAuth callback is handled entirely on the backend.
 *   Supabase redirects to /api/auth/callback/google?code=…
 *   We exchange the code for a session using the server-side client,
 *   set HttpOnly cookies, and then perform a clean HTTP redirect to the
 *   frontend dashboard — no tokens in the URL, no hash fragments.
 */
export async function googleCallback(req: Request, res: Response): Promise<void> {
  const { code, error: oauthError } = req.query as { code?: string; error?: string };
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  if (oauthError || !code) {
    res.redirect(`${clientOrigin}/login?error=oauth_failed`);
    return;
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    res.redirect(`${clientOrigin}/login?error=session_exchange_failed`);
    return;
  }

  // Ensure the public.users row exists (handles first-time Google users
  // whose on_auth_user_created trigger may not have run yet).
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('id', data.user.id);

  if (!count) {
    await supabase.from('users').insert({
      id: data.user.id,
      email: data.user.email,
      full_name:
        data.user.user_metadata?.full_name ??
        data.user.user_metadata?.name ??
        data.user.email?.split('@')[0] ??
        '',
      role: 'staff',
    });
  }

  setAuthCookies(res, data.session.access_token, data.session.refresh_token);

  // Clean redirect — no tokens in the URL.
  res.redirect(`${clientOrigin}/dashboard`);
}
