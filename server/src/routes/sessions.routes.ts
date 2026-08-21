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
  voidSessionOrder,
  listSessionOrders,
  pauseSession,
  resumeSession,
  listSessionPauses,
  transferSession,
  listSessionTransfers,
} from '../controllers/sessions.controller';
import { 
  startSessionSchema, 
  endSessionSchema, 
  extendSessionSchema, 
  updateSessionSchema,
  addSessionOrderSchema,
  pauseSessionSchema,
  transferSessionSchema,
} from '../controllers/schemas';
import { validate } from '../middleware/validate';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.use(verifyJWT);

router.get('/', asyncHandler(listSessions));
router.post('/', validate(startSessionSchema), asyncHandler(startSession));
router.post('/start', validate(startSessionSchema), asyncHandler(startSession)); // backward compatibility alias
router.patch('/:id', validate(updateSessionSchema), asyncHandler(editSession));
router.post('/:id/transfer', validate(transferSessionSchema), asyncHandler(transferSession));
router.get('/:id/transfers', asyncHandler(listSessionTransfers));
router.post('/:id/pause', validate(pauseSessionSchema), asyncHandler(pauseSession));
router.post('/:id/resume', asyncHandler(resumeSession));
router.get('/:id/pauses', asyncHandler(listSessionPauses));
router.post('/:id/extend', validate(extendSessionSchema), asyncHandler(extendSession));
router.post('/:id/end', validate(endSessionSchema), asyncHandler(endSession));
router.get('/:id/audit-logs', asyncHandler(getSessionAuditLogs));

// Café orders endpoints
router.post('/:id/orders', validate(addSessionOrderSchema), asyncHandler(addSessionOrder));
router.get('/:id/orders', asyncHandler(listSessionOrders));
router.delete('/:id/orders/:orderId', asyncHandler(voidSessionOrder));

export default router;
