import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticateAdmin } from '../middleware/adminAuth';
import {
  adminLogin,
  adminLoginValidation,
  changeAdminPassword,
  changeAdminPasswordValidation,
  verifyManagementAccess,
  listUsers,
  listUsersValidation,
  getMetrics,
  getRevenue,
  getOverview,
  getPricingConfig,
  updatePricingConfig,
  updatePricingValidation,
  listDiscountRequests,
  updateDiscountRequest,
  updateDiscountRequestValidation,
  getAuditLogs,
  getAuditLogsValidation,
  patchUser,
  patchUserValidation,
  deleteUserByAdmin,
  deleteUserValidation,
} from '../controllers/adminController';

const router = Router();

router.post('/login', authLimiter, adminLoginValidation, adminLogin);
router.post('/change-password', authLimiter, changeAdminPasswordValidation, changeAdminPassword);
router.get('/verify-management-access', authLimiter, verifyManagementAccess);

router.use(authenticateAdmin);

router.get('/metrics', getMetrics);
router.get('/revenue', getRevenue);
router.get('/overview', getOverview);
router.get('/pricing', getPricingConfig);
router.patch('/pricing/:planId', updatePricingValidation, updatePricingConfig);
router.get('/discount-requests', listDiscountRequests);
router.patch('/discount-requests/:id', updateDiscountRequestValidation, updateDiscountRequest);
router.get('/audit-logs', getAuditLogsValidation, getAuditLogs);
router.get('/users', listUsersValidation, listUsers);
router.patch('/users/:id', patchUserValidation, patchUser);
router.delete('/users/:id', deleteUserValidation, deleteUserByAdmin);

export default router;
