import { Router } from 'express';
import { getJobs, createJob } from '../controllers/jobController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.use(requireRole(['manager']));

router.get('/', getJobs);
router.post('/', createJob);

export default router;
