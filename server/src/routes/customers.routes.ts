import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { getLeaderboard, getCustomerProfile } from '../controllers/customers.controller';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/leaderboard', asyncHandler(getLeaderboard));
router.get('/:id/profile', asyncHandler(getCustomerProfile));

export default router;
