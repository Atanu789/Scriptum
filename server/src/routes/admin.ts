import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticateAdmin } from '../middleware/adminAuth';
import {
  adminLogin,
  adminLoginValidation,
  listUsers,
  listUsersValidation,
  getMetrics,
  getRevenue,
  getOverview,
  getAuditLogs,
  getAuditLogsValidation,
  patchUser,
  patchUserValidation,
  deleteUserByAdmin,
  deleteUserValidation,
} from '../controllers/adminController';

const router = Router();

router.post('/login', authLimiter, adminLoginValidation, adminLogin);

router.use(authenticateAdmin);

router.get('/metrics', getMetrics);
router.get('/revenue', getRevenue);
router.get('/overview', getOverview);
router.get('/audit-logs', getAuditLogsValidation, getAuditLogs);
router.get('/users', listUsersValidation, listUsers);
router.patch('/users/:id', patchUserValidation, patchUser);
router.delete('/users/:id', deleteUserValidation, deleteUserByAdmin);

export default router;
