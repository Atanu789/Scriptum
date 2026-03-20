import { Router } from 'express';
import {
  register,
  registerValidation,
  login,
  loginValidation,
  googleAuth,
  googleAuthValidation,
  getMe,
  forgotPassword,
  forgotPasswordValidation,
  resetPassword,
  resetPasswordValidation,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authLimiter, registerValidation, register);
router.post('/login', authLimiter, loginValidation, login);
router.post('/google', authLimiter, googleAuthValidation, googleAuth);
router.post('/forgot-password', authLimiter, forgotPasswordValidation, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidation, resetPassword);
router.get('/me', authenticate, getMe);

export default router;
