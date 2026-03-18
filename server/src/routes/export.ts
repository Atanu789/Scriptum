import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { generalLimiter } from '../middleware/rateLimiter';
import { checkExportAccess } from '../middleware/planAccess';
import {
  exportPpt,
  exportPptValidation,
  exportPdf,
  exportPdfValidation,
  exportDocx,
  exportDocxValidation,
  exportVideo,
} from '../controllers/exportController';

const router = Router();

router.use(authenticate);
router.use(generalLimiter);

// POST /api/export/ppt
router.post('/ppt', checkExportAccess, exportPptValidation, exportPpt);

// POST /api/export/pdf
router.post('/pdf', checkExportAccess, exportPdfValidation, exportPdf);

// POST /api/export/docx
router.post('/docx', checkExportAccess, exportDocxValidation, exportDocx);

// POST /api/export/video
router.post('/video', exportVideo);

export default router;
