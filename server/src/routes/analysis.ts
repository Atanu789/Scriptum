import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { analysisLimiter } from '../middleware/rateLimiter';
import { requireFeature } from '../middleware/planAccess';
import {
  analyzeDocument,
  analyzeDocumentValidation,
  humanizeDetectedText,
} from '../controllers/analysisController';

const router = Router();

router.use(authenticate);
router.use(analysisLimiter);

// POST /api/analyze/:id
// Note: CSRF protection should be implemented at the app level (e.g., csurf middleware)
// or via SameSite cookie attributes + custom headers for API requests
router.post('/:id', analyzeDocumentValidation, analyzeDocument);
router.post('/:id/humanize', requireFeature('humanizeText'), analyzeDocumentValidation, humanizeDetectedText);

export default router;
