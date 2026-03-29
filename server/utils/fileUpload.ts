import multer from 'multer';

export const imageFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Restrict MIME types to standard images only
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, WEBP) are allowed.'));
    }
};

export const imageUploadLimits = {
    fileSize: 5 * 1024 * 1024 // 5MB limit
};
