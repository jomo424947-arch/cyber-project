import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductSalesReport,
  adjustProductStock,
  getProductStockLogs,
  createStandaloneSale,
} from '../controllers/products.controller';
import {
  createProductSchema,
  updateProductSchema,
  adjustStockSchema,
  createStandaloneSaleSchema,
} from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT, requireRole } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listProducts));
router.get('/sales-report', asyncHandler(getProductSalesReport));
router.post('/standalone-sale', validate(createStandaloneSaleSchema), asyncHandler(createStandaloneSale));
router.post('/', requireRole('admin'), validate(createProductSchema), asyncHandler(createProduct));
router.patch('/:id', requireRole('admin'), validate(updateProductSchema), asyncHandler(updateProduct));
router.post('/:id/adjust-stock', validate(adjustStockSchema), asyncHandler(adjustProductStock));
router.get('/:id/stock-logs', asyncHandler(getProductStockLogs));
router.delete('/:id', requireRole('admin'), asyncHandler(deleteProduct));

export default router;
