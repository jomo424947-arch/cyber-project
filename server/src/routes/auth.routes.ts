import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import rateLimit from 'express-rate-limit';
import {
  login,
  signup,
  logout,
  refresh,
  me,
  forgotPassword,
  resetPassword,
  verifyEmail,
  googleLogin,
  googleCallback,
  getActivationStatus,
  activateTenant,
  registerTenant,
  getTenants,
  updateTenantStatus,
} from '../controllers/auth.controller';
import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT, requireRole } from '../middleware/auth';
import { listEmployeesPublic } from '../controllers/employees.controller';

const router = Router();

/**
 * Stricter rate limiter for auth endpoints — max 10 attempts per 15 minutes
 * per IP. This protects against brute-force and credential stuffing attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true, // Only count failed attempts
  message: {
    error: {
      message: 'Too many attempts. Please wait 15 minutes before trying again.',
      code: 'AUTH_RATE_LIMITED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Public routes (no authentication required) ────────────────────────────

router.get('/status',          asyncHandler(getActivationStatus));
router.get('/employees-public', asyncHandler(listEmployeesPublic));
router.post('/activate',       authLimiter, asyncHandler(activateTenant));
router.post('/login',          authLimiter, validate(loginSchema),          asyncHandler(login));
router.post('/signup',         authLimiter, validate(signupSchema),         asyncHandler(signup));
router.post('/refresh',        asyncHandler(refresh));
router.post('/forgot-password',authLimiter, validate(forgotPasswordSchema), asyncHandler(forgotPassword));
router.post('/reset-password',             validate(resetPasswordSchema),   asyncHandler(resetPassword));
router.post('/verify-email',               validate(verifyEmailSchema),     asyncHandler(verifyEmail));

// Google OAuth — GET endpoints are CSRF-exempt (no state mutation)
router.get('/oauth/google',    asyncHandler(googleLogin));
router.get('/callback/google', asyncHandler(googleCallback));

// ─── Protected routes (JWT required) ──────────────────────────────────────

router.get('/me',               verifyJWT, asyncHandler(me));
router.post('/logout',          verifyJWT, asyncHandler(logout));
router.post('/register-tenant', asyncHandler(registerTenant));
router.get('/tenants',          asyncHandler(getTenants));
router.patch('/tenants/:id/status', asyncHandler(updateTenantStatus));

export default router;
