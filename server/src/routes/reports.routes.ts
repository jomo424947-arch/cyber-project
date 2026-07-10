import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { revenueReport, usageReport } from '../controllers/reports.controller';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/revenue', asyncHandler(revenueReport));
router.get('/usage', asyncHandler(usageReport));

export default router;
