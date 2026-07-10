import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
  rememberMe: z.boolean().optional().default(false),
});

export const signupSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name required').max(120).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token required'),
});

export const createDeviceSchema = z.object({
  name: z.string().min(1, 'Name required').max(60),
  type: z.enum(['pc', 'console', 'vr']).default('pc'),
  hourly_rate: z.number().nonnegative().default(0),
  specs: z.record(z.unknown()).optional(),
});

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  type: z.enum(['pc', 'console', 'vr']).optional(),
  status: z.enum(['available', 'in_use', 'reserved', 'offline']).optional(),
  hourly_rate: z.number().nonnegative().optional(),
  specs: z.record(z.unknown()).optional(),
});

export const startSessionSchema = z.object({
  device_id: z.string().uuid('Valid device_id required'),
  customer_id: z.string().uuid().optional().nullable(),
  customer_username: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric and underscores only, no spaces').min(1).max(60).optional().nullable(),
  customer_name: z.string().min(1).max(120).optional(),
  customer_phone: z.string().max(40).optional(),
  session_type: z.enum(['open', 'fixed']).default('open'),
  started_at: z.string().optional(),
  scheduled_end: z.string().optional(),
  hourly_rate_override: z.number().nonnegative().optional().nullable(),
  grace_period_minutes: z.number().int().nonnegative().default(0),
});

export const endSessionSchema = z.object({
  payment_method: z.enum(['cash', 'card', 'transfer', 'wallet']).optional(),
  mark_paid: z.boolean().optional(),
  ended_at: z.string().optional(),
});

export const extendSessionSchema = z.object({
  additional_minutes: z.number().int().positive('Must extend by at least 1 minute'),
});

export const updateSessionSchema = z.object({
  started_at: z.string().optional(),
  scheduled_end: z.string().optional().nullable(),
  hourly_rate_override: z.number().nonnegative().optional().nullable(),
  grace_period_minutes: z.number().int().nonnegative().optional(),
});

export const payInvoiceSchema = z.object({
  payment_method: z.enum(['cash', 'card', 'transfer', 'wallet']).optional(),
});

export const createReservationSchema = z.object({
  device_id: z.string().uuid('Valid device_id required'),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().min(1).max(120).optional(),
  reserved_from: z.string(),
  reserved_until: z.string(),
  notes: z.string().max(500).optional(),
});

export const updateReservationSchema = z.object({
  status: z.enum(['pending', 'active', 'cancelled', 'completed']).optional(),
  notes: z.string().max(500).optional(),
  reserved_from: z.string().optional(),
  reserved_until: z.string().optional(),
});
