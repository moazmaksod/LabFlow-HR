import { Router } from 'express';
import { createRequest, getRequests, updateRequestStatus } from '../controllers/requestController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);

// Both employees and managers can view their requests and create new ones
router.get('/', getRequests);
router.post('/', createRequest);

// Only managers can approve/reject requests
router.put('/:id/status', requireRole(['manager']), updateRequestStatus);

export default router;
