import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
} from '../controllers/rooms.controller';
import { createRoomSchema, updateRoomSchema } from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

// All routes require authentication.
router.use(verifyJWT);

router.get('/', asyncHandler(listRooms));
router.post('/', validate(createRoomSchema), asyncHandler(createRoom));
router.patch('/:id', validate(updateRoomSchema), asyncHandler(updateRoom));
router.delete('/:id', asyncHandler(deleteRoom));

export default router;
