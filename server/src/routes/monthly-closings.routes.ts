import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listMonths,
  getMonthDetails,
  closeMonth,
  reopenMonth,
} from '../controllers/monthly-closings.controller';
import { closeMonthSchema, reopenMonthSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT, requireRole } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

// List of available financial months & status
router.get('/', asyncHandler(listMonths));

// Detailed statement and daily ledger for a specific month
router.get('/:year/:month', asyncHandler(getMonthDetails));

// Finalize and close the month (Admin only)
router.post(
  '/:year/:month/close',
  requireRole('admin'),
  validate(closeMonthSchema),
  asyncHandler(closeMonth)
);

// Reopen a closed month (Admin only)
router.post(
  '/:year/:month/reopen',
  requireRole('admin'),
  validate(reopenMonthSchema),
  asyncHandler(reopenMonth)
);

export default router;

