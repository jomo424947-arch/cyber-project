import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { listInvoices, payInvoice } from '../controllers/billing.controller';
import { payInvoiceSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listInvoices));
router.patch('/:id/pay', validate(payInvoiceSchema), asyncHandler(payInvoice));

export default router;
