import { Router } from 'express';
import { getJobs, createJob, deleteJob } from '../controllers/jobController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.use(requireRole(['manager']));

router.get('/', getJobs);
router.post('/', createJob);
router.delete('/:id', deleteJob);

export default router;
