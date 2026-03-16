import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimiter';
import { checkUploadUsage } from '../middleware/planAccess';
import { upload } from '../utils/fileFilter';
import {
  uploadFile,
  uploadWebsite,
  uploadWebsiteValidation,
} from '../controllers/uploadController';

const router = Router();

// All upload routes require authentication
router.use(authenticate);
router.use(uploadLimiter);

// POST /api/upload/file  (documents + media)
router.post('/file', checkUploadUsage, upload.single('file'), uploadFile);

// POST /api/upload/website
router.post('/website', checkUploadUsage, uploadWebsiteValidation, uploadWebsite);

export default router;
