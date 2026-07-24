import express from 'express';
import { uploadImage } from '../controllers/upload.controller.js';
import { imageUpload, uploadRateLimiter } from '../middleware/upload.middleware.js';

const router = express.Router();

// POST /v1/uploads/image?folder=food/users/profile
// multipart field: file (required)
router.post(
    '/image',
    uploadRateLimiter,
    imageUpload.single('file'),
    uploadImage
);

export default router;
