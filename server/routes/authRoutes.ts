import { Router } from 'express';
import { register, login, logout, resetAdminDeviceID } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/reset-device', authenticate, resetAdminDeviceID);

export default router;
