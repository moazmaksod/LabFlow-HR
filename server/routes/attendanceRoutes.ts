import { Router } from 'express';
import { clockAttendance, syncOfflineLogs } from '../controllers/attendanceController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.use(requireRole(['employee', 'manager']));

router.post('/clock', clockAttendance);
router.post('/sync', syncOfflineLogs);

export default router;
