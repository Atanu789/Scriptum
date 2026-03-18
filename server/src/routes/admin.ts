import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticateAdmin } from '../middleware/adminAuth';
import { requireAdminActionKey } from '../middleware/adminActionGuard';
import {
  adminLogin,
  adminLoginValidation,
  listUsers,
  listUsersValidation,
  getOverview,
  getAuditLogs,
  patchUser,
  patchUserValidation,
  deleteUserByAdmin,
  deleteUserValidation,
} from '../controllers/adminController';

const router = Router();

router.post('/login', authLimiter, adminLoginValidation, adminLogin);

router.use(authenticateAdmin);

router.get('/overview', getOverview);
router.get('/audit-logs', getAuditLogs);
router.get('/users', listUsersValidation, listUsers);
router.patch('/users/:id', requireAdminActionKey, patchUserValidation, patchUser);
router.delete('/users/:id', requireAdminActionKey, deleteUserValidation, deleteUserByAdmin);

export default router;
