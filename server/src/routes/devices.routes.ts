import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listDevices,
  createDevice,
  updateDevice,
  deleteDevice,
} from '../controllers/devices.controller';
import { createDeviceSchema, updateDeviceSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { requireRole, verifyJWT } from '../middleware/auth';

const router = Router();

// All routes require auth.
router.use(verifyJWT);

router.get('/', asyncHandler(listDevices));
router.post('/', requireRole('admin'), validate(createDeviceSchema), asyncHandler(createDevice));
router.patch('/:id', requireRole('admin'), validate(updateDeviceSchema), asyncHandler(updateDevice));
router.delete('/:id', requireRole('admin'), asyncHandler(deleteDevice));

export default router;
