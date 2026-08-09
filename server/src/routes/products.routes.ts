import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { listProducts, createProduct, updateProduct, deleteProduct, getProductSalesReport } from '../controllers/products.controller';
import { createProductSchema, updateProductSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT, requireRole } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listProducts));
router.get('/sales-report', asyncHandler(getProductSalesReport));
router.post('/', requireRole('admin'), validate(createProductSchema), asyncHandler(createProduct));
router.patch('/:id', requireRole('admin'), validate(updateProductSchema), asyncHandler(updateProduct));
router.delete('/:id', requireRole('admin'), asyncHandler(deleteProduct));

export default router;
