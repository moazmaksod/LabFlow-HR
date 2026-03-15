import { Router } from 'express';
import { getPayrollSummary, getAllPayroll, generateDraftPayroll, getPayrolls, getPayrollTransactions } from '../controllers/payrollController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole(['manager']), getAllPayroll);
router.get('/summary', requireRole(['manager']), getPayrollSummary);

// New persistent payroll endpoints
router.post('/generate', requireRole(['manager']), generateDraftPayroll);
router.get('/records', requireRole(['manager']), getPayrolls);
router.get('/records/:payroll_id/transactions', requireRole(['manager']), getPayrollTransactions);

export default router;
