import { Router } from 'express';
import { getPayrollSummary, getAllPayroll, generateDraftPayroll, getPayrolls, getPayrollTransactions, updatePayrollStatus, getMyPayrolls, getMyPayrollTransactions } from '../controllers/payrollController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole(['manager']), getAllPayroll);
router.get('/summary', requireRole(['manager']), getPayrollSummary);

// New persistent payroll endpoints
router.post('/generate', requireRole(['manager']), generateDraftPayroll);
router.get('/records', requireRole(['manager']), getPayrolls);
router.get('/records/:payroll_id/transactions', requireRole(['manager']), getPayrollTransactions);
router.put('/records/:id/status', requireRole(['manager']), updatePayrollStatus);

// Employee endpoints
router.get('/my-records', getMyPayrolls);
router.get('/my-records/:payroll_id/transactions', getMyPayrollTransactions);

export default router;
