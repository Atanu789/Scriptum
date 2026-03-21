import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { analysisLimiter } from '../middleware/rateLimiter';
import { checkAIUsage, requireFeature } from '../middleware/planAccess';
import {
  analyzeDocument,
  analyzeDocumentValidation,
  generateAbstract,
  getDocumentHumanizeJob,
  humanizeDetectedText,
} from '../controllers/analysisController';

const router = Router();

router.use(authenticate);
router.use(analysisLimiter);

// POST /api/analyze/:id
// Note: CSRF protection should be implemented at the app level (e.g., csurf middleware)
// or via SameSite cookie attributes + custom headers for API requests
router.post('/:id', checkAIUsage, analyzeDocumentValidation, analyzeDocument);
router.post('/:id/humanize', checkAIUsage, requireFeature('humanizeText'), analyzeDocumentValidation, humanizeDetectedText);
router.get('/:id/humanize/:jobId', analyzeDocumentValidation, getDocumentHumanizeJob);
router.post('/:id/abstract', checkAIUsage, analyzeDocumentValidation, generateAbstract);

export default router;
