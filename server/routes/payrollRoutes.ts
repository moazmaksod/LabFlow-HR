import { Router } from 'express';
import { getPayrollSummary } from '../controllers/payrollController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.get('/summary', requireRole(['manager']), getPayrollSummary);

export default router;
