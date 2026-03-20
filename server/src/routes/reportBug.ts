import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter';
import { reportBug, reportBugValidation } from '../controllers/bugReportController';

const router = Router();

router.post('/', authLimiter, reportBugValidation, reportBug);

export default router;
