import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getHumanizerProcessResult,
  getHumanizerPlans,
  listHumanizerHistory,
  processHumanizerText,
  saveHumanizerVersion,
} from '../controllers/humanizerController';

const router = Router();

router.use(authenticate);

router.get('/plans', getHumanizerPlans);
router.get('/history', listHumanizerHistory);
router.post('/process', processHumanizerText);
router.get('/process/:jobId', getHumanizerProcessResult);
router.post('/save', saveHumanizerVersion);

export default router;
