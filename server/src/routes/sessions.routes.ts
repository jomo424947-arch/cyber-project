import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { 
  listSessions, 
  startSession, 
  endSession, 
  editSession, 
  extendSession, 
  getSessionAuditLogs,
  addSessionOrder,
  listSessionOrders
} from '../controllers/sessions.controller';
import { 
  startSessionSchema, 
  endSessionSchema, 
  extendSessionSchema, 
  updateSessionSchema,
  addSessionOrderSchema
} from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listSessions));
router.post('/', validate(startSessionSchema), asyncHandler(startSession));
router.post('/start', validate(startSessionSchema), asyncHandler(startSession)); // backward compatibility alias
router.patch('/:id', validate(updateSessionSchema), asyncHandler(editSession));
router.post('/:id/extend', validate(extendSessionSchema), asyncHandler(extendSession));
router.post('/:id/end', validate(endSessionSchema), asyncHandler(endSession));
router.get('/:id/audit-logs', asyncHandler(getSessionAuditLogs));

// Café orders endpoints
router.post('/:id/orders', validate(addSessionOrderSchema), asyncHandler(addSessionOrder));
router.get('/:id/orders', asyncHandler(listSessionOrders));

export default router;
