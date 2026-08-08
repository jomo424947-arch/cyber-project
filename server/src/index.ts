import dotenv from 'dotenv';
import path from 'path';

// Load env variables from multiple locations to handle different execution cwd environments
dotenv.config(); // CWD
dotenv.config({ path: path.join(__dirname, '.env') }); // same directory (for packaged Electron)
dotenv.config({ path: path.join(__dirname, '../.env') }); // server/.env
dotenv.config({ path: path.join(__dirname, '../../.env') }); // workspace root/.env

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';

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
import employeeRoutes from './routes/employees.routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { supabase } from './lib/supabase';
import { csrfProtection } from './middleware/csrf';
import { initDatabase, startAutoSave } from './lib/database';
import { hashPassword } from './lib/local-auth';
import { startSyncEngine } from './lib/sync-engine';
import { licenseCheck } from './middleware/license';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = [origin, 'http://localhost:5173', 'http://localhost:3000', 'file://', 'null'];

// General API Rate Limiting to prevent DOS/brute-force
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
  skip: () => process.env.NODE_ENV !== 'production', // no limit in dev
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      code: 'TOO_MANY_REQUESTS'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 login attempts per 15 minutes
  message: {
    error: {
      message: 'Too many authentication attempts, please try again later.',
      code: 'TOO_MANY_LOGIN_REQUESTS'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (requestOrigin, callback) => {
    if (!requestOrigin || allowedOrigins.includes(requestOrigin) || requestOrigin.startsWith('file://')) {
      callback(null, true);
    } else if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json());
app.use('/api/auth/login', authLimiter);
app.use(apiLimiter);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(licenseCheck);

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
app.use('/api/employees', employeeRoutes);

// Serve Static Frontend if compiled client/dist exists
let clientDistPath = path.resolve(__dirname, '../../client/dist');
if (!fs.existsSync(clientDistPath)) {
  clientDistPath = path.resolve(__dirname, '../../../dist');
}
if (!fs.existsSync(clientDistPath)) {
  clientDistPath = path.resolve(__dirname, '../../dist');
}

if (fs.existsSync(clientDistPath)) {
  console.log(`[server] Serving static client files from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    } else {
      next();
    }
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  // Initialize offline SQLite DB
  await initDatabase();
  startAutoSave(5000); // Save to disk every 5 seconds
  startSyncEngine(30000); // Run background Sync Engine every 30 seconds

  app.listen(PORT, () => {
    console.log(`\n  ⬡ CCMS Offline API running → http://localhost:${PORT}`);
    console.log(`  CORS origin → ${origin}\n`);
  });
}

startServer().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

