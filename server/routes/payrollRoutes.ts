import { Router } from 'express';
import { getPayroll } from '../controllers/payrollController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole(['manager']), getPayroll);

export default router;
