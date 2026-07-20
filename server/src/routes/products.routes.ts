import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { listProducts, createProduct, updateProduct, deleteProduct } from '../controllers/products.controller';
import { createProductSchema, updateProductSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listProducts));
router.post('/', validate(createProductSchema), asyncHandler(createProduct));
router.patch('/:id', validate(updateProductSchema), asyncHandler(updateProduct));
router.delete('/:id', asyncHandler(deleteProduct));

export default router;
