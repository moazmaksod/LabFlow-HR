import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { getSettings, updateSettings, uploadLogo } from '../controllers/settingsController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';
import fs from 'fs';

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = 'public/uploads/logos/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed.'));
        }
    }
});

// Get settings (authenticated users can read)
router.get('/', authenticate, getSettings);

// Update settings (only managers can update)
router.put('/', authenticate, requireRole(['manager']), updateSettings);

// Upload company logo
router.post('/logo', authenticate, requireRole(['manager']), upload.single('logo'), uploadLogo);

export default router;
