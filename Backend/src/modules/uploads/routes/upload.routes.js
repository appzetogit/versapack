import express from 'express';
import { uploadImage } from '../controllers/upload.controller.js';
import { imageUpload, uploadRateLimiter } from '../middleware/upload.middleware.js';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';

const router = express.Router();

// POST /v1/uploads/image?folder=food/users/profile
// multipart field: file (required)
//
// authMiddleware is deliberately the FIRST thing after the rate limiter and ahead of
// multer: the route was previously open to anyone, which made it free anonymous
// storage on the VPS disk, and running the parser first would still spend the disk
// write and the Sharp re-encode before the request was rejected.
//
// Every live caller is already behind a login. Seller onboarding looks like a
// counter-example — it is the one pre-login page that imports the uploader — but its
// two upload helpers (resolveImageForProfileUpdate / resolveMenuImagesForProfileUpdate)
// are dead code, never called from anywhere in the component. The pre-login flows that
// genuinely move files use their own routes: restaurant `/upload-attachment` and the
// multipart `/register`, neither of which touches this one.
router.post(
    '/image',
    uploadRateLimiter,
    authMiddleware,
    imageUpload.single('file'),
    uploadImage
);

export default router;
