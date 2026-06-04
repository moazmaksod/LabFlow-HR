import { Router } from 'express';
import { 
    recalculateDailyAttendance, 
    getPayrollSummary, 
    getAllPayroll, 
    getPayrolls, 
    getPayrollDetails, 
    recordPayment, 
    getMyPayrolls 
} from '../controllers/payrollController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole(['manager']), getAllPayroll);
router.get('/summary', requireRole(['manager']), getPayrollSummary);

// Manager endpoints
router.post('/recalculate-daily', requireRole(['manager']), recalculateDailyAttendance);
router.get('/records', requireRole(['manager']), getPayrolls);
router.get('/records/:user_id/details', requireRole(['manager']), getPayrollDetails);
router.post('/records/pay', requireRole(['manager']), recordPayment);

// Employee endpoints
router.get('/my-records', getMyPayrolls);

export default router;
