import { Router } from 'express';
import { getPayrollSummary, getAllPayroll } from '../controllers/payrollController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole(['manager']), getAllPayroll);
router.get('/summary', requireRole(['manager']), getPayrollSummary);

export default router;
