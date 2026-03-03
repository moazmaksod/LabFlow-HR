import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get settings (authenticated users can read)
router.get('/', authenticate, getSettings);

// Update settings (only managers can update)
router.put('/', authenticate, requireRole(['manager']), updateSettings);

export default router;
