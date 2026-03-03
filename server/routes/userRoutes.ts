import { Router } from 'express';
import { getUsers, updateUserRole } from '../controllers/userController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.use(requireRole(['manager']));

router.get('/', getUsers);
router.put('/:id/role', updateUserRole);

export default router;
