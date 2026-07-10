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
} from '../controllers/auth.controller';
import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';
import { csrfProtection } from '../middleware/csrf';

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

// Apply CSRF protection to all auth mutation routes.
// Safe GET methods are exempted inside the middleware itself.
router.use(csrfProtection);

// ─── Public routes (no authentication required) ────────────────────────────

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

router.get('/me',     verifyJWT, asyncHandler(me));
router.post('/logout', verifyJWT, asyncHandler(logout));

export default router;
