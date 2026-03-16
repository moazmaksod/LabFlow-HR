import express from 'express';
import { getAuditLogs } from '../controllers/auditController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Only managers can view audit logs
router.get('/', authenticate, requireRole(['manager']), getAuditLogs);

export default router;
