import { Router } from 'express';
import { clockAttendance, syncOfflineLogs, getAttendanceLogs, getAttendanceStats, getMyLogs, stepAway, resumeWork } from '../controllers/attendanceController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();


router.get('/server-time', (req, res) => {
    const timezone = process.env.APP_TIMEZONE!;
    res.json({ serverTime: new Date().toISOString(), timezone });
});

router.use(authenticate);

// Employee & Manager routes
router.post('/clock', requireRole(['employee', 'manager']), clockAttendance);
router.post('/sync', requireRole(['employee', 'manager']), syncOfflineLogs);
router.get('/my-logs', requireRole(['employee', 'manager']), getMyLogs);
router.post('/step-away', requireRole(['employee', 'manager']), stepAway);
router.post('/resume-work', requireRole(['employee', 'manager']), resumeWork);

// Manager only routes
router.get('/', requireRole(['manager']), getAttendanceLogs);
router.get('/stats', requireRole(['manager']), getAttendanceStats);

export default router;
