import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listShifts,
  getActiveShift,
  startShift,
  closeShift,
  getShiftSummary,
  listAllExpenses,
  listShiftExpenses,
  createShiftExpense,
  createQuickExpense,
  deleteShiftExpense,
} from '../controllers/shifts.controller';
import {
  startShiftSchema,
  closeShiftSchema,
  createExpenseSchema,
} from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

// All shift endpoints require authentication
router.use(verifyJWT);

// Expense routes (defined before parameterized routes)
router.get('/expenses', asyncHandler(listAllExpenses));
router.post('/expenses', validate(createExpenseSchema), asyncHandler(createQuickExpense));

// Shift core routes
router.get('/', asyncHandler(listShifts));
router.get('/active', asyncHandler(getActiveShift));
router.post('/start', validate(startShiftSchema), asyncHandler(startShift));
router.post('/:id/close', validate(closeShiftSchema), asyncHandler(closeShift));
router.get('/:id/summary', asyncHandler(getShiftSummary));

// Shift-specific expenses
router.get('/:id/expenses', asyncHandler(listShiftExpenses));
router.post('/:id/expenses', validate(createExpenseSchema), asyncHandler(createShiftExpense));
router.delete('/:id/expenses/:expenseId', asyncHandler(deleteShiftExpense));

export default router;
