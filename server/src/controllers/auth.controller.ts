import { Request, Response } from 'express';
import { supabase, localDb } from '../lib/supabase';
import { badRequest, unauthorized, conflict } from '../lib/errors';
import { hashPassword, verifyPassword, signToken, signRefreshToken, verifyRefreshToken } from '../lib/local-auth';
import crypto from 'crypto';
import { cloudSupabase } from '../lib/cloud-supabase';
import { getDb, saveDatabase, setActiveTenantConfig, getActiveTenantConfig, getActiveTenantId, updateActiveTenantStatus } from '../lib/database';
import '../lib/types';

// ─── Cookie helpers ────────────────────────────────────────────────────────

const IS_SECURE = process.env.USE_HTTPS === 'true';

/** Duration for access token cookie — 1 hour. */
const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_SECURE,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 1000, // 1 hour
};

/** Default refresh token cookie (session-only unless "remember me"). */
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_SECURE,
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
  if (typeof res.setHeader === 'function') {
    res.setHeader('X-Access-Token', accessToken);
    res.setHeader('X-Refresh-Token', refreshToken);
    res.setHeader('Access-Control-Expose-Headers', 'X-CSRF-Token, X-Access-Token, X-Refresh-Token');
  }
}

function clearAuthCookies(res: Response) {
  res.clearCookie('sb-access-token', { path: '/' });
  res.clearCookie('sb-refresh-token', { path: '/' });
}

/** Load the full user profile row from users table. */
async function loadUserProfile(userId: string) {
  try {
    const { data } = await supabase
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle();
    if (data) return data;
  } catch (err) {
    console.warn('[auth] Failed to load user profile from primary client:', err);
  }

  // Fallback to local SQLite DB
  const { data: localData } = await localDb
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  return localData;
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────

/** Authenticate with email + password. Handles both offline and online modes. */
export async function login(req: Request, res: Response) {
  const { email, password, rememberMe = false } = req.body;

  if (!email || !password) {
    throw badRequest('Email and password are required');
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Try Cloud Supabase authentication if available
  if (cloudSupabase) {
    try {
      const { data, error } = await cloudSupabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!error && data.session) {
        // Cloud login succeeded! Load profile
        const { data: cloudUser } = await cloudSupabase
          .from('users')
          .select('id, email, full_name, role, tenant_id')
          .eq('id', data.user.id)
          .maybeSingle();

        const userId = data.user.id;
        const userEmail = data.user.email || cleanEmail;
        const fullName = cloudUser?.full_name || userEmail.split('@')[0];
        const role = cloudUser?.role || 'admin';
        const tenantId = cloudUser?.tenant_id || null;

        // Check cloud tenant subscription status FIRST
        if (tenantId) {
          const { data: cloudTenant } = await cloudSupabase
            .from('tenants')
            .select('status, name')
            .eq('id', tenantId)
            .maybeSingle();

          if (cloudTenant) {
            try {
              setActiveTenantConfig({
                tenant_id: tenantId,
                tenant_name: cloudTenant.name || fullName,
                owner_email: userEmail,
                status: cloudTenant.status,
              });
            } catch (e) {
              console.warn('[auth] Failed to update local tenant_config:', e);
            }

            if (cloudTenant.status !== 'active' && cloudTenant.status !== 'trial') {
              res.status(403).json({
                error: {
                  message: `Subscription ${cloudTenant.status}. Please renew your license to access the system.`,
                  code: 'SUBSCRIPTION_INACTIVE',
                },
              });
              return;
            }
          }
        }

        // Cache user credentials locally in SQLite for offline access
        try {
          const db = getDb();
          const localHash = hashPassword(password);
          db.run(
            `INSERT OR REPLACE INTO users (id, email, full_name, role, password_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, userEmail, fullName, role, localHash, tenantId]
          );
          saveDatabase();
        } catch (e) {
          console.warn('[auth] Failed to cache cloud user locally:', e);
        }

        const accessToken = signToken({ id: userId, email: userEmail, role, tenant_id: tenantId });
        const refreshToken = signRefreshToken({ id: userId });
        setAuthCookies(res, accessToken, refreshToken, rememberMe);

        if (tenantId) {
          try {
            const { pullFromCloud } = require('../lib/sync-engine');
            pullFromCloud(tenantId).catch((err: any) => console.warn('[auth] Cloud login pull failed:', err.message));
          } catch {}
        }

        res.json({
          user: { id: userId, email: userEmail, full_name: fullName, role, tenant_id: tenantId },
          token: accessToken,
          refreshToken,
        });
        return;
      }
    } catch (cloudErr) {
      console.warn('[auth] Cloud login error, falling back to local DB:', cloudErr);
    }
  }

  // 2. Fall back to local SQLite DB (offline mode)
  const { data: allUsers, error: localErr } = await localDb
    .from('users')
    .select('*');

  const user = (allUsers || []).find((u: any) => u.email?.trim().toLowerCase() === cleanEmail);

  if (localErr || !user || !user.password_hash) {
    throw unauthorized('Invalid email or password');
  }

  const isMatch = verifyPassword(password, user.password_hash);
  if (!isMatch) {
    throw unauthorized('Invalid email or password');
  }

  // FIX: Include tenant_id in token so each café only sees its own data
  const accessToken = signToken({ id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id ?? null });
  const refreshToken = signRefreshToken({ id: user.id });
  setAuthCookies(res, accessToken, refreshToken, rememberMe);

  if (user.tenant_id) {
    try {
      const { pullFromCloud } = require('../lib/sync-engine');
      pullFromCloud(user.tenant_id).catch((err: any) => console.warn('[auth] Local login pull failed:', err.message));
    } catch {}
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name ?? user.email.split('@')[0],
      role: user.role,
      tenant_id: user.tenant_id ?? null,
    },
    token: accessToken,
    refreshToken,
  });
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────

/** Create a new account. Handles both offline and online modes. */
export async function signup(req: Request, res: Response): Promise<void> {
  const { email, password, fullName } = req.body;
  const isOffline = process.env.OFFLINE_MODE === 'true';

  if (!email || !password) {
    throw badRequest('Email and password are required');
  }

  if (isOffline) {
    // Check if email already exists locally
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      throw conflict('An account with this email already exists', 'EMAIL_EXISTS');
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const userRole = 'staff'; // default role

    // Insert user locally in SQLite
    const { error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        full_name: fullName || email.split('@')[0],
        role: userRole,
        password_hash: passwordHash,
      });

    if (error) {
      throw badRequest(error.message);
    }

    const accessToken = signToken({ id: userId, email, role: userRole });
    const refreshToken = signRefreshToken({ id: userId });

    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: userId,
        email,
        full_name: fullName || email.split('@')[0],
        role: userRole,
      },
      token: accessToken,
      refreshToken,
    });
  } else {
    // Cloud Mode: self-signup is disabled.
    // All accounts must be created through the admin panel (createEmployee)
    // or via Super Admin tenant registration (registerTenant).
    // Allowing open signup would create orphaned accounts with no tenant_id,
    // which multiple controllers handle inconsistently.
    res.status(403).json({
      error: {
        message: 'Self-registration is not available. Please contact your café administrator to create an account.',
        code: 'SIGNUP_DISABLED',
      },
    });
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────

/** Sign out the current user and clear auth cookies. */
export async function logout(req: Request, res: Response) {
  clearAuthCookies(res);
  res.json({ message: 'Logged out successfully.' });
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────

/** Silently refresh the access token using the refresh token cookie. */
export async function refresh(req: Request, res: Response) {
  const refreshToken =
    req.cookies?.['sb-refresh-token'] ||
    req.body?.refreshToken ||
    (req.headers['x-refresh-token'] as string);
  if (!refreshToken) {
    clearAuthCookies(res);
    throw unauthorized('No refresh token');
  }

  let userId = '';

  // 1. Try local refresh token verification first (since login/signup issue local tokens)
  try {
    const decoded = verifyRefreshToken(refreshToken);
    userId = decoded.id;
  } catch {
    // 2. If local verification fails, try Supabase Cloud refresh if available
    if (cloudSupabase) {
      try {
        const { data, error } = await cloudSupabase.auth.refreshSession({
          refresh_token: refreshToken,
        });
        if (!error && data?.session) {
          userId = data.session.user.id;
        }
      } catch {
        // Ignore
      }
    }
  }

  if (!userId) {
    clearAuthCookies(res);
    throw unauthorized('Session expired. Please log in again.');
  }

  const profile = await loadUserProfile(userId);
  if (!profile) {
    clearAuthCookies(res);
    throw unauthorized('User profile not found.');
  }

  // FIX: Include tenant_id in the refreshed token
  const newAccessToken = signToken({ id: profile.id, email: profile.email, role: profile.role, tenant_id: (profile as any).tenant_id ?? null });
  const newRefreshToken = signRefreshToken({ id: profile.id });

  const remember = !!req.cookies?.['sb-refresh-token'];
  setAuthCookies(res, newAccessToken, newRefreshToken, remember);

  res.json({
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name ?? profile.email.split('@')[0],
      role: profile.role,
      tenant_id: (profile as any).tenant_id ?? null,
    },
    token: newAccessToken,
    refreshToken: newRefreshToken,
  });
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────

/** Return the authenticated user's profile. */
export async function me(req: Request, res: Response) {
  const profile = await loadUserProfile(req.user!.id);
  if (!profile) {
    throw unauthorized('User profile not found');
  }
  res.json({
    user: {
      id: req.user!.id,
      email: profile.email ?? req.user!.email,
      full_name: profile.full_name ?? req.user!.email.split('@')[0],
      role: profile.role ?? req.user!.role,
    },
  });
}

// ─── POST /api/auth/forgot-password ──────────────────────────────────────

/** Send a password reset email. */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  const isOffline = process.env.OFFLINE_MODE === 'true';

  if (isOffline) {
    res.status(501).json({
      error: {
        message: 'Password reset is not supported in offline desktop mode. Please contact the administrator.',
        code: 'NOT_SUPPORTED',
      },
    });
  } else {
    if (!cloudSupabase) throw badRequest('Supabase cloud connection not configured');
    
    const { error } = await cloudSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.headers.origin}/reset-password`,
    });

    if (error) throw badRequest(error.message);
    res.json({ message: 'Password reset email sent successfully.' });
  }
}

// ─── POST /api/auth/reset-password ───────────────────────────────────────

/** Reset the user's password. */
export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;
  const isOffline = process.env.OFFLINE_MODE === 'true';

  if (!newPassword) {
    throw badRequest('New password is required');
  }

  if (isOffline) {
    res.status(501).json({
      error: {
        message: 'Password reset is not supported in offline desktop mode.',
        code: 'NOT_SUPPORTED',
      },
    });
  } else {
    if (!cloudSupabase) throw badRequest('Supabase cloud connection not configured');
    
    if (token) {
      const { error: verifyErr } = await cloudSupabase.auth.verifyOtp({
        token_hash: token,
        type: 'recovery',
      });
      if (verifyErr) {
        throw badRequest(verifyErr.message || 'Invalid or expired password reset token');
      }
    }

    const { error } = await cloudSupabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw badRequest(error.message);
    res.json({ message: 'Password updated successfully.' });
  }
}

// ─── POST /api/auth/verify-email ─────────────────────────────────────────

/** Verify an email address. */
export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.body;
  const isOffline = process.env.OFFLINE_MODE === 'true';

  if (isOffline) {
    res.status(501).json({
      error: {
        message: 'Email verification is not supported in offline desktop mode.',
        code: 'NOT_SUPPORTED',
      },
    });
  } else {
    if (!cloudSupabase) throw badRequest('Supabase cloud connection not configured');
    
    const { data, error } = await cloudSupabase.auth.verifyOtp({
      token_hash: token,
      type: 'email',
    });

    if (error || !data.user) {
      throw badRequest(error?.message || 'Verification failed');
    }

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata.full_name || '',
        role: 'staff',
      },
      message: 'Email verified successfully.',
    });
  }
}

// ─── GET /api/auth/oauth/google ───────────────────────────────────────────

/** Return the Google OAuth authorization URL. */
export async function googleLogin(req: Request, res: Response) {
  const isOffline = process.env.OFFLINE_MODE === 'true';

  if (isOffline) {
    res.status(501).json({
      error: {
        message: 'Google Login is not supported in offline desktop mode. Use email and password.',
        code: 'NOT_SUPPORTED',
      },
    });
  } else {
    if (!cloudSupabase) throw badRequest('Supabase cloud connection not configured');
    
    const { data, error } = await cloudSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${req.headers.origin}/api/auth/callback/google`,
      },
    });

    if (error) throw badRequest(error.message);
    res.json({ url: data.url });
  }
}

// ─── GET /api/auth/callback/google ───────────────────────────────────────

/** Backend OAuth Callback (Redirects to client dashboard). */
export async function googleCallback(req: Request, res: Response) {
  res.status(501).json({
    error: {
      message: 'Google Login callback handled by frontend router.',
      code: 'NOT_SUPPORTED',
    },
  });
}

// ─── LICENSE ACTIVATION ENDPOINTS ──────────────────────────────────────────

/** GET /api/auth/status — Check if app is activated locally. */
export async function getActivationStatus(_req: Request, res: Response) {
  let status = 'unactivated';
  let tenant = null;

  try {
    const config = getActiveTenantConfig();
    if (config) {
      status = config.status || 'unactivated';
      tenant = {
        tenant_id: config.tenant_id,
        name: config.tenant_name,
        owner_email: config.owner_email,
        status: config.status || 'unactivated',
        plan: config.plan || 'monthly_full',
        expires_at: config.expires_at || null,
      };
    }
  } catch (err) {
    // If table doesn't exist yet, it's considered unactivated
  }

  res.json({ status, tenant });
}

/** POST /api/auth/activate — Activate app using cloud credentials. */
export async function activateTenant(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    throw badRequest('Email and password are required for activation');
  }

  if (!cloudSupabase) {
    throw badRequest('Supabase cloud connection not configured in .env');
  }

  // 1. Authenticate with Supabase Cloud
  const { data: authData, error: authErr } = await cloudSupabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !authData.session) {
    throw unauthorized('Invalid cloud email or password');
  }

  const userId = authData.user.id;

  // 2. Load user's tenant_id and role from cloud DB
  const { data: cloudUser, error: cloudUserErr } = await cloudSupabase
    .from('users')
    .select('id, email, full_name, role, tenant_id')
    .eq('id', userId)
    .maybeSingle();

  if (cloudUserErr || !cloudUser || !cloudUser.tenant_id) {
    throw unauthorized('This account is not associated with any cyber café tenant');
  }

  // 3. Load tenant status from cloud DB
  const { data: tenant, error: tenantErr } = await cloudSupabase
    .from('tenants')
    .select('id, name, status')
    .eq('id', cloudUser.tenant_id)
    .maybeSingle();

  if (tenantErr || !tenant) {
    throw unauthorized('Failed to load cyber café tenant profile from cloud');
  }

  if (tenant.status !== 'active' && tenant.status !== 'trial') {
    res.status(403).json({
      error: {
        message: `Activation failed: This subscription is ${tenant.status}. Please contact support.`,
        code: 'SUBSCRIPTION_INACTIVE',
      },
    });
    return;
  }

  // 4. Save to local SQLite database
  const db = getDb();
  
  // Set single authoritative tenant configuration
  setActiveTenantConfig({
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    owner_email: email,
    status: tenant.status,
  });

  // Hash password and store user locally so they can log in offline
  const localHash = hashPassword(password);
  db.run(
    `INSERT OR REPLACE INTO users (id, email, full_name, role, password_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, email, cloudUser.full_name || email.split('@')[0], cloudUser.role, localHash, tenant.id]
  );

  // 5. Seed devices and products from cloud for instant startup experience
  try {
    const { data: cloudDevices } = await cloudSupabase
      .from('devices')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (cloudDevices && cloudDevices.length > 0) {
      for (const dev of cloudDevices) {
        db.run(
          `INSERT OR REPLACE INTO devices (id, name, type, status, specs, hourly_rate, hourly_rate_multi, archived, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dev.id,
            dev.name,
            dev.type,
            dev.status || 'available',
            dev.specs ? JSON.stringify(dev.specs) : null,
            dev.hourly_rate || 0,
            dev.hourly_rate_multi || dev.hourly_rate || 0,
            dev.archived ? 1 : 0,
            tenant.id
          ]
        );
      }
    }

    const { data: cloudProducts } = await cloudSupabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (cloudProducts && cloudProducts.length > 0) {
      for (const prod of cloudProducts) {
        db.run(
          `INSERT OR REPLACE INTO products (id, name, price, tenant_id) VALUES (?, ?, ?, ?)`,
          [prod.id, prod.name, prod.price || 0, tenant.id]
        );
      }
    }
  } catch (err: any) {
    console.warn('[activation] Failed to download initial devices/products:', err.message);
  }

  saveDatabase();

  res.json({
    success: true,
    message: 'Application activated successfully',
    tenant: {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
    },
  });
}

// ─── SUPER ADMIN TENANT REGISTRATION ────────────────────────────────────────

/** Helper to calculate default expiration date based on subscription plan */
function calculateDefaultExpiry(plan: string): string {
  const date = new Date();
  switch (plan) {
    case 'trial':
      date.setDate(date.getDate() + 2); // يومين
      break;
    case 'monthly_mobile':
    case 'monthly_full':
      date.setDate(date.getDate() + 30);
      break;
    case 'quarterly_full':
      date.setDate(date.getDate() + 90);
      break;
    case 'yearly_full':
      date.setDate(date.getDate() + 365);
      break;
    default:
      date.setDate(date.getDate() + 30);
  }
  return date.toISOString();
}

/** POST /api/auth/register-tenant — Registers a new cyber café (tenant) and its owner user. */
export async function registerTenant(req: Request, res: Response) {
  const {
    tenantName,
    ownerFullName,
    ownerEmail,
    ownerPassword,
    status = 'active',
    plan = 'monthly_full',
    expires_at,
    secretKey,
  } = req.body;

  const expectedKey = process.env.SUPER_ADMIN_KEY;
  if (!expectedKey) {
    throw new Error('SUPER_ADMIN_KEY is not configured. Super Admin endpoints are disabled.');
  }
  if (!secretKey || secretKey !== expectedKey) {
    throw unauthorized('Invalid Super Admin Secret Key passcode');
  }

  if (!tenantName || !ownerFullName || !ownerEmail || !ownerPassword) {
    throw badRequest('All fields are required (tenantName, ownerFullName, ownerEmail, ownerPassword)');
  }

  if (!cloudSupabase) {
    throw badRequest('Supabase cloud connection not configured in .env (Requires SUPER_ADMIN keys)');
  }

  const computedExpiry = expires_at || calculateDefaultExpiry(plan);

  // 1. Create User in Supabase Auth
  const { data: authData, error: authErr } = await cloudSupabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });

  if (authErr || !authData.user) {
    throw badRequest(authErr?.message || 'Failed to create user in Supabase Auth');
  }

  const userId = authData.user.id;

  // 2. Create Tenant (with graceful fallback if plan/expires_at columns are pending)
  const tenantId = crypto.randomUUID();
  let tenantInsertPayload: any = {
    id: tenantId,
    name: tenantName,
    owner_email: ownerEmail,
    status,
    plan,
    expires_at: computedExpiry,
  };

  let { error: tenantErr } = await cloudSupabase.from('tenants').insert(tenantInsertPayload);

  if (tenantErr) {
    // If Supabase table schema doesn't yet have plan or expires_at columns, retry with base fields
    console.warn('[SuperAdmin] Insert with plan/expires_at failed, retrying base fields:', tenantErr.message);
    const retry = await cloudSupabase.from('tenants').insert({
      id: tenantId,
      name: tenantName,
      owner_email: ownerEmail,
      status,
    });
    tenantErr = retry.error;
  }

  if (tenantErr) {
    // Rollback user
    await cloudSupabase.auth.admin.deleteUser(userId);
    throw badRequest(tenantErr.message || 'Failed to create tenant profile');
  }

  // 3. Create User Profile (upsert to handle trigger auto-inserts)
  const { error: userErr } = await cloudSupabase.from('users').upsert({
    id: userId,
    email: ownerEmail,
    full_name: ownerFullName,
    role: 'admin',
    tenant_id: tenantId,
  });

  if (userErr) {
    // Rollback
    await cloudSupabase.from('tenants').delete().eq('id', tenantId);
    await cloudSupabase.auth.admin.deleteUser(userId);
    throw badRequest(userErr.message || 'Failed to create user profile');
  }

  res.status(201).json({
    success: true,
    message: 'Cyber café registered successfully!',
    tenant: {
      id: tenantId,
      name: tenantName,
      owner_email: ownerEmail,
      status,
      plan,
      expires_at: computedExpiry,
    },
  });
}

/** GET /api/auth/tenants — Lists all tenants from Supabase. */
export async function getTenants(req: Request, res: Response) {
  const secretKey = req.headers['x-super-admin-key'] as string;
  const expectedKey = process.env.SUPER_ADMIN_KEY;
  if (!expectedKey) {
    throw new Error('SUPER_ADMIN_KEY is not configured. Super Admin endpoints are disabled.');
  }
  if (!secretKey || secretKey !== expectedKey) {
    throw unauthorized('Invalid Super Admin Secret Key passcode');
  }

  if (!cloudSupabase) {
    throw badRequest('Supabase cloud connection not configured in .env (Requires SUPER_ADMIN keys)');
  }

  const { data: rawTenants, error } = await cloudSupabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw badRequest(error.message || 'Failed to fetch tenants');
  }

  // Ensure default plans & expiration are populated if missing from older records
  const tenants = (rawTenants || []).map((t: any) => {
    const plan = t.plan || (t.status === 'trial' ? 'trial' : 'monthly_full');
    let expiresAt = t.expires_at;
    if (!expiresAt && t.created_at) {
      const created = new Date(t.created_at);
      if (plan === 'trial') {
        created.setDate(created.getDate() + 2);
      } else if (plan === 'quarterly_full') {
        created.setDate(created.getDate() + 90);
      } else if (plan === 'yearly_full') {
        created.setDate(created.getDate() + 365);
      } else {
        created.setDate(created.getDate() + 30);
      }
      expiresAt = created.toISOString();
    }
    return {
      ...t,
      plan,
      expires_at: expiresAt,
    };
  });

  res.json({
    success: true,
    tenants,
  });
}

/** PATCH /api/auth/tenants/:id/status — Updates a tenant's subscription status, plan, or expiration. */
export async function updateTenantStatus(req: Request, res: Response) {
  const secretKey = req.headers['x-super-admin-key'] as string;
  const expectedKey = process.env.SUPER_ADMIN_KEY;
  if (!expectedKey) {
    throw new Error('SUPER_ADMIN_KEY is not configured. Super Admin endpoints are disabled.');
  }
  if (!secretKey || secretKey !== expectedKey) {
    throw unauthorized('Invalid Super Admin Secret Key passcode');
  }

  if (!cloudSupabase) {
    throw badRequest('Supabase cloud connection not configured in .env (Requires SUPER_ADMIN keys)');
  }

  const { id } = req.params;
  const { status, plan, expires_at } = req.body;
  const cleanId = id.trim();

  if (status && !['active', 'trial', 'suspended'].includes(status)) {
    throw badRequest('Invalid status value. Must be active, trial, or suspended.');
  }

  const updateFields: any = {};
  if (status) updateFields.status = status;
  if (plan) updateFields.plan = plan;
  if (expires_at !== undefined) updateFields.expires_at = expires_at;

  // Always update updated_at timestamp so changes are immediately reflected in Supabase
  updateFields.updated_at = new Date().toISOString();

  // If status is given but plan or expires_at is missing, calculate defaults automatically
  if (status && (!plan || expires_at === undefined)) {
    try {
      const { data: currentTenant } = await cloudSupabase
        .from('tenants')
        .select('id, name, status, plan, expires_at, created_at')
        .eq('id', cleanId)
        .maybeSingle();

      const targetPlan = plan || currentTenant?.plan || (status === 'trial' ? 'trial' : 'monthly_full');
      updateFields.plan = targetPlan;

      if (expires_at === undefined) {
        if (status === 'trial') {
          const d = new Date();
          d.setDate(d.getDate() + 2);
          updateFields.expires_at = d.toISOString();
        } else if (status === 'active') {
          const currentExp = currentTenant?.expires_at ? new Date(currentTenant.expires_at).getTime() : 0;
          if (currentExp > Date.now() && currentTenant?.expires_at) {
            updateFields.expires_at = currentTenant.expires_at;
          } else {
            updateFields.expires_at = calculateDefaultExpiry(targetPlan);
          }
        }
      }
    } catch (err: any) {
      console.warn('[SuperAdmin] Could not query current tenant for expiry defaults:', err.message);
    }
  }

  console.log(`[SuperAdmin] Updating tenant ${cleanId}:`, updateFields);

  // 1. Update in Supabase Cloud
  let { data, error } = await cloudSupabase
    .from('tenants')
    .update(updateFields)
    .eq('id', cleanId)
    .select();

  if (error && (updateFields.plan || updateFields.expires_at)) {
    // If Supabase table doesn't have plan/expires_at columns yet, fallback to base fields
    console.warn('[SuperAdmin] Multi-field update failed in Supabase, retrying with base fields:', error.message);
    const retry = await cloudSupabase
      .from('tenants')
      .update({
        status: status || 'active',
        updated_at: updateFields.updated_at,
      })
      .eq('id', cleanId)
      .select();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[SuperAdmin] Failed to update tenant status in Supabase:', error);
    throw badRequest(error.message || 'Failed to update tenant');
  }

  // 2. Sync local SQLite database tenant_config ONLY IF the tenant being updated IS the local active tenant
  try {
    const localActiveTenantId = getActiveTenantId();
    if (localActiveTenantId && localActiveTenantId === cleanId) {
      if (status) {
        updateActiveTenantStatus(status, undefined, updateFields.plan, updateFields.expires_at);
        console.log(`[SuperAdmin] Local active tenant_config updated: status=${status}, plan=${updateFields.plan}`);
      }
    } else {
      console.log(`[SuperAdmin] Cloud tenant ${cleanId} updated (local active tenant is ${localActiveTenantId || 'none'})`);
    }
  } catch (err: any) {
    console.error('[SuperAdmin] Failed to update local tenant_config status:', err.message);
  }

  const resultTenant = data?.[0] || { id: cleanId, ...updateFields };

  res.json({
    success: true,
    message: 'Tenant subscription updated successfully',
    tenant: resultTenant,
  });
}

/** POST /api/auth/sync — Manually trigger bidirectional cloud sync. */
export async function triggerSync(_req: Request, res: Response) {
  const { runSync } = require('../lib/sync-engine');
  await runSync();
  res.json({
    success: true,
    message: 'Synchronization completed successfully',
  });
}

