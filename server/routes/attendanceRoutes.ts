import { Router } from 'express';
import { clockAttendance, syncOfflineLogs, getAttendanceLogs, getAttendanceStats } from '../controllers/attendanceController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);

// Employee & Manager routes
router.post('/clock', requireRole(['employee', 'manager']), clockAttendance);
router.post('/sync', requireRole(['employee', 'manager']), syncOfflineLogs);

// Manager only routes
router.get('/', requireRole(['manager']), getAttendanceLogs);
router.get('/stats', requireRole(['manager']), getAttendanceStats);

export default router;
