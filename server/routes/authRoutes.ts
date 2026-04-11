import { Router } from 'express';
import { register, login, logout, resetAdminDeviceID } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
// 🛡️ SECURITY: Rate limiters prevent brute force and account flooding attacks
import { loginRateLimiter, registerRateLimiter } from '../middlewares/rateLimitMiddleware.js';

const router = Router();

// Apply rate limiting BEFORE the handler to block excess requests early
router.post('/register', registerRateLimiter, register);
router.post('/login', loginRateLimiter, login);
router.post('/logout', authenticate, logout);
router.post('/reset-device', authenticate, resetAdminDeviceID);

export default router;
