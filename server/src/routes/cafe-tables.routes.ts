import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listCafeTables,
  createCafeTable,
  updateCafeTable,
  deleteCafeTable,
} from '../controllers/cafe-tables.controller';
import { createCafeTableSchema, updateCafeTableSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listCafeTables));
router.post('/', validate(createCafeTableSchema), asyncHandler(createCafeTable));
router.patch('/:id', validate(updateCafeTableSchema), asyncHandler(updateCafeTable));
router.delete('/:id', asyncHandler(deleteCafeTable));

export default router;
