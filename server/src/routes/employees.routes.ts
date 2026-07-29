import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from '../controllers/employees.controller';
import { requireRole, verifyJWT } from '../middleware/auth';

const router = Router();

// All routes require auth and admin role
router.use(verifyJWT);
router.use(requireRole('admin'));

router.get('/', asyncHandler(listEmployees));
router.post('/', asyncHandler(createEmployee));
router.patch('/:id', asyncHandler(updateEmployee));
router.delete('/:id', asyncHandler(deleteEmployee));

export default router;
