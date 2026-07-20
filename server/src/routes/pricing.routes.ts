import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { getPricing, updateBulkPricing, updateDevicePricing } from '../controllers/pricing.controller';
import { verifyJWT, requireRole } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(getPricing));
router.patch('/bulk', requireRole('admin'), asyncHandler(updateBulkPricing));
router.patch('/device/:id', requireRole('admin'), asyncHandler(updateDevicePricing));

export default router;
