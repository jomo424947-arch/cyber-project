import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes';
import deviceRoutes from './routes/devices.routes';
import sessionRoutes from './routes/sessions.routes';
import billingRoutes from './routes/billing.routes';
import reservationRoutes from './routes/reservations.routes';
import reportRoutes from './routes/reports.routes';
import customerRoutes from './routes/customers.routes';
import productRoutes from './routes/products.routes';
import pricingRoutes from './routes/pricing.routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { supabase } from './lib/supabase';
import { csrfProtection } from './middleware/csrf';

const app = express();
const PORT = process.env.PORT || 5000;
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// General API Rate Limiting to prevent DOS/brute-force
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      code: 'TOO_MANY_REQUESTS'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(cors({ origin, credentials: true }));
app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json());
app.use(apiLimiter);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health check.
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ccms-api' }));

// API route groups.
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/invoices', billingRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/pricing', pricingRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Supabase connection health-check.
 * Probes the `devices` table on startup and logs OK / FAILED so a misconfigured
 * DB is obvious immediately.
 */
async function checkSupabase() {
  const { error } = await supabase.from('devices').select('id').limit(1);
  console.log('[supabase] connection:', error ? 'FAILED — ' + error.message : 'OK');
  return !error;
}

app.listen(PORT, async () => {
  console.log(`\n  ⬡ CCMS API running → http://localhost:${PORT}`);
  console.log(`  CORS origin → ${origin}`);
  await checkSupabase();
  console.log('');
});
