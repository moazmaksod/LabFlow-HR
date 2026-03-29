import { Router } from 'express';
import { getUsers, updateUserRole, updateProfile, uploadAvatar, getProfile, getUserById, updateUserProfile, resetDevice } from '../controllers/userController.js';
import { authenticate, requireRole } from '../middlewares/authMiddleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

import { imageFileFilter, imageUploadLimits } from '../utils/fileUpload.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: imageUploadLimits,
  fileFilter: imageFileFilter
});

router.use(authenticate);

// Profile routes (Any authenticated user)
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/upload-avatar', (req, res, next) => {
    upload.single('avatar')(req, res, (err: any) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, uploadAvatar);

// Admin/Manager routes
router.get('/', requireRole(['manager']), getUsers);
router.get('/:id', requireRole(['manager']), getUserById);
router.put('/:id/role', requireRole(['manager']), updateUserRole);
router.put('/:id/profile', requireRole(['manager']), updateUserProfile);
router.put('/:id/reset-device', requireRole(['manager']), resetDevice);

export default router;
