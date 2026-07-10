import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listReservations,
  createReservation,
  updateReservation,
} from '../controllers/reservations.controller';
import { createReservationSchema, updateReservationSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listReservations));
router.post('/', validate(createReservationSchema), asyncHandler(createReservation));
router.patch('/:id', validate(updateReservationSchema), asyncHandler(updateReservation));

export default router;
